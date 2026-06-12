/**
 * Current-user route.
 *
 * Surfaces the authenticated user's profile (name, email, plan) so the UI can
 * show real account data instead of a placeholder. Uses the same dev-auth
 * `req.userId` as every other route.
 */

import type { FastifyInstance } from 'fastify';
import { User } from '../models/index.js';
import { requireAuth } from './_auth.js';

export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

  app.get('/me', async (req, reply) => {
    let user = null;
    try {
      user = await User.findById(req.userId).select('name email plan').lean();
    } catch {
      // Invalid ObjectId in the dev header → treat as anonymous.
    }
    if (!user) {
      // Dev mode: the configured user id may not map to a real document yet.
      return reply.send({ user: { _id: req.userId, name: null, email: null, plan: 'free' } });
    }
    return { user };
  });
}
