import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Chapter, Project } from '../models/index.js';
import { requireAuth } from './_auth.js';
import { enqueueAnalysis } from '../services/analysisQueue.js';

const createSchema = z.object({
  projectId: z.string().length(24),
  parentId: z.string().length(24).nullable().optional(),
  kind: z.enum(['tome', 'part', 'chapter']).default('chapter'),
  title: z.string().min(1).max(300),
  order: z.number().int().min(0),
  content: z.string().default(''),
});

const updateContentSchema = z.object({
  content: z.string(),
});

const updateMetaSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  status: z.enum(['outline', 'draft', 'revised', 'done']).optional(),
  order: z.number().int().min(0).optional(),
  parentId: z.string().length(24).nullable().optional(),
});

export async function chapterRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

  // Helper to verify the chapter belongs to the user
  async function ensureOwned(req: { userId: string }, chapterId: string) {
    const chapter = await Chapter.findById(chapterId);
    if (!chapter) return null;
    const proj = await Project.findOne({ _id: chapter.projectId, userId: req.userId });
    if (!proj) return null;
    return chapter;
  }

  // List chapters of a project (tree-shaped)
  app.get('/projects/:projectId/chapters', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const proj = await Project.findOne({ _id: projectId, userId: req.userId });
    if (!proj) return reply.code(404).send({ error: 'Project not found' });

    const chapters = await Chapter.find({ projectId })
      .select('-content') // don't ship full text on list calls
      .sort({ order: 1 })
      .lean();
    return { chapters };
  });

  // Create chapter
  app.post('/chapters', async (req, reply) => {
    const body = createSchema.parse(req.body);
    const proj = await Project.findOne({ _id: body.projectId, userId: req.userId });
    if (!proj) return reply.code(404).send({ error: 'Project not found' });

    const chapter = await Chapter.create({
      ...body,
      wordCount: countWords(body.content),
    });

    if (body.content.trim().length > 0) enqueueAnalysis(String(chapter._id));

    reply.code(201);
    return { chapter };
  });

  // Read chapter (with content)
  app.get('/chapters/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const chapter = await ensureOwned(req, id);
    if (!chapter) return reply.code(404).send({ error: 'Chapter not found' });
    return { chapter };
  });

  // Save chapter content (the hot path)
  app.put('/chapters/:id/content', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { content } = updateContentSchema.parse(req.body);
    const chapter = await ensureOwned(req, id);
    if (!chapter) return reply.code(404).send({ error: 'Chapter not found' });

    chapter.content = content;
    chapter.wordCount = countWords(content);
    chapter.analysisVersion += 1;
    await chapter.save();

    enqueueAnalysis(id);

    return { savedAt: new Date(), wordCount: chapter.wordCount, analysisVersion: chapter.analysisVersion };
  });

  // Update chapter metadata (title, order, status…)
  app.patch('/chapters/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateMetaSchema.parse(req.body);
    const chapter = await ensureOwned(req, id);
    if (!chapter) return reply.code(404).send({ error: 'Chapter not found' });
    Object.assign(chapter, body);
    await chapter.save();
    return { chapter };
  });

  app.delete('/chapters/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const chapter = await ensureOwned(req, id);
    if (!chapter) return reply.code(404).send({ error: 'Chapter not found' });
    await chapter.deleteOne();
    // Note: orphaned attributes will be ignored when the bible summary is built
    // since they reference a chapter that no longer exists. A periodic
    // garbage-collection job (cleanupOrphanedAttributes) can clean them up.
    reply.code(204);
  });
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
