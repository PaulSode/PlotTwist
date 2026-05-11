/**
 * Bible service — the orchestration heart of Plotwise.
 *
 * `analyzeChapter()` runs the full pipeline for a single chapter:
 *
 *   1. Build a compact bible summary (existing knowledge → prompt context)
 *   2. Call extraction (Sonnet + tool_use → structured ExtractionResult)
 *   3. For each extracted entity, upsert it and merge attributes:
 *        - Drop existing attributes sourced from THIS chapter (we're re-running)
 *        - Add new attributes
 *        - For each new attribute, check if an attribute with the SAME key but
 *          different value exists from another chapter → run consistency check
 *   4. Persist events and relationships
 *   5. Chunk + embed text, replace existing chunks for this chapter
 *
 * The "scene-anchored" pattern (attribute.sourceChapterId) is what makes step 3
 * idempotent: re-running on an edited chapter produces the same result as if it
 * had been the first run.
 */

import { Types } from 'mongoose';
import {
  Chapter,
  Character,
  Location,
  StoryObject,
  Event,
  Relationship,
  Inconsistency,
  Chunk,
} from '../models/index.js';
import { extractChapter, type ExtractedAttribute } from '../ai/extraction.js';
import { analyzeConflict } from '../ai/consistency.js';
import { chunkChapter, embedTexts } from '../ai/embeddings.js';
import { buildBibleSummary } from '../ai/prompts.js';

// ─── Entry point ─────────────────────────────────────────────────────────────
export async function analyzeChapter(chapterId: string): Promise<void> {
  const chapter = await Chapter.findById(chapterId);
  if (!chapter) throw new Error(`Chapter ${chapterId} not found`);
  if (!chapter.content || chapter.content.trim().length < 50) {
    // Too short to analyze meaningfully. Mark as analyzed and bail.
    chapter.lastAnalyzedVersion = chapter.analysisVersion;
    chapter.lastAnalyzedAt = new Date();
    await chapter.save();
    return;
  }

  const projectId = chapter.projectId;
  const startVersion = chapter.analysisVersion;

  // 1. Build bible summary
  const bibleSummary = await buildProjectBibleSummary(String(projectId));

  // 2. Extract
  const position = await formatChapterPosition(chapter);
  const extraction = await extractChapter({
    chapterText: chapter.content,
    chapterTitle: chapter.title,
    chapterPosition: position,
    bibleSummary,
  });

  // 3. Merge entities
  await mergeCharacters(String(projectId), String(chapterId), extraction.characters);
  await mergeLocations(String(projectId), String(chapterId), extraction.locations);
  await mergeObjects(String(projectId), String(chapterId), extraction.objects);
  await persistEvents(String(projectId), String(chapterId), extraction.events);
  await persistRelationships(String(projectId), String(chapterId), extraction.relationships);

  // 4. Re-chunk + re-embed
  await reindexChunks(String(projectId), String(chapterId), chapter.content, startVersion);

  // 5. Mark chapter as analyzed
  chapter.aiSummary = extraction.chapterSummary;
  chapter.lastAnalyzedVersion = startVersion;
  chapter.lastAnalyzedAt = new Date();
  await chapter.save();
}

// ─── Bible summary builder ───────────────────────────────────────────────────
async function buildProjectBibleSummary(projectId: string): Promise<string> {
  const [chars, locs, objs] = await Promise.all([
    Character.find({ projectId }).select('canonicalName aliases importance summary').lean(),
    Location.find({ projectId }).select('canonicalName summary').lean(),
    StoryObject.find({ projectId }).select('canonicalName summary').lean(),
  ]);

  return buildBibleSummary({
    characters: chars.map((c) => ({
      canonicalName: c.canonicalName,
      aliases: c.aliases ?? [],
      importance: c.importance ?? 'mentioned',
      summary: c.summary,
    })),
    locations: locs.map((l) => ({ canonicalName: l.canonicalName, summary: l.summary })),
    objects: objs.map((o) => ({ canonicalName: o.canonicalName, summary: o.summary })),
  });
}

async function formatChapterPosition(chapter: { parentId?: unknown; order: number }): Promise<string> {
  if (!chapter.parentId) return `Chapitre #${chapter.order}`;
  const parent = await Chapter.findById(chapter.parentId).select('title parentId').lean();
  if (!parent) return `Chapitre #${chapter.order}`;
  const grand = parent.parentId ? await Chapter.findById(parent.parentId).select('title').lean() : null;
  const parts = [grand?.title, parent.title, `ch. ${chapter.order}`].filter(Boolean);
  return parts.join(' · ');
}

// ─── Character merge ─────────────────────────────────────────────────────────
async function mergeCharacters(
  projectId: string,
  chapterId: string,
  extracted: Awaited<ReturnType<typeof extractChapter>>['characters'],
): Promise<void> {
  for (const ec of extracted) {
    let character = await Character.findOne({ projectId, canonicalName: ec.canonicalName });

    if (!character) {
      character = new Character({
        projectId,
        canonicalName: ec.canonicalName,
        aliases: ec.aliases ?? [],
        importance: ec.importance ?? 'mentioned',
        attributes: [],
        appearances: [],
      });
    } else {
      // Merge aliases without dupes
      const aliasSet = new Set([...(character.aliases ?? []), ...(ec.aliases ?? [])]);
      character.aliases = [...aliasSet];
      // Upgrade importance only (never downgrade)
      character.importance = stronger(character.importance, ec.importance);
    }

    // Drop attributes previously extracted from THIS chapter (idempotent re-run)
    for (let i = character.attributes.length - 1; i >= 0; i--) {
      if (String(character.attributes[i]!.sourceChapterId) === chapterId) {
        character.attributes.splice(i, 1);
      }
    }

    // Detect conflicts BEFORE adding new attributes
    const conflicts: {
      attribute: ExtractedAttribute;
      existing: (typeof character.attributes)[number];
    }[] = [];

    for (const attr of ec.attributes) {
      // Skip temporary states — they're not meant to be permanent traits
      if (attr.factuality === 'temporary') continue;

      const existing = character.attributes.find(
        (a) => a.key === attr.key && a.value.toLowerCase() !== attr.value.toLowerCase(),
      );
      if (existing) conflicts.push({ attribute: attr, existing });
    }

    // Add all new attributes (including the ones that conflict — both versions live in the record)
    for (const attr of ec.attributes) {
      character.attributes.push({
        category: attr.category,
        key: attr.key,
        value: attr.value,
        sourceChapterId: new Types.ObjectId(chapterId),
        sourceQuote: attr.sourceQuote,
        confidence: attr.confidence,
        factuality: attr.factuality,
        extractedAt: new Date(),
      } as never);
    }

    // Update appearances
    const appIdx = character.appearances.findIndex((a) => String(a.chapterId) === chapterId);
    if (appIdx >= 0) {
      character.appearances[appIdx] = {
        chapterId: new Types.ObjectId(chapterId),
        mentionCount: ec.attributes.length || 1,
      } as never;
    } else {
      character.appearances.push({
        chapterId: new Types.ObjectId(chapterId),
        mentionCount: ec.attributes.length || 1,
      } as never);
    }

    await character.save();

    // Process conflicts → run consistency analysis on each
    for (const conflict of conflicts) {
      await processCharacterConflict(character, chapterId, conflict.attribute, conflict.existing);
    }
  }
}

// ─── Conflict processing (the magic moment) ──────────────────────────────────
async function processCharacterConflict(
  character: { _id: unknown; canonicalName: string; projectId: unknown },
  newChapterId: string,
  newAttr: ExtractedAttribute,
  existing: {
    key: string;
    value: string;
    sourceChapterId: unknown;
    sourceQuote?: string | null;
    factuality: string;
  },
): Promise<void> {
  // Skip if we've already flagged this exact pair
  const dupe = await Inconsistency.findOne({
    projectId: character.projectId,
    entityId: character._id,
    attributeKey: newAttr.key,
    'claimA.value': existing.value,
    'claimB.value': newAttr.value,
    status: { $in: ['open', 'reviewing'] },
  });
  if (dupe) return;

  // Get chapter references for the prompt
  const [chapA, chapB] = await Promise.all([
    Chapter.findById(existing.sourceChapterId).select('title order parentId').lean(),
    Chapter.findById(newChapterId).select('title order parentId').lean(),
  ]);

  const verdict = await analyzeConflict({
    entityName: character.canonicalName,
    entityType: 'character',
    attributeKey: newAttr.key,
    claimA: {
      chapterRef: chapA?.title ?? '?',
      quote: existing.sourceQuote ?? '',
      value: existing.value,
      factuality: existing.factuality,
    },
    claimB: {
      chapterRef: chapB?.title ?? '?',
      quote: newAttr.sourceQuote,
      value: newAttr.value,
      factuality: newAttr.factuality,
    },
  });

  if (!verdict.shouldFlag) return;

  await Inconsistency.create({
    projectId: character.projectId,
    entityType: 'character',
    entityId: character._id,
    attributeKey: newAttr.key,
    claimA: {
      chapterId: existing.sourceChapterId as Types.ObjectId,
      quote: existing.sourceQuote,
      value: existing.value,
    },
    claimB: {
      chapterId: new Types.ObjectId(newChapterId),
      quote: newAttr.sourceQuote,
      value: newAttr.value,
    },
    severity: verdict.severity,
    confidence: verdict.confidence,
    classification: verdict.classification,
    aiReasoning: verdict.reasoning,
    status: 'open',
  });
}

// ─── Locations & objects (same pattern, simpler — no consistency pass for now) ─
async function mergeLocations(
  projectId: string,
  chapterId: string,
  extracted: Awaited<ReturnType<typeof extractChapter>>['locations'],
): Promise<void> {
  for (const el of extracted) {
    const loc = await Location.findOneAndUpdate(
      { projectId, canonicalName: el.canonicalName },
      { $setOnInsert: { projectId, canonicalName: el.canonicalName } },
      { upsert: true, new: true },
    );
    for (let i = loc.attributes.length - 1; i >= 0; i--) {
      if (String(loc.attributes[i]!.sourceChapterId) === chapterId) {
        loc.attributes.splice(i, 1);
      }
    }
    for (const attr of el.attributes ?? []) {
      loc.attributes.push({
        category: attr.category,
        key: attr.key,
        value: attr.value,
        sourceChapterId: new Types.ObjectId(chapterId),
        sourceQuote: attr.sourceQuote,
        confidence: attr.confidence,
        factuality: attr.factuality,
        extractedAt: new Date(),
      } as never);
    }
    await loc.save();
  }
}

async function mergeObjects(
  projectId: string,
  chapterId: string,
  extracted: Awaited<ReturnType<typeof extractChapter>>['objects'],
): Promise<void> {
  for (const eo of extracted) {
    const obj = await StoryObject.findOneAndUpdate(
      { projectId, canonicalName: eo.canonicalName },
      { $setOnInsert: { projectId, canonicalName: eo.canonicalName } },
      { upsert: true, new: true },
    );
    for (let i = obj.attributes.length - 1; i >= 0; i--) {
      if (String(obj.attributes[i]!.sourceChapterId) === chapterId) {
        obj.attributes.splice(i, 1);
      }
    }
    for (const attr of eo.attributes ?? []) {
      obj.attributes.push({
        category: attr.category,
        key: attr.key,
        value: attr.value,
        sourceChapterId: new Types.ObjectId(chapterId),
        sourceQuote: attr.sourceQuote,
        confidence: attr.confidence,
        factuality: attr.factuality,
        extractedAt: new Date(),
      } as never);
    }
    await obj.save();
  }
}

// ─── Events ──────────────────────────────────────────────────────────────────
async function persistEvents(
  projectId: string,
  chapterId: string,
  extracted: Awaited<ReturnType<typeof extractChapter>>['events'],
): Promise<void> {
  // Replace events sourced from this chapter (idempotent re-run)
  await Event.deleteMany({ projectId, chapterId });

  if (extracted.length === 0) return;

  // Map participant names → IDs
  const chars = await Character.find({ projectId }).select('canonicalName aliases').lean();
  const nameToId = new Map<string, string>();
  for (const c of chars) {
    nameToId.set(c.canonicalName.toLowerCase(), String(c._id));
    for (const alias of c.aliases ?? []) nameToId.set(alias.toLowerCase(), String(c._id));
  }

  const locs = await Location.find({ projectId }).select('canonicalName').lean();
  const locMap = new Map(locs.map((l) => [l.canonicalName.toLowerCase(), String(l._id)]));

  const docs = extracted.map((ev, idx) => ({
    projectId: new Types.ObjectId(projectId),
    chapterId: new Types.ObjectId(chapterId),
    summary: ev.summary,
    inWorldTime: ev.inWorldTime,
    participantIds: (ev.participants ?? [])
      .map((n) => nameToId.get(n.toLowerCase()))
      .filter(Boolean)
      .map((id) => new Types.ObjectId(id as string)),
    locationId: ev.location ? locMap.get(ev.location.toLowerCase()) : undefined,
    narrativeOrder: idx,
    significance: ev.significance,
  }));

  await Event.insertMany(docs);
}

// ─── Relationships ───────────────────────────────────────────────────────────
async function persistRelationships(
  projectId: string,
  chapterId: string,
  extracted: Awaited<ReturnType<typeof extractChapter>>['relationships'],
): Promise<void> {
  const chars = await Character.find({ projectId }).select('canonicalName aliases').lean();
  const nameToId = new Map<string, string>();
  for (const c of chars) {
    nameToId.set(c.canonicalName.toLowerCase(), String(c._id));
    for (const alias of c.aliases ?? []) nameToId.set(alias.toLowerCase(), String(c._id));
  }

  for (const r of extracted) {
    const fromId = nameToId.get(r.from.toLowerCase());
    const toId = nameToId.get(r.to.toLowerCase());
    if (!fromId || !toId || fromId === toId) continue;

    const rel = await Relationship.findOneAndUpdate(
      { projectId, fromCharacterId: fromId, toCharacterId: toId },
      {
        $setOnInsert: {
          projectId,
          fromCharacterId: fromId,
          toCharacterId: toId,
          type: r.type,
        },
      },
      { upsert: true, new: true },
    );

    // Drop existing evolution entry from this chapter and re-append
    for (let i = rel.evolution.length - 1; i >= 0; i--) {
      if (String(rel.evolution[i]!.chapterId) === chapterId) {
        rel.evolution.splice(i, 1);
      }
    }
    if (r.evolutionSummary) {
      rel.evolution.push({
        chapterId: new Types.ObjectId(chapterId),
        summary: r.evolutionSummary,
        tone: r.tone ?? 'stable',
      } as never);
    }
    if (!rel.type) rel.type = r.type;
    await rel.save();
  }
}

// ─── Chunks + embeddings ─────────────────────────────────────────────────────
async function reindexChunks(
  projectId: string,
  chapterId: string,
  content: string,
  version: number,
): Promise<void> {
  // Throw out existing chunks for this chapter — we always rewrite.
  await Chunk.deleteMany({ chapterId });

  const chunks = chunkChapter(content);
  if (chunks.length === 0) return;

  // Embed in one batch call
  const vectors = await embedTexts(chunks.map((c) => c.text), 'document');

  const docs = chunks.map((c, i) => ({
    projectId: new Types.ObjectId(projectId),
    chapterId: new Types.ObjectId(chapterId),
    text: c.text,
    span: c.span,
    embedding: vectors[i],
    chapterVersion: version,
  }));

  await Chunk.insertMany(docs);
}

// ─── Utilities ───────────────────────────────────────────────────────────────
function stronger(a?: string, b?: string): 'main' | 'secondary' | 'tertiary' | 'mentioned' {
  const order = { main: 0, secondary: 1, tertiary: 2, mentioned: 3 } as const;
  type Key = keyof typeof order;
  const safeA: Key = (a && a in order ? a : 'mentioned') as Key;
  const safeB: Key = (b && b in order ? b : 'mentioned') as Key;
  return order[safeA] <= order[safeB] ? safeA : safeB;
}
