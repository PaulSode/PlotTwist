import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { ZodError } from 'zod';

import { config } from './config.js';
import { connectDB, disconnectDB } from './db.js';

import { projectRoutes } from './routes/projects.js';
import { chapterRoutes } from './routes/chapters.js';
import { bibleRoutes } from './routes/bible.js';
import { inconsistencyRoutes } from './routes/inconsistencies.js';
import { searchRoutes } from './routes/search.js';
import { assistantRoutes } from './routes/assistant.js';
import { meRoutes } from './routes/me.js';

async function build() {
  const app = Fastify({
    logger: {
      level: config.env === 'production' ? 'info' : 'debug',
      transport:
        config.env !== 'production'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
          : undefined,
    },
    trustProxy: true,
  });

  await app.register(cors, {
    origin: config.env === 'production'
      ? [/\.plottwist\.app$/]
      : true,
    credentials: true,
  });
  await app.register(sensible);

  // Convert Zod errors → 400 JSON
  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'ValidationError', issues: err.issues });
    }
    req.log.error(err);
    return reply.code(err.statusCode ?? 500).send({
      error: err.name || 'InternalServerError',
      message: err.message,
    });
  });

  app.get('/healthz', async () => ({ ok: true, time: new Date().toISOString() }));

  // Mount routes under /v1
  await app.register(
    async (api) => {
      await api.register(projectRoutes);
      await api.register(chapterRoutes);
      await api.register(bibleRoutes);
      await api.register(inconsistencyRoutes);
      await api.register(searchRoutes);
      await api.register(assistantRoutes);
      await api.register(meRoutes);
    },
    { prefix: '/v1' },
  );

  return app;
}

async function main() {
  await connectDB();
  const app = await build();

  const shutdown = async (signal: string) => {
    app.log.info(`received ${signal}, shutting down`);
    await app.close();
    await disconnectDB();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
