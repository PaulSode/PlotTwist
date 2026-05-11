/**
 * Auth stub.
 *
 * Reads a JWT from the Authorization header and attaches `req.userId`.
 * For development we accept a plain user id in the header to skip token signing.
 * Replace with a proper auth provider (Clerk, Auth0, Supabase) in production.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    userId: string;
  }
}

export async function requireAuth(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = req.headers.authorization;
  if (!header) {
    reply.code(401).send({ error: 'Missing Authorization header' });
    return;
  }

  // Dev-mode shortcut: `Authorization: Dev <userId>`
  const dev = header.match(/^Dev (\S+)$/);
  if (dev) {
    req.userId = dev[1]!;
    return;
  }

  // TODO: verify JWT signature with config.jwtSecret and extract userId.
  // For now reject anything that isn't the dev format.
  reply.code(401).send({ error: 'Invalid auth scheme' });
}
