import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bibleApi, chaptersApi, inconsistenciesApi } from '../lib/api';
import { qk } from '../lib/queryKeys';
import type { Chapter, ChapterStatus, Inconsistency } from '../lib/types';
import { refLabel } from '../lib/types';
import { IconAlert, IconChat, IconSparkle, IconCheck } from './icons';

type PanelTab = 'scene' | 'consistency' | 'leads';

interface EditorPanelProps {
  chapter: Chapter;
  /** Latest in-flight content (may differ from chapter.content). */
  draftWordCount: number;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedAt: Date | null;
  /** True while a user-triggered analysis is in flight. */
  analyzing: boolean;
  /** Index of the analysis phase currently running (-1 = none). */
  analysisStep: number;
  /** True when there are saved/local changes not yet analyzed. */
  hasUnanalyzed: boolean;
  analyzeError: string | null;
  onAnalyze: () => void;
}

/** Phases mirror the backend pipeline (ANALYSIS_STEPS), in order. */
const ANALYSIS_STEP_LABELS: { key: string; label: string }[] = [
  { key: 'preparing', label: 'Préparation' },
  { key: 'extracting', label: 'Extraction des entités' },
  { key: 'bible', label: 'Construction de la bible' },
  { key: 'indexing', label: 'Indexation (recherche)' },
  { key: 'finalizing', label: 'Finalisation' },
];

export function EditorPanel({
  chapter,
  analyzing,
  analysisStep,
  hasUnanalyzed,
  analyzeError,
  onAnalyze,
}: EditorPanelProps) {
  const chapterId = chapter._id;
  const projectId = chapter.projectId;
  const qc = useQueryClient();
  const [tab, setTab] = useState<PanelTab>('scene');

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
  // Analysis is manual now: a chapter can have unanalyzed changes sitting idle
  // (the author hasn't clicked "Analyser" yet). Distinguish:
  //   - analyzing                  → a run the user launched is in flight
  //   - hasUnanalyzed (not running)→ changes waiting for a manual analysis
  //   - up to date                 → analyzed, nothing new since
  const analysisDisplay = (() => {
    if (analyzing) return 'analyse en cours…';
    if (chapter.wordCount === 0) return '—';
    if (hasUnanalyzed) return 'modifications non analysées';
    if (chapter.lastAnalyzedAt) return `à jour · ${formatRelative(chapter.lastAnalyzedAt)}`;
    return 'jamais analysé';
  })();
  const analysisPending = analyzing;

  return (
    <aside className="panel">
      <div className="panel-tabs">
        <button
          className={`ptab${tab === 'scene' ? ' active' : ''}`}
          onClick={() => setTab('scene')}
        >
          Dans la scène
        </button>
        <button
          className={`ptab${tab === 'consistency' ? ' active' : ''}`}
          onClick={() => setTab('consistency')}
        >
          Cohérence{' '}
          <span className={`num${inconsistencies.length > 0 ? ' alert' : ''}`}>
            {inconsistencies.length}
          </span>
        </button>
        <button
          className={`ptab${tab === 'leads' ? ' active' : ''}`}
          onClick={() => setTab('leads')}
        >
          Pistes
        </button>
      </div>

      <div className="panel-body">
        {tab === 'scene' && (
          <>
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
                  {analyzing
                    ? 'Analyse en cours…'
                    : hasUnanalyzed
                      ? 'Cliquez sur « Analyser le chapitre »'
                      : 'Aucun personnage extrait'}
                </div>
              ) : (
                characters.map((c) => (
                  <Link
                    key={c._id}
                    to={`/projects/${projectId}/characters/${c._id}`}
                    className="entity"
                  >
                    <div className="iv">{initials(c.canonicalName)}</div>
                    <div className="ename">{c.canonicalName}</div>
                    <div className="erole">{translateImportance(c.importance)}</div>
                  </Link>
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

              {analyzing ? (
                <AnalysisStepper currentStep={analysisStep} />
              ) : (
                <>
                  <button
                    className={`analyze-btn${hasUnanalyzed ? ' primary' : ''}`}
                    onClick={onAnalyze}
                    disabled={chapter.wordCount === 0 || !hasUnanalyzed}
                  >
                    <IconSparkle size={13} />
                    {hasUnanalyzed ? 'Analyser le chapitre' : 'Chapitre à jour'}
                  </button>
                  {analyzeError && <div className="analyze-error">{analyzeError}</div>}
                  <div className="analyze-hint">
                    L'analyse (personnages, cohérence, recherche) consomme des crédits IA.
                    Elle ne se lance qu'à la demande.
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {tab === 'consistency' && (
          <div className="psection">
            {incoQ.isLoading ? (
              <div className="loading" style={{ padding: '4px 6px' }}>…</div>
            ) : inconsistencies.length === 0 ? (
              <div className="note" style={{ color: 'var(--text-3)' }}>
                Aucune incohérence détectée dans ce chapitre.
              </div>
            ) : (
              inconsistencies.map((ic) => (
                <InconsistencyCard key={ic._id} inconsistency={ic} />
              ))
            )}
          </div>
        )}

        {tab === 'leads' && (
          <div className="psection">
            {chapter.aiSummary ? (
              <div className="note" style={{ fontFamily: 'var(--font-serif)', marginBottom: 14 }}>
                {chapter.aiSummary}
              </div>
            ) : (
              <div className="note" style={{ color: 'var(--text-3)', marginBottom: 14 }}>
                Écrivez quelques paragraphes : l'IA résumera la scène et l'assistant pourra
                vous proposer des pistes.
              </div>
            )}
            <Link
              to={`/projects/${projectId}/assistant`}
              className="lead-cta"
            >
              <IconChat size={13} />
              Demander des pistes à l'assistant
            </Link>
          </div>
        )}
      </div>

      <div className="panel-foot">
        <span className="pulse" />
        Bible mise à jour à chaque sauvegarde
      </div>

      <PanelStyles />
    </aside>
  );
}

// ─── Analysis stepper ────────────────────────────────────────────────────────

function AnalysisStepper({ currentStep }: { currentStep: number }) {
  // currentStep is the index of the running phase (clamped to a sensible range).
  const active = Math.max(0, currentStep);
  return (
    <div className="stepper">
      <div className="stepper-head">
        <span className="analysis-pulse" />
        Analyse en cours…
      </div>
      <ol className="stepper-list">
        {ANALYSIS_STEP_LABELS.map((s, i) => {
          const state = i < active ? 'done' : i === active ? 'active' : 'pending';
          return (
            <li key={s.key} className={`stepper-item ${state}`}>
              <span className="stepper-marker">
                {state === 'done' ? <IconCheck size={11} /> : <span className="stepper-dot" />}
              </span>
              <span className="stepper-label">{s.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
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
        background: none; border: none;
        border-bottom: 1.5px solid transparent;
        margin-bottom: -1px; user-select: none;
        font-family: inherit;
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

      .lead-cta {
        display: flex; align-items: center; justify-content: center; gap: 7px;
        padding: 9px 12px; border-radius: 6px;
        border: 1px solid var(--border);
        background: var(--bg-editor);
        color: var(--text-2); font-size: 12.5px;
        transition: all 100ms;
      }
      .lead-cta:hover { border-color: var(--border-strong); color: var(--text); }
      .lead-cta svg { flex-shrink: 0; }

      .analyze-btn {
        width: 100%; margin-top: 12px;
        display: flex; align-items: center; justify-content: center; gap: 7px;
        padding: 8px 12px; border-radius: 6px;
        border: 1px solid var(--border);
        background: var(--bg-editor);
        color: var(--text-2); font-family: inherit; font-size: 12.5px;
        cursor: pointer; transition: all 100ms;
      }
      .analyze-btn:hover:not([disabled]) { border-color: var(--border-strong); color: var(--text); }
      .analyze-btn.primary {
        background: var(--accent); color: #1a1206;
        border-color: var(--accent); font-weight: 500;
      }
      .analyze-btn.primary:hover:not([disabled]) { background: #cdab7e; border-color: #cdab7e; }
      .analyze-btn[disabled] { opacity: 0.5; cursor: not-allowed; }
      .analyze-btn svg { flex-shrink: 0; }
      .analyze-error {
        margin-top: 8px; font-size: 11.5px; color: var(--danger);
        line-height: 1.45;
      }
      .analyze-hint {
        margin-top: 8px; font-size: 11px; color: var(--text-3);
        line-height: 1.45;
      }

      .stepper {
        margin-top: 12px;
        border: 1px solid var(--border);
        border-radius: 7px;
        padding: 12px 13px 13px;
        background: var(--bg-editor);
      }
      .stepper-head {
        display: flex; align-items: center; gap: 7px;
        font-size: 12px; color: var(--text); font-weight: 500;
        margin-bottom: 12px;
      }
      .stepper-list { list-style: none; display: flex; flex-direction: column; }
      .stepper-item {
        display: flex; align-items: center; gap: 10px;
        position: relative; padding: 5px 0;
        font-size: 12px; color: var(--text-3);
      }
      /* connector line between markers */
      .stepper-item:not(:last-child)::before {
        content: ''; position: absolute;
        left: 8px; top: 22px; bottom: -3px;
        width: 1.5px; background: var(--border);
      }
      .stepper-item.done::before { background: var(--success); }
      .stepper-marker {
        width: 17px; height: 17px; flex-shrink: 0;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        border: 1.5px solid var(--border-strong);
        background: var(--bg-panel); color: var(--bg);
        z-index: 1;
      }
      .stepper-dot {
        width: 5px; height: 5px; border-radius: 50%;
        background: var(--text-4);
      }
      .stepper-item.done .stepper-marker {
        background: var(--success); border-color: var(--success); color: #0d1410;
      }
      .stepper-item.active .stepper-marker {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px var(--accent-bg);
      }
      .stepper-item.active .stepper-dot {
        background: var(--accent);
        animation: pulse 1.2s ease-in-out infinite;
      }
      .stepper-item.active .stepper-label { color: var(--text); font-weight: 500; }
      .stepper-item.done .stepper-label { color: var(--text-2); }

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