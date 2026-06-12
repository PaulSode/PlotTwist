import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Project } from '../models/index.js';
import { requireAuth } from './_auth.js';
import { cleanupProjectData } from '../services/bibleService.js';

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  language: z.string().length(2).optional(),
  genre: z.string().max(50).optional(),
});

export async function projectRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

  app.get('/projects', async (req) => {
    const projects = await Project.find({ userId: req.userId })
      .sort({ updatedAt: -1 })
      .lean();
    return { projects };
  });

  app.post('/projects', async (req, reply) => {
    const body = createSchema.parse(req.body);
    const project = await Project.create({ ...body, userId: req.userId });
    reply.code(201);
    return { project };
  });

  app.get('/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const project = await Project.findOne({ _id: id, userId: req.userId }).lean();
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    return { project };
  });

  app.patch('/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = createSchema.partial().parse(req.body);
    const project = await Project.findOneAndUpdate(
      { _id: id, userId: req.userId },
      body,
      { new: true },
    );
    if (!project) return reply.code(404).send({ error: 'Project not found' });
    return { project };
  });

  app.delete('/projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = await Project.deleteOne({ _id: id, userId: req.userId });
    if (r.deletedCount === 0) return reply.code(404).send({ error: 'Project not found' });
    // Cascade: remove all chapters, entities, chunks, etc. for this project.
    try {
      await cleanupProjectData(id);
    } catch (err) {
      req.log.error({ err }, 'cleanupProjectData failed after project delete');
    }
    reply.code(204);
  });
}
