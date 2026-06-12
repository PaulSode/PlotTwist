/**
 * Server-Sent Events helper.
 *
 * SSE routes write directly to `reply.raw`, which bypasses Fastify's normal
 * onSend hooks — including the one `@fastify/cors` uses to add the
 * `Access-Control-Allow-Origin` header. Browsers therefore block the streamed
 * response with a CORS error. We re-attach the CORS headers here so manual SSE
 * responses behave like every other route.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';

export interface SSEStream {
  /** Send a named event with a JSON payload. */
  write: (event: string, data: unknown) => void;
  /** Close the stream. */
  end: () => void;
}

export function startSSE(req: FastifyRequest, reply: FastifyReply): SSEStream {
  const origin = req.headers.origin;
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
    // Mirror @fastify/cors (which we bypass by writing to reply.raw directly).
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Credentials': 'true',
    Vary: 'Origin',
  });

  return {
    write: (event, data) => {
      reply.raw.write(`event: ${event}\n`);
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    },
    end: () => reply.raw.end(),
  };
}
