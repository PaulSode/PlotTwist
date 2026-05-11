import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Project } from '../models/index.js';
import { searchChunks } from '../services/rag.js';
import { requireAuth } from './_auth.js';

const querySchema = z.object({
  q: z.string().min(2).max(500),
  k: z.coerce.number().int().min(1).max(20).optional(),
});

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

  // Semantic search across all chapters of a project
  app.get('/projects/:projectId/search', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const { q, k } = querySchema.parse(req.query);

    const proj = await Project.findOne({ _id: projectId, userId: req.userId });
    if (!proj) return reply.code(404).send({ error: 'Project not found' });

    const hits = await searchChunks({ projectId, query: q, k });
    return { hits };
  });
}
