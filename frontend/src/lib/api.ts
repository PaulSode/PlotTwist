/**
 * Plotwise API client.
 *
 * Thin typed wrapper over fetch. The auth header uses the dev-mode bypass
 * documented in the backend's _auth.ts (`Authorization: Dev <userId>`); swap
 * in a real JWT flow before shipping.
 */

import type {
  Project,
  Chapter,
  Character,
  Location,
  StoryObject,
  TimelineEvent,
  Relationship,
  Inconsistency,
  RagHit,
  ChapterStatus,
  ID,
} from './types';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';
const DEV_USER = import.meta.env.VITE_DEV_USER_ID ?? '';

function headers(json = false): HeadersInit {
  const h: Record<string, string> = { Authorization: `Dev ${DEV_USER}` };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}/v1${path}`, init);
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body.error ?? body.message ?? '';
    } catch {
      /* not JSON */
    }
    throw new Error(`${res.status} ${res.statusText}${detail ? ` — ${detail}` : ''}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Projects ───────────────────────────────────────────────────────────────

export const projectsApi = {
  list: () => request<{ projects: Project[] }>('/projects', { headers: headers() }),
  get: (id: ID) => request<{ project: Project }>(`/projects/${id}`, { headers: headers() }),
  create: (data: { title: string; description?: string; language?: string; genre?: string }) =>
    request<{ project: Project }>('/projects', {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify(data),
    }),
};

// ─── Chapters ───────────────────────────────────────────────────────────────

export const chaptersApi = {
  listForProject: (projectId: ID) =>
    request<{ chapters: Chapter[] }>(`/projects/${projectId}/chapters`, { headers: headers() }),
  get: (id: ID) => request<{ chapter: Chapter }>(`/chapters/${id}`, { headers: headers() }),
  create: (data: {
    projectId: ID;
    parentId?: ID | null;
    kind?: 'tome' | 'part' | 'chapter';
    title: string;
    order: number;
    content?: string;
  }) =>
    request<{ chapter: Chapter }>('/chapters', {
      method: 'POST',
      headers: headers(true),
      body: JSON.stringify({ kind: 'chapter', content: '', ...data }),
    }),
  saveContent: (id: ID, content: string) =>
    request<{ savedAt: string; wordCount: number; analysisVersion: number }>(
      `/chapters/${id}/content`,
      {
        method: 'PUT',
        headers: headers(true),
        body: JSON.stringify({ content }),
      },
    ),
  updateMeta: (id: ID, data: { title?: string; status?: ChapterStatus; order?: number }) =>
    request<{ chapter: Chapter }>(`/chapters/${id}`, {
      method: 'PATCH',
      headers: headers(true),
      body: JSON.stringify(data),
    }),
  remove: (id: ID) =>
    request<void>(`/chapters/${id}`, {
      method: 'DELETE',
      headers: headers(),
    }),
};

// ─── Bible (read-only views over extracted entities) ────────────────────────

export const bibleApi = {
  characters: (projectId: ID) =>
    request<{ characters: Character[] }>(`/projects/${projectId}/characters`, {
      headers: headers(),
    }),
  character: (id: ID) =>
    request<{ character: Character }>(`/characters/${id}`, { headers: headers() }),
  charactersInChapter: (chapterId: ID) =>
    request<{ characters: Character[] }>(`/chapters/${chapterId}/characters`, {
      headers: headers(),
    }),
  locations: (projectId: ID) =>
    request<{ locations: Location[] }>(`/projects/${projectId}/locations`, { headers: headers() }),
  objects: (projectId: ID) =>
    request<{ objects: StoryObject[] }>(`/projects/${projectId}/objects`, { headers: headers() }),
  timeline: (projectId: ID) =>
    request<{ events: TimelineEvent[] }>(`/projects/${projectId}/timeline`, { headers: headers() }),
  relationships: (projectId: ID) =>
    request<{ relationships: Relationship[] }>(`/projects/${projectId}/relationships`, {
      headers: headers(),
    }),
};

// ─── Inconsistencies ────────────────────────────────────────────────────────

export const inconsistenciesApi = {
  forProject: (projectId: ID, status?: string) => {
    const qs = status ? `?status=${status}` : '';
    return request<{ inconsistencies: Inconsistency[] }>(
      `/projects/${projectId}/inconsistencies${qs}`,
      { headers: headers() },
    );
  },
  forChapter: (chapterId: ID) =>
    request<{ inconsistencies: Inconsistency[] }>(`/chapters/${chapterId}/inconsistencies`, {
      headers: headers(),
    }),
  update: (id: ID, data: { status?: string; resolutionNote?: string }) =>
    request<{ inconsistency: Inconsistency }>(`/inconsistencies/${id}`, {
      method: 'PATCH',
      headers: headers(true),
      body: JSON.stringify(data),
    }),
};

// ─── Search ─────────────────────────────────────────────────────────────────

export const searchApi = {
  semantic: (projectId: ID, query: string, k = 8) =>
    request<{ hits: RagHit[] }>(
      `/projects/${projectId}/search?q=${encodeURIComponent(query)}&k=${k}`,
      { headers: headers() },
    ),
};

// ─── Assistant (SSE streaming) ──────────────────────────────────────────────

export type AssistantEvent =
  | { type: 'start'; ragHits: string[] }
  | { type: 'delta'; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

/**
 * Stream the assistant's response. Calls onEvent for every SSE frame.
 * Returns a function that aborts the in-flight request.
 *
 * Implementation note: native EventSource doesn't support custom headers
 * (no Authorization), so we use fetch + manual SSE parsing instead.
 */
export function streamAssistant(args: {
  projectId: ID;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  currentChapterId?: ID;
  signal?: AbortSignal;
  onEvent: (event: AssistantEvent) => void;
}): Promise<void> {
  const controller = new AbortController();
  const signal = args.signal ?? controller.signal;

  return fetch(`${API}/v1/projects/${args.projectId}/assistant`, {
    method: 'POST',
    headers: headers(true),
    body: JSON.stringify({
      messages: args.messages,
      currentChapterId: args.currentChapterId,
    }),
    signal,
  }).then(async (res) => {
    if (!res.ok || !res.body) {
      throw new Error(`Assistant request failed: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const event = parseFrame(frame);
        if (event) args.onEvent(event);
      }
    }
  });
}

function parseFrame(frame: string): AssistantEvent | null {
  const lines = frame.split('\n');
  let eventName: string | undefined;
  let dataStr = '';
  for (const line of lines) {
    if (line.startsWith('event:')) eventName = line.slice(6).trim();
    else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
  }
  if (!eventName) return null;
  try {
    const data = dataStr ? JSON.parse(dataStr) : {};
    switch (eventName) {
      case 'start':
        return { type: 'start', ragHits: data.ragHits ?? [] };
      case 'delta':
        return { type: 'delta', text: data.text ?? '' };
      case 'done':
        return { type: 'done' };
      case 'error':
        return { type: 'error', message: data.message ?? 'unknown' };
      default:
        return null;
    }
  } catch {
    return null;
  }
}