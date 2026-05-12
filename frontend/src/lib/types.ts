/**
 * Domain types — mirror the shapes the backend returns.
 *
 * Kept loose where the backend can return either a populated ref or a raw id;
 * callers normalize via the small helpers below.
 */

export type ID = string;

export interface Project {
  _id: ID;
  userId: ID;
  title: string;
  description?: string;
  language: string;
  genre?: string;
  createdAt: string;
  updatedAt: string;
}

export type ChapterKind = 'tome' | 'part' | 'chapter';
export type ChapterStatus = 'outline' | 'draft' | 'revised' | 'done';

export interface Chapter {
  _id: ID;
  projectId: ID;
  parentId: ID | null;
  kind: ChapterKind;
  title: string;
  order: number;
  content: string;
  wordCount: number;
  status: ChapterStatus;
  analysisVersion: number;
  lastAnalyzedVersion: number;
  lastAnalyzedAt?: string;
  aiSummary?: string;
  createdAt: string;
  updatedAt: string;
}

export type AttributeCategory =
  | 'physical'
  | 'psychological'
  | 'background'
  | 'skill'
  | 'state'
  | 'relational';

export type Factuality = 'stated' | 'inferred' | 'temporary';

export interface Attribute {
  _id?: ID;
  category: AttributeCategory;
  key: string;
  value: string;
  sourceChapterId: ID;
  sourceQuote?: string;
  confidence: number;
  factuality: Factuality;
  extractedAt?: string;
}

export interface Appearance {
  chapterId: ID;
  mentionCount: number;
}

export interface Character {
  _id: ID;
  projectId: ID;
  canonicalName: string;
  aliases: string[];
  importance: 'main' | 'secondary' | 'tertiary' | 'mentioned';
  attributes: Attribute[];
  appearances: Appearance[];
  summary?: string;
}

export interface Location {
  _id: ID;
  projectId: ID;
  canonicalName: string;
  aliases: string[];
  attributes: Attribute[];
  appearances: Appearance[];
  summary?: string;
}

export interface StoryObject {
  _id: ID;
  projectId: ID;
  canonicalName: string;
  attributes: Attribute[];
  summary?: string;
}

export interface TimelineEvent {
  _id: ID;
  projectId: ID;
  chapterId: ID;
  summary: string;
  inWorldTime?: string;
  participantIds: Array<{ _id: ID; canonicalName: string } | ID>;
  locationId?: { _id: ID; canonicalName: string } | ID;
  narrativeOrder: number;
  significance: 'minor' | 'pivotal';
}

export interface Relationship {
  _id: ID;
  projectId: ID;
  fromCharacterId: { _id: ID; canonicalName: string } | ID;
  toCharacterId: { _id: ID; canonicalName: string } | ID;
  type: string;
  evolution: Array<{ chapterId: ID; summary: string; tone: string }>;
}

export interface Inconsistency {
  _id: ID;
  projectId: ID;
  entityType: 'character' | 'location' | 'object' | 'event' | 'timeline';
  entityId: ID;
  attributeKey?: string;
  claimA: {
    chapterId: { _id: ID; title: string; order: number } | ID;
    quote?: string;
    value?: string;
  };
  claimB: {
    chapterId: { _id: ID; title: string; order: number } | ID;
    quote?: string;
    value?: string;
  };
  severity: 'low' | 'medium' | 'high';
  confidence?: number;
  classification?: 'factual' | 'possible_evolution' | 'ambiguous' | 'extraction_error';
  aiReasoning?: string;
  status: 'open' | 'reviewing' | 'resolved' | 'ignored';
  createdAt: string;
}

export interface RagHit {
  chunkId: ID;
  chapterId: ID;
  chapterTitle: string;
  text: string;
  span: [number, number];
  score: number;
}

/** Tiny helper: when a field can be either a populated ref or a raw id, get the id. */
export function refId(ref: { _id: ID } | ID | undefined | null): ID | undefined {
  if (!ref) return undefined;
  return typeof ref === 'string' ? ref : ref._id;
}

/** Tiny helper: when a field can be populated, get a human label or fallback. */
export function refLabel(
  ref: { canonicalName?: string; title?: string } | ID | undefined | null,
  fallback = '?',
): string {
  if (!ref) return fallback;
  if (typeof ref === 'string') return fallback;
  return ref.canonicalName ?? ref.title ?? fallback;
}
