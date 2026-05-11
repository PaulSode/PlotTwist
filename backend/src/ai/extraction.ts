/**
 * Extraction step.
 *
 * Input: chapter text + compact bible summary
 * Output: structured ExtractionResult ready to be merged into the bible
 *
 * Uses Claude's tool_use mechanism to guarantee schema compliance.
 * Cost: ~1 call per chapter save (debounced upstream by the analysis queue).
 */

import { anthropic } from './client.js';
import { config } from '../config.js';
import { EXTRACTION_SYSTEM, EXTRACTION_TOOL } from './prompts.js';

// ─── Output shape ────────────────────────────────────────────────────────────
export interface ExtractedAttribute {
  category: 'physical' | 'psychological' | 'background' | 'skill' | 'state' | 'relational';
  key: string;
  value: string;
  factuality: 'stated' | 'inferred' | 'temporary';
  sourceQuote: string;
  confidence: number;
}

export interface ExtractedCharacter {
  canonicalName: string;
  aliases?: string[];
  isNew?: boolean;
  importance?: 'main' | 'secondary' | 'tertiary' | 'mentioned';
  roleInScene?: string;
  attributes: ExtractedAttribute[];
}

export interface ExtractedLocation {
  canonicalName: string;
  isNew?: boolean;
  attributes: ExtractedAttribute[];
}

export interface ExtractedObject {
  canonicalName: string;
  isNew?: boolean;
  significance?: string;
  attributes?: ExtractedAttribute[];
}

export interface ExtractedEvent {
  summary: string;
  inWorldTime?: string;
  participants?: string[];
  location?: string;
  significance: 'minor' | 'pivotal';
}

export interface ExtractedRelationship {
  from: string;
  to: string;
  type: string;
  evolutionSummary?: string;
  tone?: 'warming' | 'cooling' | 'shift' | 'stable';
}

export interface ExtractionResult {
  characters: ExtractedCharacter[];
  locations: ExtractedLocation[];
  objects: ExtractedObject[];
  events: ExtractedEvent[];
  relationships: ExtractedRelationship[];
  themes: string[];
  chapterSummary: string;
}

// ─── Main function ───────────────────────────────────────────────────────────
export async function extractChapter(args: {
  chapterText: string;
  chapterTitle: string;
  chapterPosition: string; // human-readable, e.g. "Tome II, Partie 2, ch. 14"
  bibleSummary: string;
}): Promise<ExtractionResult> {
  const userMessage = `BIBLE (current state — reference canonical names from here):

${args.bibleSummary || '(empty — this is an early chapter)'}

CHAPTER METADATA
- Title: ${args.chapterTitle}
- Position: ${args.chapterPosition}

CHAPTER TEXT
---
${args.chapterText}
---

Extract everything newly stated, revealed, or evolved in this chapter. Use the record_extraction tool.`;

  const response = await anthropic.messages.create({
    model: config.models.extraction,
    max_tokens: 4096,
    system: EXTRACTION_SYSTEM,
    tools: [EXTRACTION_TOOL],
    tool_choice: { type: 'tool', name: 'record_extraction' },
    messages: [{ role: 'user', content: userMessage }],
  });

  const toolUse = response.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error('Extraction failed: no tool_use block in Claude response.');
  }

  // We forced tool_choice so we know this is record_extraction.
  const raw = toolUse.input as Partial<ExtractionResult>;

  // Defensive defaults — the schema requires `characters`, `locations`, `events`, `chapterSummary`
  // but downstream code is gentler if we normalise here.
  return {
    characters: raw.characters ?? [],
    locations: raw.locations ?? [],
    objects: raw.objects ?? [],
    events: raw.events ?? [],
    relationships: raw.relationships ?? [],
    themes: raw.themes ?? [],
    chapterSummary: raw.chapterSummary ?? '',
  };
}
