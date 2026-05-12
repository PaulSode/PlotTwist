import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bibleApi, chaptersApi, inconsistenciesApi } from '../lib/api';
import { qk } from '../lib/queryKeys';
import type { Chapter, ChapterStatus, Inconsistency } from '../lib/types';
import { refLabel } from '../lib/types';
import { IconAlert } from './icons';

interface EditorPanelProps {
  chapter: Chapter;
  /** Latest in-flight content (may differ from chapter.content). */
  draftWordCount: number;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedAt: Date | null;
}

export function EditorPanel({ chapter }: EditorPanelProps) {
  const chapterId = chapter._id;
  const projectId = chapter.projectId;
  const qc = useQueryClient();

  const charactersQ = useQuery({
    queryKey: qk.charactersInChapter(chapterId),
    queryFn: () => bibleApi.charactersInChapter(chapterId),
    enabled: !!chapterId,
  });

  const incoQ = useQuery({
    queryKey: qk.inconsistenciesForChapter(chapterId),
    queryFn: () => inconsistenciesApi.forChapter(chapterId),
    enabled: !!chapterId,
  });

  // ─── Status mutation ────────────────────────────────────────────────────
  // The sidebar reads status (to show the "brouillon" / "plan" tag), so we
  // invalidate both the chapter and the chapter list.
  const updateStatus = useMutation({
    mutationFn: (status: ChapterStatus) =>
      chaptersApi.updateMeta(chapterId, { status }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: qk.chapter(chapterId) }),
        qc.invalidateQueries({ queryKey: qk.chapters(projectId) }),
      ]);
    },
  });

  const characters = charactersQ.data?.characters ?? [];
  const inconsistencies = incoQ.data?.inconsistencies ?? [];

  // ─── Analysis state derivation ──────────────────────────────────────────
  // The default Mongoose values for a new chapter are analysisVersion=0 and
  // lastAnalyzedVersion=-1, which would naively show "en attente" forever for
  // an empty chapter the user hasn't typed in yet — no analysis job is ever
  // enqueued for empty content on the backend. Treat that case explicitly.
  const analysisDisplay = (() => {
    if (chapter.wordCount === 0) return '—';
    if (chapter.lastAnalyzedVersion < chapter.analysisVersion) return 'analyse en cours…';
    if (chapter.lastAnalyzedAt) return `à jour · ${formatRelative(chapter.lastAnalyzedAt)}`;
    return '—';
  })();
  const analysisPending =
    chapter.wordCount > 0 && chapter.lastAnalyzedVersion < chapter.analysisVersion;

  return (
    <aside className="panel">
      <div className="panel-tabs">
        <div className="ptab active">Dans la scène</div>
        <div className="ptab">
          Cohérence{' '}
          <span className={`num${inconsistencies.length > 0 ? ' alert' : ''}`}>
            {inconsistencies.length}
          </span>
        </div>
        <div className="ptab">Pistes</div>
      </div>

      <div className="panel-body">
        {/* Inconsistencies — surfaced first because they're the alert */}
        {inconsistencies.length > 0 && (
          <div className="psection">
            {inconsistencies.map((ic) => (
              <InconsistencyCard key={ic._id} inconsistency={ic} />
            ))}
          </div>
        )}

        {/* Characters */}
        <div className="psection">
          <div className="psection-label">
            Personnages <span className="count">{characters.length}</span>
          </div>
          {charactersQ.isLoading ? (
            <div className="loading" style={{ padding: '4px 6px' }}>
              …
            </div>
          ) : characters.length === 0 ? (
            <div className="loading" style={{ padding: '4px 6px' }}>
              {chapter.lastAnalyzedVersion < chapter.analysisVersion
                ? 'Analyse en cours…'
                : 'Aucun personnage extrait'}
            </div>
          ) : (
            characters.map((c) => (
              <div key={c._id} className="entity">
                <div className="iv">{initials(c.canonicalName)}</div>
                <div className="ename">{c.canonicalName}</div>
                <div className="erole">{translateImportance(c.importance)}</div>
              </div>
            ))
          )}
        </div>

        {/* Scene summary */}
        {chapter.aiSummary && (
          <div className="psection">
            <div className="psection-label">Résumé IA</div>
            <div className="note" style={{ fontFamily: 'var(--font-serif)' }}>
              {chapter.aiSummary}
            </div>
          </div>
        )}

        {/* Meta */}
        <div className="psection">
          <div className="psection-label">Avancement</div>
          <div className="meta-row">
            <span className="k">Mots</span>
            <span className="v">{chapter.wordCount.toLocaleString('fr-FR')}</span>
          </div>
          <div className="meta-row">
            <span className="k">Statut</span>
            <select
              className="meta-select"
              value={chapter.status}
              onChange={(e) => updateStatus.mutate(e.target.value as ChapterStatus)}
              disabled={updateStatus.isPending}
            >
              <option value="outline">plan</option>
              <option value="draft">brouillon</option>
              <option value="revised">revu</option>
              <option value="done">terminé</option>
            </select>
          </div>
          <div className="meta-row">
            <span className="k">Analyse</span>
            <span className="v">
              {analysisPending && <span className="analysis-pulse" />}
              {analysisDisplay}
            </span>
          </div>
        </div>
      </div>

      <div className="panel-foot">
        <span className="pulse" />
        Bible mise à jour à chaque sauvegarde
      </div>

      <PanelStyles />
    </aside>
  );
}

// ─── Inconsistency card ──────────────────────────────────────────────────────

function InconsistencyCard({ inconsistency }: { inconsistency: Inconsistency }) {
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: (status: 'resolved' | 'ignored') =>
      inconsistenciesApi.update(inconsistency._id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: qk.inconsistenciesForChapter(
          typeof inconsistency.claimB.chapterId === 'string'
            ? inconsistency.claimB.chapterId
            : inconsistency.claimB.chapterId._id,
        ),
      });
      qc.invalidateQueries({ queryKey: ['inconsistencies'] });
    },
  });

  const chapARef =
    typeof inconsistency.claimA.chapterId === 'string' ? null : inconsistency.claimA.chapterId;

  return (
    <div className="alert">
      <div className="alert-title">
        <IconAlert size={13} />
        Incohérence — {inconsistency.attributeKey ?? 'champ'}
      </div>
      <div className="alert-body">
        <span className="hi">« {inconsistency.claimB.quote ?? inconsistency.claimB.value} »</span>{' '}
        contredit une description antérieure.
      </div>
      <div className="alert-quote">
        {chapARef ? `${refLabel(chapARef)} : ` : ''}
        <em>« {inconsistency.claimA.quote ?? inconsistency.claimA.value} »</em>
      </div>
      {inconsistency.aiReasoning && (
        <div className="alert-meta">
          {inconsistency.aiReasoning.slice(0, 110)}
          {inconsistency.aiReasoning.length > 110 ? '…' : ''}
        </div>
      )}
      <div className="alert-actions">
        <button
          className="alert-btn primary"
          onClick={() => mut.mutate('resolved')}
          disabled={mut.isPending}
        >
          Résolu
        </button>
        <button
          className="alert-btn"
          onClick={() => mut.mutate('ignored')}
          disabled={mut.isPending}
        >
          Ignorer
        </button>
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

function translateImportance(s: string): string {
  return { main: 'principal', secondary: 'secondaire', tertiary: 'tertiaire', mentioned: 'évoqué' }[s] ?? s;
}

function formatRelative(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `il y a ${Math.round(diff)}s`;
  if (diff < 3600) return `il y a ${Math.round(diff / 60)}min`;
  if (diff < 86400) return `il y a ${Math.round(diff / 3600)}h`;
  return new Date(iso).toLocaleDateString('fr-FR');
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function PanelStyles() {
  return (
    <style>{`
      .panel {
        background: var(--bg-panel);
        border-left: 1px solid var(--border);
        display: flex; flex-direction: column;
        overflow: hidden;
      }
      .panel-tabs {
        height: 42px;
        border-bottom: 1px solid var(--border);
        display: flex; align-items: center;
        padding: 0 16px; gap: 18px;
        flex-shrink: 0;
      }
      .ptab {
        font-size: 12.5px; color: var(--text-3);
        cursor: pointer; padding: 13px 0;
        border-bottom: 1.5px solid transparent;
        margin-bottom: -1px; user-select: none;
        display: flex; align-items: center; gap: 5px;
        transition: color 100ms;
      }
      .ptab.active { color: var(--text); border-bottom-color: var(--text); }
      .ptab:hover:not(.active) { color: var(--text-2); }
      .ptab .num {
        font-family: var(--font-mono);
        font-size: 10.5px; color: var(--text-4);
      }
      .ptab .num.alert { color: var(--danger); }

      .panel-body { flex: 1; overflow-y: auto; padding: 14px 14px 24px; min-height: 0; }
      .psection { margin-bottom: 22px; }
      .psection:last-child { margin-bottom: 0; }
      .psection-label {
        font-size: 11px; color: var(--text-3); font-weight: 500;
        letter-spacing: 0.015em; padding: 0 4px 6px;
        display: flex; align-items: center; justify-content: space-between;
      }
      .psection-label .count { font-family: var(--font-mono); font-size: 10.5px; color: var(--text-4); }

      .alert {
        background: var(--bg-editor); border: 1px solid var(--border);
        border-radius: 6px; padding: 11px 12px 10px;
        margin-bottom: 8px;
      }
      .alert-title {
        display: flex; align-items: center; gap: 7px;
        font-size: 12.5px; font-weight: 500; color: var(--text);
        margin-bottom: 7px;
      }
      .alert-title svg { color: var(--danger); flex-shrink: 0; }
      .alert-body { font-size: 12.5px; color: var(--text-2); line-height: 1.55; margin-bottom: 8px; }
      .alert-body .hi {
        background: var(--danger-bg); color: var(--text);
        padding: 0 3px; border-radius: 2px;
      }
      .alert-quote {
        font-family: var(--font-serif); font-size: 12.5px;
        color: var(--text-2); font-style: italic;
        border-left: 1.5px solid var(--border-strong);
        padding: 2px 0 2px 9px; margin-bottom: 9px; line-height: 1.55;
      }
      .alert-quote em { font-style: italic; color: var(--text); }
      .alert-meta {
        display: flex; align-items: center; gap: 6px;
        font-size: 11px; color: var(--text-3); margin-bottom: 10px;
      }
      .alert-actions { display: flex; gap: 5px; }
      .alert-btn {
        background: none; border: 1px solid var(--border);
        color: var(--text-2); font-family: inherit; font-size: 11.5px;
        padding: 3px 8px; border-radius: 4px;
        cursor: pointer; transition: all 100ms;
      }
      .alert-btn:hover { background: var(--bg-hover); color: var(--text); border-color: var(--border-strong); }
      .alert-btn.primary { background: var(--text); color: var(--bg); border-color: var(--text); font-weight: 500; }
      .alert-btn[disabled] { opacity: 0.5; cursor: not-allowed; }

      .entity {
        display: flex; align-items: center; gap: 9px;
        padding: 5px 6px; border-radius: 5px;
        cursor: pointer; font-size: 12.5px; color: var(--text);
        transition: background 80ms;
      }
      .entity:hover { background: var(--bg-hover); }
      .entity .iv {
        width: 22px; height: 22px; border-radius: 50%;
        background: var(--bg-elevated); border: 1px solid var(--border);
        display: flex; align-items: center; justify-content: center;
        font-size: 9.5px; font-weight: 500; color: var(--text-2);
        flex-shrink: 0;
      }
      .entity .ename { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .entity .erole { font-size: 11px; color: var(--text-3); }

      .meta-row {
        display: flex; align-items: baseline; gap: 10px;
        padding: 5px 6px; font-size: 12.5px;
        border-radius: 5px;
      }
      .meta-row .k { color: var(--text-3); font-size: 11.5px; width: 62px; flex-shrink: 0; }
      .meta-row .v {
        color: var(--text); flex: 1;
        display: inline-flex; align-items: center; gap: 6px;
      }

      .meta-select {
        background: transparent;
        border: 1px solid transparent;
        color: var(--text);
        font-family: inherit;
        font-size: 12.5px;
        padding: 1px 6px;
        margin-left: -6px;
        border-radius: 4px;
        cursor: pointer;
        outline: none;
        transition: background 80ms, border-color 80ms;
      }
      .meta-select:hover {
        background: var(--bg-hover);
        border-color: var(--border);
      }
      .meta-select:focus {
        background: var(--bg-hover);
        border-color: var(--border-strong);
      }
      .meta-select option { background: var(--bg-elevated); color: var(--text); }
      .meta-select[disabled] { opacity: 0.5; cursor: wait; }

      .analysis-pulse {
        width: 5px; height: 5px;
        border-radius: 50%;
        background: var(--warning);
        animation: pulse 1.4s ease-in-out infinite;
        flex-shrink: 0;
      }
      @keyframes pulse {
        0%, 100% { opacity: 0.3; }
        50% { opacity: 1; }
      }

      .note {
        font-size: 12.5px; color: var(--text-2);
        line-height: 1.55; padding: 7px 8px;
        border-radius: 5px;
      }

      .panel-foot {
        padding: 9px 16px; border-top: 1px solid var(--border);
        font-size: 11px; color: var(--text-3);
        display: flex; align-items: center; gap: 6px; flex-shrink: 0;
      }
      .panel-foot .pulse {
        width: 5px; height: 5px; border-radius: 50%;
        background: var(--success); flex-shrink: 0;
      }
    `}</style>
  );
}