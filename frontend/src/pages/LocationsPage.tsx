import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { bibleApi, chaptersApi } from '../lib/api';
import { qk } from '../lib/queryKeys';
import type { Chapter } from '../lib/types';
import { Topbar } from '../components/Layout';

export function LocationsPage() {
  const { projectId = '' } = useParams();

  const locsQ = useQuery({
    queryKey: qk.locations(projectId),
    queryFn: () => bibleApi.locations(projectId),
    enabled: !!projectId,
  });

  const chaptersQ = useQuery({
    queryKey: qk.chapters(projectId),
    queryFn: () => chaptersApi.listForProject(projectId),
    enabled: !!projectId,
  });

  const locations = locsQ.data?.locations ?? [];
  const chapterMap = new Map((chaptersQ.data?.chapters ?? []).map((c) => [c._id, c]));

  return (
    <>
      <Topbar crumbs={[{ label: 'Lieux' }]} />
      <div className="page-scroll">
        <div className="page">
          <h1 className="page-title">Lieux</h1>
          <p className="page-subtitle">
            {locations.length} lieu{locations.length > 1 ? 'x' : ''} extrait
            {locations.length > 1 ? 's' : ''} du manuscrit
          </p>

          {locsQ.isLoading && <div className="loading">Chargement…</div>}
          {!locsQ.isLoading && locations.length === 0 && (
            <div className="empty">Aucun lieu encore. L'IA les extrait à mesure.</div>
          )}

          <ul className="loc-list">
            {locations.map((loc) => {
              const firstChapter = loc.appearances
                .map((a) => chapterMap.get(a.chapterId))
                .filter((c): c is Chapter => !!c)
                .sort((a, b) => a.order - b.order)[0];

              return (
                <li key={loc._id} className="loc-card">
                  <div className="loc-name">{loc.canonicalName}</div>
                  {loc.summary && <div className="loc-summary">{loc.summary}</div>}
                  <div className="loc-meta">
                    {loc.attributes.length > 0 && (
                      <span>
                        {loc.attributes.length} trait{loc.attributes.length > 1 ? 's' : ''}
                      </span>
                    )}
                    {loc.appearances.length > 0 && (
                      <span>
                        {loc.appearances.length} apparition{loc.appearances.length > 1 ? 's' : ''}
                      </span>
                    )}
                    {firstChapter && (
                      <span>introduit chap. {firstChapter.order}</span>
                    )}
                  </div>
                  {loc.attributes.length > 0 && (
                    <div className="loc-attrs">
                      {loc.attributes.slice(0, 5).map((a, i) => (
                        <span key={i} className="loc-attr">
                          <span className="loc-attr-key">{a.key.replace(/_/g, ' ')}</span>{' '}
                          {a.value}
                        </span>
                      ))}
                      {loc.attributes.length > 5 && (
                        <span className="loc-attr-more">
                          +{loc.attributes.length - 5}
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <style>{`
        .loc-list {
          list-style: none;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 10px;
        }
        .loc-card {
          background: var(--bg-panel);
          border: 1px solid var(--border);
          border-radius: 6px;
          padding: 14px 16px;
          transition: border-color 100ms;
        }
        .loc-card:hover { border-color: var(--border-strong); }
        .loc-name {
          font-size: 14px; font-weight: 500; color: var(--text);
          margin-bottom: 6px;
        }
        .loc-summary {
          font-size: 12.5px; color: var(--text-2);
          line-height: 1.55; margin-bottom: 10px;
        }
        .loc-meta {
          display: flex; flex-wrap: wrap; gap: 12px;
          font-size: 11px; color: var(--text-3);
          font-family: var(--font-mono);
          margin-bottom: 10px;
        }
        .loc-attrs {
          display: flex; flex-wrap: wrap; gap: 4px;
          padding-top: 10px;
          border-top: 1px solid var(--border);
        }
        .loc-attr {
          font-size: 11.5px; color: var(--text-2);
          background: var(--bg-editor);
          padding: 2px 7px; border-radius: 3px;
        }
        .loc-attr-key { color: var(--text-3); margin-right: 4px; }
        .loc-attr-more {
          font-size: 11px; color: var(--text-3); font-family: var(--font-mono);
          padding: 2px 4px;
        }
      `}</style>
    </>
  );
}
