import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { chaptersApi, projectsApi } from '../lib/api';
import { qk } from '../lib/queryKeys';
import { Sidebar } from '../components/Sidebar';
import { EditorPanel } from '../components/EditorPanel';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { IconPlus, IconTrash } from '../components/icons';

/**
 * The manuscript editor.
 *
 * - Local content state is the source of truth while the user types
 * - 1.5s after the last keystroke we PUT the content
 * - The backend's analysis queue debounces 4s more before running extraction,
 *   so we don't need to do anything special — the right panel will refresh
 *   on its own via React Query's refetch.
 * - We poll the chapter every 5s to pick up `lastAnalyzedVersion` bumps, which
 *   in turn invalidate the right panel queries.
 */

const SAVE_DEBOUNCE_MS = 1500;
const ANALYSIS_POLL_MS = 5000;

export function ChapterEditorPage() {
  const { projectId = '', chapterId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // ─── Initial chapter selection ─────────────────────────────────────────
  // If no chapterId in URL and the project has chapters, jump to the first one.
  // If the project has NO chapters yet (freshly created), auto-create one so
  // the author lands in a writable editor immediately.
  const chaptersQ = useQuery({
    queryKey: qk.chapters(projectId),
    queryFn: () => chaptersApi.listForProject(projectId),
    enabled: !!projectId,
  });

  const projectQ = useQuery({
    queryKey: qk.project(projectId),
    queryFn: () => projectsApi.get(projectId),
    enabled: !!projectId,
  });

  const bootstrap = useMutation({
    mutationFn: () =>
      chaptersApi.create({
        projectId,
        kind: 'chapter',
        title: 'Chapitre 1',
        order: 1,
        content: '',
      }),
    onSuccess: ({ chapter }) => {
      qc.invalidateQueries({ queryKey: qk.chapters(projectId) });
      navigate(`/projects/${projectId}/manuscript/${chapter._id}`, { replace: true });
    },
  });

  useEffect(() => {
    // We only act when:
    //   - the user is on /manuscript without a chapterId in the URL, AND
    //   - we already know the chapter list (loaded), AND
    //   - we aren't already creating a chapter
    if (chapterId || !chaptersQ.data || bootstrap.isPending) return;

    const leaves = chaptersQ.data.chapters.filter((c) => c.kind === 'chapter');

    if (leaves.length > 0) {
      // Pick the first leaf chapter by order
      const first = [...leaves].sort((a, b) => a.order - b.order)[0]!;
      navigate(`/projects/${projectId}/manuscript/${first._id}`, { replace: true });
    } else {
      // Empty project — create a first chapter so the editor isn't stuck loading
      bootstrap.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, chaptersQ.data, projectId]);

  // ─── Selected chapter ──────────────────────────────────────────────────
  const chapterQ = useQuery({
    queryKey: qk.chapter(chapterId ?? ''),
    queryFn: () => chaptersApi.get(chapterId!),
    enabled: !!chapterId,
    // Poll to detect when the analysis pipeline has caught up
    refetchInterval: ANALYSIS_POLL_MS,
  });

  const chapter = chapterQ.data?.chapter;

  // ─── Local content state ───────────────────────────────────────────────
  const [content, setContent] = useState<string>('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>(
    'idle',
  );
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const previousChapterId = useRef<string | undefined>();
  const previousAnalyzed = useRef<number>(-1);

  // When the chapter switches, sync local content
  useEffect(() => {
    if (!chapter) return;
    if (previousChapterId.current !== chapter._id) {
      setContent(chapter.content ?? '');
      setSaveState('idle');
      previousChapterId.current = chapter._id;
      previousAnalyzed.current = chapter.lastAnalyzedVersion;
    }
  }, [chapter]);

  // When the analysis catches up to the latest save, refresh the right panel
  useEffect(() => {
    if (!chapter) return;
    if (chapter.lastAnalyzedVersion > previousAnalyzed.current) {
      previousAnalyzed.current = chapter.lastAnalyzedVersion;
      qc.invalidateQueries({ queryKey: qk.charactersInChapter(chapter._id) });
      qc.invalidateQueries({ queryKey: qk.inconsistenciesForChapter(chapter._id) });
    }
  }, [chapter, qc]);

  // ─── Save mutation ─────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: (text: string) => chaptersApi.saveContent(chapterId!, text),
    onMutate: () => setSaveState('saving'),
    onSuccess: (data) => {
      setSaveState('saved');
      setLastSavedAt(new Date(data.savedAt));
      qc.invalidateQueries({ queryKey: qk.chapter(chapterId!) });
      qc.invalidateQueries({ queryKey: qk.chapters(projectId) });
    },
    onError: () => setSaveState('error'),
  });

  // ─── Create chapter ────────────────────────────────────────────────────
  // Appends after the highest existing order, then jumps to it.
  const createChapter = useMutation({
    mutationFn: async () => {
      const all = chaptersQ.data?.chapters ?? [];
      const leaves = all.filter((c) => c.kind === 'chapter');
      const nextOrder =
        leaves.length === 0 ? 1 : Math.max(...leaves.map((c) => c.order)) + 1;
      // Inherit the same parentId as the current chapter if there is one —
      // that keeps the new chapter in the same tome/part visually.
      const parentId = chapter?.parentId ?? null;
      return chaptersApi.create({
        projectId,
        parentId,
        kind: 'chapter',
        title: `Chapitre ${nextOrder}`,
        order: nextOrder,
        content: '',
      });
    },
    onSuccess: async ({ chapter: created }) => {
      // Await the refetch so the sidebar is up-to-date before we navigate.
      await qc.invalidateQueries({ queryKey: qk.chapters(projectId) });
      navigate(`/projects/${projectId}/manuscript/${created._id}`);
    },
  });

  // ─── Delete chapter ────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false);

  const deleteChapter = useMutation({
    mutationFn: () => chaptersApi.remove(chapterId!),
    onSuccess: async () => {
      const all = chaptersQ.data?.chapters ?? [];
      const siblings = all
        .filter((c) => c.kind === 'chapter' && c._id !== chapterId)
        .sort((a, b) => a.order - b.order);

      let nextId: string | undefined;
      if (chapter) {
        const before = [...siblings].filter((c) => c.order < chapter.order).pop();
        nextId = before?._id ?? siblings[0]?._id;
      }

      setConfirmDelete(false);
      // Await refetch so the sidebar reflects the deletion before nav.
      await qc.invalidateQueries({ queryKey: qk.chapters(projectId) });
      // Drop the now-stale chapter detail from cache outright.
      qc.removeQueries({ queryKey: qk.chapter(chapterId!) });

      if (nextId) {
        navigate(`/projects/${projectId}/manuscript/${nextId}`, { replace: true });
      } else {
        navigate(`/projects/${projectId}/manuscript`, { replace: true });
      }
    },
  });

  // Debounced save on content changes
  useEffect(() => {
    if (!chapter) return;
    if (content === chapter.content) return;
    const timer = setTimeout(() => save.mutate(content), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  // ─── Render ───────────────────────────────────────────────────────────
  // CRITICAL: the Sidebar must live in the SAME tree position across all
  // states (loading, ready, transitioning). If we render it inside two
  // different parent elements, React unmounts and remounts it on transition,
  // which races with cache invalidation and causes the "must reload to see
  // new chapters" bug.

  const wordCount = countWords(content);
  const loadingMessage = !chapter ? buildLoadingMessage() : null;

  function buildLoadingMessage(): string {
    if (bootstrap.isPending) return 'Création du premier chapitre…';
    if (bootstrap.isError) return `Échec de la création : ${(bootstrap.error as Error).message}`;
    if (chaptersQ.isError)
      return `Impossible de charger les chapitres : ${(chaptersQ.error as Error).message}`;
    if (chapterQ.isError) return `Chapitre introuvable : ${(chapterQ.error as Error).message}`;
    if (!chapterId && chaptersQ.data) return 'Préparation de l\'éditeur…';
    return 'Chargement…';
  }

  return (
    <div className={`app ${chapter ? 'with-panel' : ''}`}>
      <Sidebar activeChapterId={chapterId} />

      <main className="main">
        {chapter ? (
          <>
            <header className="topbar">
              <nav className="crumbs">
                <a href={`/projects/${projectId}/manuscript`}>
                  {projectQ.data?.project.title ?? '…'}
                </a>
                <span className="sep">/</span>
                <span className="current">{chapter.title}</span>
              </nav>
              <div className="topbar-actions">
                <button
                  className="btn small"
                  onClick={() => createChapter.mutate()}
                  disabled={createChapter.isPending}
                  title="Ajouter un chapitre"
                >
                  <IconPlus size={11} />
                  {createChapter.isPending ? 'Création…' : 'Chapitre'}
                </button>
                <button
                  className="btn small"
                  onClick={() => setConfirmDelete(true)}
                  disabled={deleteChapter.isPending}
                  title="Supprimer ce chapitre"
                  aria-label="Supprimer ce chapitre"
                >
                  <IconTrash size={11} />
                </button>
                <SaveBadge state={saveState} wordCount={wordCount} savedAt={lastSavedAt} />
              </div>
            </header>

            <div className="editor-scroll">
              <article className="editor">
                <div className="chap-num">chapitre {chapter.order}</div>
                <h1 contentEditable suppressContentEditableWarning>
                  {chapter.title}
                </h1>
                <textarea
                  className="editor-textarea"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Commencez à écrire…"
                  spellCheck
                />
              </article>
            </div>
          </>
        ) : (
          <div className="loading" style={{ padding: 40 }}>
            {loadingMessage}
          </div>
        )}
      </main>

      {chapter && (
        <EditorPanel
          chapter={chapter}
          draftWordCount={wordCount}
          saveState={saveState}
          lastSavedAt={lastSavedAt}
        />
      )}

      {chapter && (
        <ConfirmDialog
          open={confirmDelete}
          title="Supprimer ce chapitre ?"
          message={
            <>
              Vous êtes sur le point de supprimer <em>{chapter.title}</em> (
              {wordCount.toLocaleString('fr-FR')} mots).
              <br />
              Les personnages, événements et incohérences extraits de ce chapitre seront
              également retirés de la bible. Cette action est irréversible.
            </>
          }
          confirmLabel="Supprimer"
          destructive
          busy={deleteChapter.isPending}
          onConfirm={() => deleteChapter.mutate()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      <EditorStyles />
    </div>
  );
}

// ─── Save state indicator ────────────────────────────────────────────────────

interface SaveBadgeProps {
  state: 'idle' | 'saving' | 'saved' | 'error';
  wordCount: number;
  savedAt: Date | null;
}

function SaveBadge({ state, wordCount, savedAt }: SaveBadgeProps) {
  const label =
    state === 'saving'
      ? 'Sauvegarde…'
      : state === 'error'
        ? 'Erreur de sauvegarde'
        : state === 'saved' && savedAt
          ? `Sauvegardé ${formatSecs(savedAt)}`
          : 'Synchronisé';

  return (
    <div className="save">
      <span
        className={`dot${state === 'saving' ? ' pending' : ''}${state === 'error' ? ' error' : ''}`}
      />
      {label} · {wordCount.toLocaleString('fr-FR')} mots
    </div>
  );
}

function formatSecs(d: Date): string {
  const diff = Math.round((Date.now() - d.getTime()) / 1000);
  if (diff < 5) return "à l'instant";
  if (diff < 60) return `il y a ${diff}s`;
  return `il y a ${Math.round(diff / 60)}min`;
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function EditorStyles() {
  return (
    <style>{`
      .editor-scroll {
        flex: 1; overflow-y: auto;
        padding: 56px 0 120px;
      }
      .editor {
        max-width: 680px; margin: 0 auto;
        padding: 0 40px;
        font-family: var(--font-serif);
        font-size: 17px; line-height: 1.78;
        color: var(--text);
      }
      .editor .chap-num {
        font-family: var(--font-sans);
        font-size: 11.5px; color: var(--text-3);
        letter-spacing: 0.04em;
        margin-bottom: 10px;
      }
      .editor h1 {
        font-family: var(--font-serif);
        font-size: 30px; font-weight: 500;
        letter-spacing: -0.012em; line-height: 1.2;
        margin-bottom: 44px;
        outline: none;
      }
      .editor-textarea {
        width: 100%;
        min-height: 60vh;
        background: transparent;
        border: none; outline: none; resize: none;
        font-family: inherit; font-size: inherit;
        line-height: inherit; color: inherit;
        padding: 0;
      }
      .editor-textarea::placeholder { color: var(--text-3); font-style: italic; }
    `}</style>
  );
}