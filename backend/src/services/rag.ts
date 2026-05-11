/**
 * RAG retrieval over the project's text chunks.
 *
 * Uses MongoDB Atlas Vector Search via the $vectorSearch aggregation stage.
 * The index must be created on the chunks collection (see scripts/createIndexes.ts).
 */

import { Types } from 'mongoose';
import { Chunk, Chapter } from '../models/index.js';
import { embedQuery } from '../ai/embeddings.js';

export interface RagHit {
  chunkId: string;
  chapterId: string;
  chapterTitle: string;
  text: string;
  span: [number, number];
  score: number;
}

export async function searchChunks(args: {
  projectId: string;
  query: string;
  k?: number;
}): Promise<RagHit[]> {
  const k = args.k ?? 8;
  const queryVector = await embedQuery(args.query);

  const results = await Chunk.aggregate([
    {
      $vectorSearch: {
        index: 'chunks_vector_idx',
        path: 'embedding',
        queryVector,
        numCandidates: k * 10,
        limit: k,
        filter: { projectId: new Types.ObjectId(args.projectId) },
      },
    },
    {
      $project: {
        _id: 1,
        chapterId: 1,
        text: 1,
        span: 1,
        score: { $meta: 'vectorSearchScore' },
      },
    },
  ]);

  // Join chapter titles in a single follow-up query.
  const chapterIds = [...new Set(results.map((r) => String(r.chapterId)))];
  const chapters = await Chapter.find({ _id: { $in: chapterIds } })
    .select('title')
    .lean();
  const titleMap = new Map(chapters.map((c) => [String(c._id), c.title]));

  return results.map((r) => ({
    chunkId: String(r._id),
    chapterId: String(r.chapterId),
    chapterTitle: titleMap.get(String(r.chapterId)) ?? '?',
    text: r.text,
    span: r.span as [number, number],
    score: r.score,
  }));
}
