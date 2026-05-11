import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Inconsistency, Project } from '../models/index.js';
import { requireAuth } from './_auth.js';

const updateSchema = z.object({
  status: z.enum(['open', 'reviewing', 'resolved', 'ignored']).optional(),
  resolutionNote: z.string().max(2000).optional(),
});

export async function inconsistencyRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

  // List inconsistencies for a project (filterable by status)
  app.get('/projects/:projectId/inconsistencies', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const { status } = req.query as { status?: string };

    const proj = await Project.findOne({ _id: projectId, userId: req.userId });
    if (!proj) return reply.code(404).send({ error: 'Project not found' });

    const filter: Record<string, unknown> = { projectId };
    if (status) filter.status = status;

    const items = await Inconsistency.find(filter)
      .sort({ severity: -1, createdAt: -1 })
      .populate('claimA.chapterId', 'title order')
      .populate('claimB.chapterId', 'title order')
      .lean();

    return { inconsistencies: items };
  });

  // Inconsistencies surfaced by the current chapter (powers the right-panel alerts)
  app.get('/chapters/:chapterId/inconsistencies', async (req) => {
    const { chapterId } = req.params as { chapterId: string };
    const items = await Inconsistency.find({
      $or: [{ 'claimA.chapterId': chapterId }, { 'claimB.chapterId': chapterId }],
      status: 'open',
    })
      .populate('claimA.chapterId', 'title order')
      .populate('claimB.chapterId', 'title order')
      .lean();
    return { inconsistencies: items };
  });

  // Update status / add resolution note
  app.patch('/inconsistencies/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = updateSchema.parse(req.body);
    const item = await Inconsistency.findById(id);
    if (!item) return reply.code(404).send({ error: 'Inconsistency not found' });

    const proj = await Project.findOne({ _id: item.projectId, userId: req.userId });
    if (!proj) return reply.code(404).send({ error: 'Inconsistency not found' });

    Object.assign(item, body);
    await item.save();
    return { inconsistency: item };
  });
}
