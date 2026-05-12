import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { bibleApi, chaptersApi } from '../lib/api';
import { qk } from '../lib/queryKeys';
import { refLabel, refId, type Chapter } from '../lib/types';
import { Topbar } from '../components/Layout';

export function RelationshipsPage() {
  const { projectId = '' } = useParams();

  const relsQ = useQuery({
    queryKey: qk.relationships(projectId),
    queryFn: () => bibleApi.relationships(projectId),
    enabled: !!projectId,
  });

  const chaptersQ = useQuery({
    queryKey: qk.chapters(projectId),
    queryFn: () => chaptersApi.listForProject(projectId),
    enabled: !!projectId,
  });

  const relationships = relsQ.data?.relationships ?? [];
  const chapterMap = new Map((chaptersQ.data?.chapters ?? []).map((c) => [c._id, c]));

  return (
    <>
      <Topbar crumbs={[{ label: 'Relations' }]} />
      <div className="page-scroll">
        <div className="page">
          <h1 className="page-title">Relations</h1>
          <p className="page-subtitle">
            {relationships.length} lien{relationships.length > 1 ? 's' : ''} entre
            personnages, suivi chapitre par chapitre
          </p>

          {relsQ.isLoading && <div className="loading">Chargement…</div>}
          {!relsQ.isLoading && relationships.length === 0 && (
            <div className="empty">
              Aucune relation détectée. L'IA les construit à partir des interactions.
            </div>
          )}

          <ul className="rel-list">
            {relationships.map((rel) => {
              const fromId = refId(rel.fromCharacterId);
              const toId = refId(rel.toCharacterId);
              return (
                <li key={rel._id} className="rel-card">
                  <div className="rel-head">
                    <div className="rel-pair">
                      {fromId ? (
                        <Link to={`/projects/${projectId}/characters/${fromId}`}>
                          {refLabel(rel.fromCharacterId)}
                        </Link>
                      ) : (
                        <span>{refLabel(rel.fromCharacterId)}</span>
                      )}
                      <span className="rel-arrow">→</span>
                      {toId ? (
                        <Link to={`/projects/${projectId}/characters/${toId}`}>
                          {refLabel(rel.toCharacterId)}
                        </Link>
                      ) : (
                        <span>{refLabel(rel.toCharacterId)}</span>
                      )}
                    </div>
                    <span className="rel-type">{rel.type}</span>
                  </div>

                  {rel.evolution.length > 0 && (
                    <ul className="rel-evolution">
                      {rel.evolution
                        .map((e) => ({ e, chapter: chapterMap.get(e.chapterId) }))
                        .filter((x): x is { e: typeof x.e; chapter: Chapter } => !!x.chapter)
                        .sort((a, b) => a.chapter.order - b.chapter.order)
                        .map(({ e, chapter }) => (
                          <li key={chapter._id} className={`rel-evo tone-${e.tone}`}>
                            <span className="rel-evo-tag">
                              ch. {chapter.order} · {labelTone(e.tone)}
                            </span>
                            <span className="rel-evo-summary">{e.summary}</span>
                          </li>
                        ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <style>{`
        .rel-list { list-style: none; display: flex; flex-direction: column; gap: 10px; }
        .rel-card {
          background: var(--bg-panel);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 14px 16px;
        }
        .rel-head {
          display: flex; align-items: center; gap: 12px;
          margin-bottom: 12px;
        }
        .rel-pair {
          flex: 1;
          display: flex; align-items: center; gap: 8px;
          font-size: 14px; color: var(--text); font-weight: 500;
        }
        .rel-pair a { color: var(--text); }
        .rel-pair a:hover { color: var(--accent); }
        .rel-arrow { color: var(--text-3); }
        .rel-type {
          font-size: 11px; color: var(--text-2);
          background: var(--bg-elevated);
          padding: 2px 8px; border-radius: 3px;
          letter-spacing: 0.01em;
        }

        .rel-evolution {
          list-style: none;
          display: flex; flex-direction: column; gap: 1px;
          border-left: 1px solid var(--border);
          padding-left: 0;
          margin-left: 4px;
        }
        .rel-evo {
          display: grid;
          grid-template-columns: 130px 1fr;
          gap: 14px;
          padding: 7px 0 7px 14px;
          font-size: 12.5px;
          position: relative;
        }
        .rel-evo::before {
          content: '';
          position: absolute; left: -4px; top: 13px;
          width: 7px; height: 7px;
          border-radius: 50%;
          background: var(--bg-panel);
          border: 1.5px solid var(--text-3);
        }
        .rel-evo.tone-warming::before { border-color: var(--success); }
        .rel-evo.tone-cooling::before { border-color: var(--danger); }
        .rel-evo.tone-shift::before { border-color: var(--accent); }
        .rel-evo-tag {
          color: var(--text-3); font-family: var(--font-mono);
          font-size: 11px;
        }
        .rel-evo-summary { color: var(--text-2); line-height: 1.55; }
      `}</style>
    </>
  );
}

function labelTone(tone: string): string {
  return ({ warming: 'rapprochement', cooling: 'éloignement', shift: 'bascule', stable: 'stable' } as Record<string, string>)[tone] ?? tone;
}
