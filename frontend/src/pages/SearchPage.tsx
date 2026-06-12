import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { searchApi, chaptersApi } from '../lib/api';
import { qk } from '../lib/queryKeys';
import { Topbar } from '../components/Layout';
import { IconSearch } from '../components/icons';

/**
 * Semantic search page.
 *
 * Backed by the project's vector index (Atlas Vector Search). Finds passages by
 * meaning, not keyword. The query lives in the URL (?q=) so the Sidebar search
 * box can deep-link here and the result is shareable / refreshable.
 */
export function SearchPage() {
  const { projectId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get('q') ?? '';

  const [input, setInput] = useState(urlQuery);
  // Keep the box in sync when arriving via a deep link / back-forward nav.
  useEffect(() => setInput(urlQuery), [urlQuery]);

  const chaptersQ = useQuery({
    queryKey: qk.chapters(projectId),
    queryFn: () => chaptersApi.listForProject(projectId),
    enabled: !!projectId,
  });
  const chapterOrder = new Map(
    (chaptersQ.data?.chapters ?? []).map((c) => [c._id, c.order]),
  );

  const trimmed = urlQuery.trim();
  const resultsQ = useQuery({
    queryKey: qk.search(projectId, trimmed),
    queryFn: () => searchApi.semantic(projectId, trimmed, 12),
    enabled: !!projectId && trimmed.length >= 2,
  });

  const submit = () => {
    const q = input.trim();
    setParams(q ? { q } : {});
  };

  const hits = resultsQ.data?.hits ?? [];

  return (
    <>
      <Topbar crumbs={[{ label: 'Recherche' }]} />
      <div className="page-scroll">
        <div className="page">
          <h1 className="page-title">Recherche sémantique</h1>
          <p className="page-subtitle">
            Retrouvez un passage par le sens, pas par mot-clé exact.
          </p>

          <div className="se-box">
            <span className="se-ico">
              <IconSearch size={15} />
            </span>
            <input
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
              placeholder="ex. la promesse faite au bord du fleuve"
            />
            <button className="btn primary" onClick={submit} disabled={!input.trim()}>
              Chercher
            </button>
          </div>

          {trimmed.length >= 2 && resultsQ.isLoading && (
            <div className="loading">Recherche…</div>
          )}
          {resultsQ.isError && (
            <div className="empty">
              La recherche a échoué : {(resultsQ.error as Error).message}
              <div style={{ marginTop: 6, fontSize: 12 }}>
                L'index vectoriel n'est peut-être pas encore configuré (Atlas Vector Search).
              </div>
            </div>
          )}
          {!resultsQ.isLoading && trimmed.length >= 2 && hits.length === 0 && !resultsQ.isError && (
            <div className="empty">Aucun passage ne correspond à cette recherche.</div>
          )}
          {trimmed.length < 2 && (
            <div className="empty">Saisissez au moins deux caractères pour lancer une recherche.</div>
          )}

          <ul className="se-results">
            {hits.map((h) => {
              const order = chapterOrder.get(h.chapterId);
              return (
                <li key={h.chunkId} className="se-hit">
                  <Link
                    to={`/projects/${projectId}/manuscript/${h.chapterId}`}
                    className="se-hit-head"
                  >
                    <span className="se-hit-chap">
                      {order !== undefined && (
                        <span className="num">{String(order).padStart(2, '0')}</span>
                      )}
                      {h.chapterTitle}
                    </span>
                    <span className="se-hit-score">{(h.score * 100).toFixed(0)}%</span>
                  </Link>
                  <p className="se-hit-text">{h.text}</p>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <style>{`
        .se-box {
          display: flex; align-items: center; gap: 8px;
          position: relative; margin-bottom: 24px;
        }
        .se-box .se-ico {
          position: absolute; left: 12px; top: 50%; transform: translateY(-50%);
          color: var(--text-3); pointer-events: none;
        }
        .se-box input {
          flex: 1;
          background: var(--bg-panel);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 9px 12px 9px 34px;
          color: var(--text); font-family: inherit; font-size: 13.5px;
          outline: none; transition: border-color 120ms;
        }
        .se-box input:focus { border-color: var(--border-strong); }

        .se-results { list-style: none; display: flex; flex-direction: column; gap: 8px; }
        .se-hit {
          background: var(--bg-panel);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 12px 14px;
          transition: border-color 100ms;
        }
        .se-hit:hover { border-color: var(--border-strong); }
        .se-hit-head {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 7px;
        }
        .se-hit-chap {
          display: flex; align-items: center; gap: 9px;
          font-size: 12.5px; font-weight: 500; color: var(--text);
        }
        .se-hit-chap .num {
          font-family: var(--font-mono); font-size: 11px; color: var(--text-3);
        }
        .se-hit-score {
          font-family: var(--font-mono); font-size: 11px; color: var(--text-3);
        }
        .se-hit-text {
          font-family: var(--font-serif); font-size: 13.5px;
          color: var(--text-2); line-height: 1.6;
        }
      `}</style>
    </>
  );
}
