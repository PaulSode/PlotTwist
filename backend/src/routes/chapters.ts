import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Chapter, Project } from '../models/index.js';
import { requireAuth } from './_auth.js';
import { startSSE } from './_sse.js';
import { analyzeChapter, cleanupChapterData } from '../services/bibleService.js';

// Guards against two overlapping analyses of the same chapter (e.g. two tabs).
const inFlightAnalyses = new Set<string>();

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

    // Analysis is manual (the "Analyser le chapitre" button) — we don't run the
    // expensive AI pipeline automatically on create.

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

    // Only bump the analysis version when the text actually changed. A redundant
    // save with identical content must not resurface a spurious "not analyzed"
    // state (and we never auto-analyze here — the author triggers it to control
    // cost). Saving text stays free.
    const changed = chapter.content !== content;
    chapter.content = content;
    chapter.wordCount = countWords(content);
    if (changed) chapter.analysisVersion += 1;
    await chapter.save();

    return { savedAt: new Date(), wordCount: chapter.wordCount, analysisVersion: chapter.analysisVersion };
  });

  // Manually trigger the AI analysis pipeline for a chapter.
  // Streams live progress as Server-Sent Events so the editor can drive a stepper:
  //   event: step  { step, index, total }   — emitted at the start of each phase
  //   event: done  {}                        — pipeline finished
  //   event: error { message }               — pipeline failed
  app.post('/chapters/:id/analyze', async (req, reply) => {
    const { id } = req.params as { id: string };
    const chapter = await ensureOwned(req, id);
    if (!chapter) return reply.code(404).send({ error: 'Chapter not found' });

    const sse = startSSE(req, reply);

    if (inFlightAnalyses.has(id)) {
      sse.write('error', { message: 'Une analyse est déjà en cours pour ce chapitre.' });
      sse.end();
      return;
    }

    inFlightAnalyses.add(id);
    try {
      await analyzeChapter(id, {
        onProgress: (p) => sse.write('step', p),
      });
      sse.write('done', {});
    } catch (err) {
      req.log.error({ err }, 'Chapter analysis failed');
      sse.write('error', { message: "L'analyse a échoué." });
    } finally {
      inFlightAnalyses.delete(id);
      sse.end();
    }
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
    const projectId = String(chapter.projectId);
    await chapter.deleteOne();
    // Remove everything this chapter contributed to the bible (attributes,
    // appearances, events, relationship evolutions, chunks, inconsistencies)
    // so nothing orphaned lingers in the dashboards or the RAG index.
    try {
      await cleanupChapterData(projectId, id);
    } catch (err) {
      req.log.error({ err }, 'cleanupChapterData failed after chapter delete');
    }
    reply.code(204);
  });
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
