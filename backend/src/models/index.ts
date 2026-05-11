/**
 * Plotwise data model.
 *
 * Three layers (cf. architecture doc):
 *   1. Raw text       — Chapter.content, the source of truth the author edits
 *   2. Structured     — Character / Location / Event / etc., AI-extracted, scene-anchored
 *   3. Vector index   — Chunk, for RAG retrieval
 *
 * Crucial pattern: every claim (attribute) carries its source chapter + quote.
 * That's what enables:
 *   - Incremental rebuilds when a chapter changes (drop old claims from that chapter, re-extract)
 *   - Contradiction detection (compare same `key` across chapters)
 *   - Citation in the UI ("Tome I, ch. 2 says...")
 */

import { Schema, model, Types, type InferSchemaType } from 'mongoose';

// ─── User ────────────────────────────────────────────────────────────────────
const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: String,
    plan: { type: String, enum: ['free', 'auteur', 'pro'], default: 'free' },
    passwordHash: { type: String, select: false },
  },
  { timestamps: true },
);
export const User = model('User', userSchema);
export type UserDoc = InferSchemaType<typeof userSchema>;

// ─── Project ─────────────────────────────────────────────────────────────────
// A project = a universe. Can hold multiple tomes via Chapter.parentId.
const projectSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    description: String,
    language: { type: String, default: 'fr' },
    genre: String,
  },
  { timestamps: true },
);
export const Project = model('Project', projectSchema);

// ─── Chapter (and tome / part nodes) ─────────────────────────────────────────
const chapterSchema = new Schema(
  {
    projectId: { type: Types.ObjectId, ref: 'Project', required: true, index: true },
    parentId: { type: Types.ObjectId, ref: 'Chapter', default: null }, // for tome/part nesting
    kind: { type: String, enum: ['tome', 'part', 'chapter'], default: 'chapter' },
    title: { type: String, required: true },
    order: { type: Number, required: true },
    content: { type: String, default: '' },
    wordCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['outline', 'draft', 'revised', 'done'],
      default: 'draft',
    },
    /**
     * Bumped on every content change. The analysis pipeline compares
     * `analysisVersion` against `lastAnalyzedVersion` to know if re-extraction is needed.
     */
    analysisVersion: { type: Number, default: 0 },
    lastAnalyzedVersion: { type: Number, default: -1 },
    lastAnalyzedAt: Date,
    aiSummary: String, // generated summary used in bible-summary prompts
  },
  { timestamps: true },
);
chapterSchema.index({ projectId: 1, order: 1 });
chapterSchema.index({ projectId: 1, parentId: 1, order: 1 });
export const Chapter = model('Chapter', chapterSchema);

// ─── Attribute (embedded) ────────────────────────────────────────────────────
// One factual claim about an entity, attached to the chapter that introduced it.
// Multiple attributes with same `key` and different `value` from different chapters
// → contradiction candidate.
const attributeSchema = new Schema(
  {
    category: {
      type: String,
      enum: ['physical', 'psychological', 'background', 'skill', 'state', 'relational'],
      required: true,
    },
    key: { type: String, required: true }, // e.g. 'eye_color', 'profession', 'native_city'
    value: { type: String, required: true }, // e.g. 'blue', 'cartographer'
    sourceChapterId: { type: Types.ObjectId, ref: 'Chapter', required: true },
    sourceQuote: String, // verbatim excerpt
    sourceSpan: { type: [Number], default: undefined }, // [startChar, endChar] in chapter
    confidence: { type: Number, min: 0, max: 1, default: 0.9 },
    factuality: {
      type: String,
      enum: ['stated', 'inferred', 'temporary'], // 'temporary' = mood, injury, etc.
      default: 'stated',
    },
    extractedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

// ─── Entity base (Character / Location / Object) ─────────────────────────────
// Three different collections rather than discriminators — keeps queries explicit.
const baseEntityFields = {
  projectId: { type: Types.ObjectId, ref: 'Project', required: true, index: true },
  canonicalName: { type: String, required: true },
  aliases: { type: [String], default: [] },
  attributes: { type: [attributeSchema], default: [] },
  appearances: {
    type: [
      {
        _id: false,
        chapterId: { type: Types.ObjectId, ref: 'Chapter' },
        mentionCount: Number,
      },
    ],
    default: [],
  },
  summary: String, // AI-maintained synopsis (updated when a chapter referencing this entity changes)
};

const characterSchema = new Schema(
  {
    ...baseEntityFields,
    importance: {
      type: String,
      enum: ['main', 'secondary', 'tertiary', 'mentioned'],
      default: 'mentioned',
    },
  },
  { timestamps: true },
);
characterSchema.index({ projectId: 1, canonicalName: 1 }, { unique: true });
export const Character = model('Character', characterSchema);

const locationSchema = new Schema({ ...baseEntityFields }, { timestamps: true });
locationSchema.index({ projectId: 1, canonicalName: 1 }, { unique: true });
export const Location = model('Location', locationSchema);

const storyObjectSchema = new Schema({ ...baseEntityFields }, { timestamps: true });
storyObjectSchema.index({ projectId: 1, canonicalName: 1 }, { unique: true });
export const StoryObject = model('StoryObject', storyObjectSchema);

// ─── Event (timeline node) ───────────────────────────────────────────────────
const eventSchema = new Schema(
  {
    projectId: { type: Types.ObjectId, ref: 'Project', required: true, index: true },
    chapterId: { type: Types.ObjectId, ref: 'Chapter', required: true },
    summary: { type: String, required: true },
    inWorldTime: String, // free-form, e.g. "Croissant des Cendres, jour 3"
    participantIds: [{ type: Types.ObjectId, ref: 'Character' }],
    locationId: { type: Types.ObjectId, ref: 'Location' },
    narrativeOrder: Number, // order of appearance in the manuscript
    chronologicalOrder: Number, // in-world order (may differ from narrative)
    significance: { type: String, enum: ['minor', 'pivotal'], default: 'minor' },
  },
  { timestamps: true },
);
eventSchema.index({ projectId: 1, narrativeOrder: 1 });
export const Event = model('Event', eventSchema);

// ─── Relationship ────────────────────────────────────────────────────────────
const relationshipSchema = new Schema(
  {
    projectId: { type: Types.ObjectId, ref: 'Project', required: true, index: true },
    fromCharacterId: { type: Types.ObjectId, ref: 'Character', required: true },
    toCharacterId: { type: Types.ObjectId, ref: 'Character', required: true },
    type: String, // 'mentor', 'rival', 'lover', 'family-parent', etc.
    descriptors: { type: [String], default: [] },
    evolution: {
      type: [
        {
          _id: false,
          chapterId: { type: Types.ObjectId, ref: 'Chapter' },
          summary: String,
          tone: { type: String, enum: ['warming', 'cooling', 'shift', 'stable'] },
        },
      ],
      default: [],
    },
  },
  { timestamps: true },
);
relationshipSchema.index(
  { projectId: 1, fromCharacterId: 1, toCharacterId: 1 },
  { unique: true },
);
export const Relationship = model('Relationship', relationshipSchema);

// ─── Inconsistency (detected by analysis pipeline) ───────────────────────────
const inconsistencySchema = new Schema(
  {
    projectId: { type: Types.ObjectId, ref: 'Project', required: true, index: true },
    entityType: {
      type: String,
      enum: ['character', 'location', 'object', 'event', 'timeline'],
      required: true,
    },
    entityId: { type: Types.ObjectId, required: true },
    attributeKey: String,

    claimA: {
      chapterId: { type: Types.ObjectId, ref: 'Chapter' },
      quote: String,
      value: String,
    },
    claimB: {
      chapterId: { type: Types.ObjectId, ref: 'Chapter' },
      quote: String,
      value: String,
    },

    severity: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    confidence: { type: Number, min: 0, max: 1 },
    classification: {
      type: String,
      enum: ['factual', 'possible_evolution', 'ambiguous', 'extraction_error'],
    },
    aiReasoning: String,

    status: {
      type: String,
      enum: ['open', 'reviewing', 'resolved', 'ignored'],
      default: 'open',
    },
    resolutionNote: String,
  },
  { timestamps: true },
);
inconsistencySchema.index({ projectId: 1, status: 1, createdAt: -1 });
export const Inconsistency = model('Inconsistency', inconsistencySchema);

// ─── Chunk (text + vector for RAG) ───────────────────────────────────────────
// Atlas Vector Search index must be created on this collection separately;
// see scripts/createIndexes.ts.
const chunkSchema = new Schema(
  {
    projectId: { type: Types.ObjectId, ref: 'Project', required: true, index: true },
    chapterId: { type: Types.ObjectId, ref: 'Chapter', required: true, index: true },
    text: { type: String, required: true },
    span: { type: [Number], required: true }, // [startChar, endChar]
    embedding: { type: [Number], required: true },
    chapterVersion: Number, // == chapter.analysisVersion when this chunk was made
  },
  { timestamps: true },
);
export const Chunk = model('Chunk', chunkSchema);
