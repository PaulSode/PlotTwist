/**
 * Create the MongoDB Atlas Vector Search index on the `chunks` collection.
 *
 * Atlas vector indexes are NOT regular MongoDB indexes; they live in the
 * Atlas search service and must be created via the Atlas admin API or UI.
 * This script uses the Node driver's createSearchIndex helper (Atlas-only).
 *
 *   npm run indexes
 *
 * If you're not on Atlas, the assistant route degrades gracefully (search just
 * returns no hits) but you'll want a managed vector store before going to prod.
 */

import mongoose from 'mongoose';
import { config } from '../src/config.js';

async function main() {
  await mongoose.connect(config.mongoUri);
  const db = mongoose.connection.db;
  if (!db) throw new Error('DB connection not ready.');

  const collection = db.collection('chunks');

  const definition = {
    name: 'chunks_vector_idx',
    type: 'vectorSearch',
    definition: {
      fields: [
        {
          type: 'vector',
          path: 'embedding',
          numDimensions: config.embedding.dimensions,
          similarity: 'cosine',
        },
        // Allow filtering by projectId so vector search stays per-tenant
        { type: 'filter', path: 'projectId' },
      ],
    },
  };

  try {
    // @ts-expect-error createSearchIndex is on Atlas clusters only
    const result = await collection.createSearchIndex(definition);
    console.log('Created search index:', result);
  } catch (err) {
    console.error('Failed to create vector index. Make sure you are on Atlas.');
    console.error(err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main();
