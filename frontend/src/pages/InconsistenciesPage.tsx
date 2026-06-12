import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { bibleApi, inconsistenciesApi } from '../lib/api';
import { qk } from '../lib/queryKeys';
import { refLabel, type Inconsistency } from '../lib/types';
import { Topbar } from '../components/Layout';
import { IconAlert } from '../components/icons';

type Filter = 'open' | 'resolved' | 'ignored' | 'all';

export function InconsistenciesPage() {
  const { projectId = '' } = useParams();
  const [filter, setFilter] = useState<Filter>('open');

  const filterParam = filter === 'all' ? undefined : filter;

  const incoQ = useQuery({
    queryKey: qk.inconsistencies(projectId, filterParam),
    queryFn: () => inconsistenciesApi.forProject(projectId, filterParam),
    enabled: !!projectId,
  });

  // For displaying entity names. We fetch characters since 99% of detected
  // inconsistencies are character-related; if not loaded we fall back to id.
  const charsQ = useQuery({
    queryKey: qk.characters(projectId),
    queryFn: () => bibleApi.characters(projectId),
    enabled: !!projectId,
  });

  const charNameById = new Map(
    (charsQ.data?.characters ?? []).map((c) => [c._id, c.canonicalName]),
  );

  const items = incoQ.data?.inconsistencies ?? [];

  // Sort: high severity first, then most recent
  const sorted = [...items].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    if (a.severity !== b.severity) return order[a.severity] - order[b.severity];
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <>
      <Topbar crumbs={[{ label: 'Cohérence' }]} />
      <div className="page-scroll">
        <div className="page">
          <h1 className="page-title">Cohérence du manuscrit</h1>
          <p className="page-subtitle">
            Contradictions détectées par l'IA entre chapitres. Chaque alerte est citée
            verbatim.
          </p>

          <div className="filter-row">
            {(['open', 'resolved', 'ignored', 'all'] as const).map((f) => (
              <button
                key={f}
                className={`filter-btn${filter === f ? ' active' : ''}`}
                onClick={() => setFilter(f)}
              >
                {labelFilter(f)}
              </button>
            ))}
          </div>

          {incoQ.isLoading && <div className="loading">Chargement…</div>}
          {!incoQ.isLoading && sorted.length === 0 && (
            <div className="empty">
              {filter === 'open' ? (
                <>
                  <strong style={{ color: 'var(--text-2)' }}>Aucune incohérence ouverte.</strong>
                  <div style={{ marginTop: 6 }}>
                    L'IA n'a rien repéré qui contredise un fait antérieur.
                  </div>
                </>
              ) : (
                'Rien à afficher.'
              )}
            </div>
          )}

          <ul className="inco-list">
            {sorted.map((ic) => (
              <InconsistencyRow
                key={ic._id}
                inconsistency={ic}
                entityName={charNameById.get(ic.entityId) ?? '?'}
                projectId={projectId}
              />
            ))}
          </ul>
        </div>
      </div>

      <IncoStyles />
    </>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

interface RowProps {
  inconsistency: Inconsistency;
  entityName: string;
  projectId: string;
}

function InconsistencyRow({ inconsistency: ic, entityName, projectId }: RowProps) {
  const qc = useQueryClient();
  const mut = useMutation({
    mutationFn: (status: 'resolved' | 'ignored' | 'open') =>
      inconsistenciesApi.update(ic._id, { status }),
    onSuccess: () => {
      // Refresh every inconsistency view (list filters + sidebar badge + editor panel).
      qc.invalidateQueries({ queryKey: ['inconsistencies'] });
    },
  });

  const chapA = typeof ic.claimA.chapterId === 'string' ? null : ic.claimA.chapterId;
  const chapB = typeof ic.claimB.chapterId === 'string' ? null : ic.claimB.chapterId;
  const chapBId = typeof ic.claimB.chapterId === 'string' ? ic.claimB.chapterId : ic.claimB.chapterId._id;

  return (
    <li className={`inco severity-${ic.severity} status-${ic.status}`}>
      <div className="inco-head">
        <span className="inco-ico">
          <IconAlert size={13} />
        </span>
        <div className="inco-head-text">
          <span className="inco-entity">{entityName}</span>
          {ic.attributeKey && <span className="inco-key">· {ic.attributeKey}</span>}
        </div>
        <span className={`sev-tag sev-${ic.severity}`}>{labelSeverity(ic.severity)}</span>
        {ic.classification && (
          <span className="class-tag">{labelClassification(ic.classification)}</span>
        )}
      </div>

      <div className="inco-claims">
        <div className="claim">
          <div className="claim-source">{refLabel(chapA, 'Chapitre antérieur')}</div>
          <div className="claim-value">{ic.claimA.value}</div>
          {ic.claimA.quote && (
            <div className="claim-quote">« {ic.claimA.quote} »</div>
          )}
        </div>
        <div className="claim-arrow">→</div>
        <div className="claim">
          <div className="claim-source">
            {chapB ? (
              <Link to={`/projects/${projectId}/manuscript/${chapBId}`}>
                {refLabel(chapB, 'Chapitre récent')}
              </Link>
            ) : (
              'Chapitre récent'
            )}
          </div>
          <div className="claim-value">{ic.claimB.value}</div>
          {ic.claimB.quote && (
            <div className="claim-quote">« {ic.claimB.quote} »</div>
          )}
        </div>
      </div>

      {ic.aiReasoning && <div className="inco-reasoning">{ic.aiReasoning}</div>}

      <div className="inco-actions">
        {ic.status === 'open' && (
          <>
            <button
              className="btn small primary"
              onClick={() => mut.mutate('resolved')}
              disabled={mut.isPending}
            >
              Marquer résolu
            </button>
            <button
              className="btn small"
              onClick={() => mut.mutate('ignored')}
              disabled={mut.isPending}
            >
              Ignorer
            </button>
          </>
        )}
        {ic.status !== 'open' && (
          <>
            <span className="status-pill">
              {labelStatus(ic.status)}
              {ic.confidence ? ` · confiance ${(ic.confidence * 100).toFixed(0)}%` : ''}
            </span>
            <button
              className="btn small"
              onClick={() => mut.mutate('open')}
              disabled={mut.isPending}
            >
              Rouvrir
            </button>
          </>
        )}
      </div>
    </li>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function labelFilter(s: Filter): string {
  return { open: 'Ouvertes', resolved: 'Résolues', ignored: 'Ignorées', all: 'Toutes' }[s];
}

function labelSeverity(s: string): string {
  return { low: 'mineur', medium: 'moyen', high: 'majeur' }[s] ?? s;
}

function labelStatus(s: string): string {
  return { resolved: 'Résolue', ignored: 'Ignorée', reviewing: 'En cours' }[s] ?? s;
}

function labelClassification(s: string): string {
  return (
    {
      factual: 'contradiction',
      possible_evolution: 'évolution possible',
      ambiguous: 'ambigu',
      extraction_error: 'erreur d\'extraction',
    }[s] ?? s
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function IncoStyles() {
  return (
    <style>{`
      .filter-row { display: flex; gap: 6px; margin-bottom: 20px; }
      .filter-btn {
        background: none; border: 1px solid var(--border);
        color: var(--text-3); font-family: inherit; font-size: 12px;
        padding: 4px 10px; border-radius: 4px; cursor: pointer;
        transition: all 100ms;
      }
      .filter-btn:hover { color: var(--text-2); border-color: var(--border-strong); }
      .filter-btn.active { background: var(--text); color: var(--bg); border-color: var(--text); }

      .inco-list { list-style: none; display: flex; flex-direction: column; gap: 12px; }
      .inco {
        background: var(--bg-panel);
        border: 1px solid var(--border);
        border-radius: 6px; padding: 14px 16px;
      }
      .inco.severity-high { border-left: 2px solid var(--danger); padding-left: 14px; }
      .inco.severity-medium { border-left: 2px solid var(--warning); padding-left: 14px; }
      .inco.status-resolved, .inco.status-ignored { opacity: 0.6; }

      .inco-head {
        display: flex; align-items: center; gap: 9px;
        margin-bottom: 12px;
      }
      .inco-ico { color: var(--danger); display: flex; }
      .inco-head-text { flex: 1; font-size: 13.5px; color: var(--text); font-weight: 500; }
      .inco-key { color: var(--text-3); font-weight: 400; margin-left: 2px; }

      .sev-tag {
        font-size: 10.5px; padding: 1px 7px; border-radius: 3px;
        letter-spacing: 0.01em;
      }
      .sev-high { color: var(--danger); background: var(--danger-bg); }
      .sev-medium { color: var(--warning); background: rgba(214,185,119,0.10); }
      .sev-low { color: var(--text-3); background: var(--bg-elevated); }

      .class-tag {
        font-size: 10.5px; color: var(--text-3);
        background: var(--bg-elevated);
        padding: 1px 7px; border-radius: 3px;
        letter-spacing: 0.01em;
      }

      .inco-claims {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        gap: 14px;
        align-items: start;
        margin-bottom: 12px;
      }
      .claim {
        display: flex; flex-direction: column; gap: 4px;
        background: var(--bg-editor);
        border: 1px solid var(--border);
        border-radius: 5px; padding: 9px 11px;
      }
      .claim-source {
        font-size: 11px; color: var(--text-3);
        font-family: var(--font-mono);
      }
      .claim-source a { color: var(--text-3); }
      .claim-source a:hover { color: var(--text-2); text-decoration: underline; }
      .claim-value { font-size: 13px; color: var(--text); font-weight: 500; }
      .claim-quote {
        font-family: var(--font-serif); font-size: 12.5px;
        color: var(--text-2); font-style: italic; line-height: 1.5;
      }
      .claim-arrow {
        color: var(--text-3); font-size: 14px;
        padding-top: 28px;
      }

      .inco-reasoning {
        font-size: 12.5px; color: var(--text-2);
        line-height: 1.55;
        padding: 8px 10px;
        background: var(--bg-editor);
        border-radius: 5px;
        margin-bottom: 12px;
      }
      .inco-actions { display: flex; align-items: center; gap: 8px; }
      .status-pill {
        font-size: 11.5px; color: var(--text-3);
        font-family: var(--font-mono);
      }
    `}</style>
  );
}
