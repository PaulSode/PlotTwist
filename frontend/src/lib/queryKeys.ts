/**
 * Query key factory for TanStack Query.
 *
 * Keeping keys in one place makes invalidation predictable: after a chapter
 * save we invalidate ['characters', projectId] and ['inconsistencies', ...],
 * and any view consuming them refreshes automatically.
 */

export const qk = {
  me: () => ['me'] as const,
  projects: () => ['projects'] as const,
  project: (id: string) => ['project', id] as const,
  chapters: (projectId: string) => ['chapters', projectId] as const,
  chapter: (id: string) => ['chapter', id] as const,
  characters: (projectId: string) => ['characters', projectId] as const,
  character: (id: string) => ['character', id] as const,
  charactersInChapter: (chapterId: string) =>
    ['characters', 'in-chapter', chapterId] as const,
  locations: (projectId: string) => ['locations', projectId] as const,
  objects: (projectId: string) => ['objects', projectId] as const,
  timeline: (projectId: string) => ['timeline', projectId] as const,
  relationships: (projectId: string) => ['relationships', projectId] as const,
  inconsistencies: (projectId: string, status?: string) =>
    ['inconsistencies', projectId, status ?? 'all'] as const,
  inconsistenciesForChapter: (chapterId: string) =>
    ['inconsistencies', 'chapter', chapterId] as const,
  search: (projectId: string, query: string) =>
    ['search', projectId, query] as const,
};
