/**
 * Streaming assistant.
 *
 * For interactive author Q&A and continuation suggestions.
 * Yields incremental text deltas suitable for piping into Server-Sent Events.
 *
 * Context strategy:
 *   1. Always include the compact bible summary (~2-3k tokens)
 *   2. If the user references "this chapter", include current chapter in full
 *   3. Otherwise RAG: retrieve top-K relevant chunks
 */

import { anthropic } from './client.js';
import { config } from '../config.js';
import { ASSISTANT_SYSTEM } from './prompts.js';

export interface AssistantContext {
  bibleSummary: string;
  currentChapter?: { title: string; content: string };
  ragHits?: { chapterTitle: string; quote: string }[];
}

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Stream a response. Each yielded value is a text delta (not a full message).
 */
export async function* streamAssistant(args: {
  history: AssistantMessage[];
  context: AssistantContext;
}): AsyncGenerator<string, void, void> {
  const contextBlock = buildContextBlock(args.context);

  // Inject the manuscript context as the first user turn, then real history.
  // (Prepending context-as-first-message keeps cache-friendly turn structure.)
  const messages: AssistantMessage[] = [
    { role: 'user', content: contextBlock },
    {
      role: 'assistant',
      content: 'Compris. J\'ai chargé la bible et les passages pertinents. Que puis-je faire ?',
    },
    ...args.history,
  ];

  const stream = anthropic.messages.stream({
    model: config.models.assistant,
    max_tokens: 2048,
    system: ASSISTANT_SYSTEM,
    messages,
  });

  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta'
    ) {
      yield event.delta.text;
    }
  }
}

function buildContextBlock(ctx: AssistantContext): string {
  const parts: string[] = [];

  parts.push('=== BIBLE ===');
  parts.push(ctx.bibleSummary);

  if (ctx.currentChapter) {
    parts.push('');
    parts.push(`=== CHAPITRE EN COURS — ${ctx.currentChapter.title} ===`);
    parts.push(ctx.currentChapter.content);
  }

  if (ctx.ragHits && ctx.ragHits.length > 0) {
    parts.push('');
    parts.push('=== PASSAGES PERTINENTS DU MANUSCRIT ===');
    for (const h of ctx.ragHits) {
      parts.push(`[${h.chapterTitle}] ${h.quote}`);
    }
  }

  return parts.join('\n');
}
