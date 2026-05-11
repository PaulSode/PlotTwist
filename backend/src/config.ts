import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env var: ${key}`);
  return v;
}

export const config = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  env: process.env.NODE_ENV ?? 'development',

  mongoUri: required('MONGO_URI'),
  anthropicApiKey: required('ANTHROPIC_API_KEY'),
  voyageApiKey: required('VOYAGE_API_KEY'),
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret',

  // Claude model selection — extraction needs speed, consistency needs reasoning.
  models: {
    /** Fast structured extraction of entities from chapter text. */
    extraction: 'claude-sonnet-4-6',
    /** Nuanced reasoning: is this a real contradiction or character evolution? */
    consistency: 'claude-opus-4-7',
    /** Streaming assistant for the author (continuation suggestions, Q&A). */
    assistant: 'claude-sonnet-4-6',
    /** Cheap summarization tasks (chapter summary, character resync). */
    summarizer: 'claude-haiku-4-5-20251001',
  },

  embedding: {
    // Voyage model + dimensions. Must match the Atlas Vector Search index definition.
    model: 'voyage-3-large',
    dimensions: 1024,
    // Paragraph-based chunking with sliding window for long paragraphs.
    targetChunkChars: 1200,
    maxChunkChars: 1800,
  },
} as const;

export type Config = typeof config;
