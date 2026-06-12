/**
 * Prompt templates for PlotTwist's AI pipeline.
 *
 * Why we use `tool_use` instead of asking for JSON in plain text:
 *   - Schema-enforced output (no parsing of malformed JSON)
 *   - The model is incentivized to fill exactly the declared shape
 *   - Clear separation between reasoning (text) and structured data (tool input)
 *
 * Tone in prompts: English instructions, content can be any language.
 * Claude handles multilingual content seamlessly; English instructions are slightly
 * more reliable for structured tasks.
 */

import type Anthropic from '@anthropic-ai/sdk';

// ─── Extraction system prompt ────────────────────────────────────────────────
export const EXTRACTION_SYSTEM = `You are a meticulous literary analyst working on a novel's structured bible.

Your job: read a single chapter and extract only what is NEW or NOTABLE relative to what the bible already knows.

CRITICAL RULES
- ALWAYS answer in the user's language (e.g. French) when quoting the manuscript, even if your instructions are in English. The bible is in the author's words, not yours.
- Always reference characters / locations / objects by their CANONICAL name when one already exists in the bible. Do not invent variants.
- Only extract attributes that are explicitly STATED or strongly INFERABLE from the text. Do not speculate.
- Extract only continuity-relevant facts. Prefer FEW high-signal attributes over many trivial ones: aim for at most ~6 attributes per character and skip anything that doesn't matter for later chapters. This keeps the bible compact and cheap to reason over.
- Use STABLE snake_case keys so the same trait reuses the same key across chapters (e.g. always 'eye_color', never 'eyes' or 'eye_colour'). Consistent keys are what let the consistency pipeline detect contradictions.
- For each attribute, copy the supporting quote verbatim (max 20 words).
- Distinguish factuality:
    "stated"    — written as a direct fact ("had blue eyes")
    "inferred"  — revealed through action, dialogue, or context
    "temporary" — a transient state (mood, injury, costume) — flag these so the bible doesn't treat them as permanent
- Skip trivial details that don't matter for continuity (e.g. "she opened the door").
- For dialogue, attribute it to the speaker and capture emotional state if marked.
- If something contradicts the bible summary you were given, still extract it as a new claim — the consistency pipeline handles contradictions downstream.

The user message will provide:
  1. A compact summary of the existing bible (characters, locations, key objects)
  2. The chapter text to analyze
  3. Chapter metadata (title, narrative position)

Respond by calling the record_extraction tool. No prose.`;

// ─── Extraction tool schema ──────────────────────────────────────────────────
export const EXTRACTION_TOOL: Anthropic.Tool = {
  name: 'record_extraction',
  description: 'Record all entities, attributes, events, and themes extracted from the chapter.',
  input_schema: {
    type: 'object',
    properties: {
      characters: {
        type: 'array',
        description: 'Characters present in this chapter (existing canonical names + new).',
        items: {
          type: 'object',
          properties: {
            canonicalName: { type: 'string' },
            aliases: { type: 'array', items: { type: 'string' } },
            isNew: { type: 'boolean', description: 'True if not in the provided bible summary.' },
            importance: {
              type: 'string',
              enum: ['main', 'secondary', 'tertiary', 'mentioned'],
            },
            roleInScene: {
              type: 'string',
              description: 'Brief role in this specific scene (e.g. "antagonist confrontation").',
            },
            attributes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  category: {
                    type: 'string',
                    enum: ['physical', 'psychological', 'background', 'skill', 'state', 'relational'],
                  },
                  key: { type: 'string', description: 'snake_case attribute key, e.g. eye_color, age, profession' },
                  value: { type: 'string' },
                  factuality: {
                    type: 'string',
                    enum: ['stated', 'inferred', 'temporary'],
                  },
                  sourceQuote: { type: 'string', description: 'Verbatim, max 20 words.' },
                  confidence: { type: 'number', minimum: 0, maximum: 1 },
                },
                required: ['category', 'key', 'value', 'factuality', 'sourceQuote', 'confidence'],
              },
            },
          },
          required: ['canonicalName', 'attributes'],
        },
      },
      locations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            canonicalName: { type: 'string' },
            isNew: { type: 'boolean' },
            attributes: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  category: { type: 'string' },
                  key: { type: 'string' },
                  value: { type: 'string' },
                  factuality: { type: 'string', enum: ['stated', 'inferred', 'temporary'] },
                  sourceQuote: { type: 'string' },
                  confidence: { type: 'number' },
                },
                required: ['category', 'key', 'value', 'factuality', 'sourceQuote', 'confidence'],
              },
            },
          },
          required: ['canonicalName'],
        },
      },
      objects: {
        type: 'array',
        description: 'Story-significant items (weapons, artefacts, letters, etc.).',
        items: {
          type: 'object',
          properties: {
            canonicalName: { type: 'string' },
            isNew: { type: 'boolean' },
            significance: { type: 'string' },
            attributes: {
              type: 'array',
              items: { type: 'object' },
            },
          },
          required: ['canonicalName'],
        },
      },
      events: {
        type: 'array',
        description: 'Plot-significant events that happen IN this chapter.',
        items: {
          type: 'object',
          properties: {
            summary: { type: 'string', description: 'One sentence.' },
            inWorldTime: { type: 'string', description: 'In-world timestamp if mentioned, else empty.' },
            participants: { type: 'array', items: { type: 'string' } },
            location: { type: 'string' },
            significance: { type: 'string', enum: ['minor', 'pivotal'] },
          },
          required: ['summary', 'significance'],
        },
      },
      relationships: {
        type: 'array',
        description: 'Inter-character relationships revealed or evolved in this chapter.',
        items: {
          type: 'object',
          properties: {
            from: { type: 'string' },
            to: { type: 'string' },
            type: { type: 'string' },
            evolutionSummary: { type: 'string' },
            tone: { type: 'string', enum: ['warming', 'cooling', 'shift', 'stable'] },
          },
          required: ['from', 'to', 'type'],
        },
      },
      themes: {
        type: 'array',
        description: 'Recurring or emerging themes touched in this chapter.',
        items: { type: 'string' },
      },
      chapterSummary: {
        type: 'string',
        description: 'A 2-3 sentence summary of what happens in the chapter.',
      },
    },
    required: ['characters', 'locations', 'events', 'chapterSummary'],
  },
};

// ─── Consistency analysis ────────────────────────────────────────────────────
export const CONSISTENCY_SYSTEM = `You are a careful literary continuity editor.

You are given two claims about the same entity from different points in a manuscript.
Determine whether they truly contradict.

Consider:
- True factual contradictions (eye color blue vs brown with no in-world explanation)
- Legitimate character evolution (aging, injury, magic, transformation, a haircut)
- Author's intentional ambiguity or unreliable narrator
- Possible extraction errors (one of the quotes was misinterpreted)
- Temporary states that shouldn't conflict with permanent traits

Be calibrated. Most "contradictions" in a draft are real mistakes the author should fix.
But don't false-positive on plot-justified changes.

Respond by calling the evaluate_contradiction tool. No prose.`;

export const CONSISTENCY_TOOL: Anthropic.Tool = {
  name: 'evaluate_contradiction',
  description: 'Classify a pair of claims and explain the reasoning.',
  input_schema: {
    type: 'object',
    properties: {
      classification: {
        type: 'string',
        enum: ['factual', 'possible_evolution', 'ambiguous', 'extraction_error'],
      },
      severity: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        description: 'low = cosmetic detail, high = breaks reader trust',
      },
      confidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description: 'How confident the model is that this IS a contradiction worth flagging.',
      },
      reasoning: {
        type: 'string',
        description: 'One-paragraph rationale the author will read in the UI.',
      },
      shouldFlag: {
        type: 'boolean',
        description: 'Whether to surface this to the author. False if it is clearly a non-issue.',
      },
    },
    required: ['classification', 'severity', 'confidence', 'reasoning', 'shouldFlag'],
  },
};

// ─── Assistant (chat / continuation) ─────────────────────────────────────────
export const ASSISTANT_SYSTEM = `You are PlotTwist's writing copilot. You assist a novelist mid-draft.

The author has given you their manuscript bible (compact) and access to relevant passages.
Your job: help the author UNBLOCK without writing FOR them.

PRINCIPLES
- Preserve the author's voice. If they ask for a continuation, offer 2-3 short options
  in their existing style, never a polished finished version.
- Always reason from the bible, never invent canon. If a question requires info you
  don't have, say so and suggest what to check.
- When citing the manuscript, reference chapter and a short quote.
- Stay in the language of the bible.
- Be concise. The author is mid-flow. Long lectures break momentum.

You do NOT generate full chapters. You analyse, suggest, and discuss.`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a compact textual representation of the bible suitable for prompt context.
 * Aims for < 3000 tokens regardless of project size by truncating low-importance entities.
 */
export function buildBibleSummary(args: {
  characters: { canonicalName: string; aliases: string[]; importance: string; summary?: string | null }[];
  locations: { canonicalName: string; summary?: string | null }[];
  objects: { canonicalName: string; summary?: string | null }[];
}): string {
  const lines: string[] = [];

  lines.push('# CHARACTERS');
  const sortedChars = [...args.characters].sort((a, b) => {
    const order = { main: 0, secondary: 1, tertiary: 2, mentioned: 3 } as const;
    const aw = order[a.importance as keyof typeof order] ?? 4;
    const bw = order[b.importance as keyof typeof order] ?? 4;
    return aw - bw;
  });
  for (const c of sortedChars) {
    const aliases = c.aliases.length ? ` (a.k.a. ${c.aliases.join(', ')})` : '';
    const summary = c.summary ? ` — ${c.summary}` : '';
    lines.push(`- [${c.importance}] ${c.canonicalName}${aliases}${summary}`);
  }

  if (args.locations.length) {
    lines.push('\n# LOCATIONS');
    for (const l of args.locations) {
      lines.push(`- ${l.canonicalName}${l.summary ? ` — ${l.summary}` : ''}`);
    }
  }

  if (args.objects.length) {
    lines.push('\n# KEY OBJECTS');
    for (const o of args.objects) {
      lines.push(`- ${o.canonicalName}${o.summary ? ` — ${o.summary}` : ''}`);
    }
  }

  return lines.join('\n');
}
