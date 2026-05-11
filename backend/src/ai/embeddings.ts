/**
 * Embeddings (Voyage AI).
 *
 * Anthropic does not provide embedding models; Voyage is the recommended partner.
 * We chunk by paragraph (semantically natural in prose) with a sliding-window
 * fallback for paragraphs that exceed `maxChunkChars`.
 *
 * Output chunks go into MongoDB; vector search runs via Atlas Vector Search
 * (see scripts/createIndexes.ts for the index definition).
 */

import { VoyageAIClient } from 'voyageai';
import { config } from '../config.js';

const voyage = new VoyageAIClient({ apiKey: config.voyageApiKey });

export interface Chunk {
  text: string;
  span: [number, number]; // [startChar, endChar] in the source text
}

/** Split chapter text into semantically meaningful chunks. */
export function chunkChapter(text: string): Chunk[] {
  const chunks: Chunk[] = [];
  const target = config.embedding.targetChunkChars;
  const max = config.embedding.maxChunkChars;

  // Split on blank lines (paragraph boundaries in prose).
  const paragraphs = splitWithSpans(text, /\n\s*\n+/);

  let buf: { start: number; end: number; text: string } | null = null;

  for (const p of paragraphs) {
    if (!p.text.trim()) continue;

    if (p.text.length > max) {
      // Flush any accumulated buffer first
      if (buf) {
        chunks.push({ text: buf.text, span: [buf.start, buf.end] });
        buf = null;
      }
      // Long paragraph: slide window over it
      for (const sub of slidingWindow(p.text, p.start, target, target / 4)) {
        chunks.push(sub);
      }
      continue;
    }

    if (!buf) {
      buf = { start: p.start, end: p.end, text: p.text };
    } else if (buf.text.length + 2 + p.text.length <= target) {
      buf.text += '\n\n' + p.text;
      buf.end = p.end;
    } else {
      chunks.push({ text: buf.text, span: [buf.start, buf.end] });
      buf = { start: p.start, end: p.end, text: p.text };
    }
  }
  if (buf) chunks.push({ text: buf.text, span: [buf.start, buf.end] });

  return chunks;
}

function splitWithSpans(
  text: string,
  separator: RegExp,
): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  let cursor = 0;
  const re = new RegExp(separator, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > cursor) {
      out.push({ start: cursor, end: m.index, text: text.slice(cursor, m.index) });
    }
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) {
    out.push({ start: cursor, end: text.length, text: text.slice(cursor) });
  }
  return out;
}

function* slidingWindow(
  text: string,
  baseOffset: number,
  size: number,
  overlap: number,
): Generator<Chunk> {
  const step = size - overlap;
  for (let i = 0; i < text.length; i += step) {
    const end = Math.min(i + size, text.length);
    yield {
      text: text.slice(i, end),
      span: [baseOffset + i, baseOffset + end],
    };
    if (end === text.length) break;
  }
}

/** Embed an array of texts. Returns vectors in the same order. */
export async function embedTexts(
  texts: string[],
  type: 'document' | 'query' = 'document',
): Promise<number[][]> {
  if (texts.length === 0) return [];

  const response = await voyage.embed({
    input: texts,
    model: config.embedding.model,
    inputType: type,
  });

  // Voyage returns { data: [{ embedding: number[] }, ...] }
  return (response.data ?? []).map((d) => d.embedding ?? []);
}

export async function embedQuery(query: string): Promise<number[]> {
  const [vec] = await embedTexts([query], 'query');
  if (!vec) throw new Error('Voyage returned no embedding for query.');
  return vec;
}
