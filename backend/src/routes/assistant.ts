/**
 * Assistant route.
 *
 * POST /projects/:projectId/assistant
 *   body: { messages: [{role, content}], currentChapterId?: string }
 *
 * Server-Sent Events stream of text deltas.
 * The frontend appends each delta to the visible assistant message.
 */

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { Project, Chapter, Character, Location, StoryObject } from '../models/index.js';
import { streamAssistant, type AssistantMessage } from '../ai/assistant.js';
import { searchChunks } from '../services/rag.js';
import { buildBibleSummary } from '../ai/prompts.js';
import { requireAuth } from './_auth.js';
import { startSSE } from './_sse.js';

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(10_000),
      }),
    )
    .min(1)
    .max(40),
  currentChapterId: z.string().length(24).optional(),
});

export async function assistantRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('onRequest', requireAuth);

  app.post('/projects/:projectId/assistant', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const { messages, currentChapterId } = bodySchema.parse(req.body);

    const proj = await Project.findOne({ _id: projectId, userId: req.userId });
    if (!proj) return reply.code(404).send({ error: 'Project not found' });

    // Build context: bible summary + (optional) current chapter + RAG over last user msg
    const [chars, locs, objs] = await Promise.all([
      Character.find({ projectId }).select('canonicalName aliases importance summary').lean(),
      Location.find({ projectId }).select('canonicalName summary').lean(),
      StoryObject.find({ projectId }).select('canonicalName summary').lean(),
    ]);

    const bibleSummary = buildBibleSummary({
      characters: chars.map((c) => ({
        canonicalName: c.canonicalName,
        aliases: c.aliases ?? [],
        importance: c.importance ?? 'mentioned',
        summary: c.summary,
      })),
      locations: locs.map((l) => ({ canonicalName: l.canonicalName, summary: l.summary })),
      objects: objs.map((o) => ({ canonicalName: o.canonicalName, summary: o.summary })),
    });

    let currentChapter: { title: string; content: string } | undefined;
    if (currentChapterId) {
      const ch = await Chapter.findById(currentChapterId).select('title content').lean();
      if (ch) currentChapter = { title: ch.title, content: ch.content };
    }

    // RAG: embed the last user message and pull relevant chunks
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    let ragHits: { chapterTitle: string; quote: string }[] = [];
    if (lastUser) {
      try {
        const hits = await searchChunks({ projectId, query: lastUser.content, k: 6 });
        ragHits = hits.map((h) => ({ chapterTitle: h.chapterTitle, quote: h.text }));
      } catch (err) {
        // Vector search may not be configured in dev — degrade gracefully.
        req.log.warn({ err }, 'RAG search failed, continuing without hits');
      }
    }

    // ─── Stream as SSE ────────────────────────────────────────────────────
    const sse = startSSE(req, reply);

    try {
      sse.write('start', { ragHits: ragHits.map((h) => h.chapterTitle) });

      const stream = streamAssistant({
        history: messages as AssistantMessage[],
        context: { bibleSummary, currentChapter, ragHits },
      });

      for await (const delta of stream) {
        sse.write('delta', { text: delta });
      }

      sse.write('done', {});
    } catch (err) {
      req.log.error({ err }, 'Assistant stream failed');
      sse.write('error', { message: 'Assistant stream failed.' });
    } finally {
      sse.end();
    }
  });
}
