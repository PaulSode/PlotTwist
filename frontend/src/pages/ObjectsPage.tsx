import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { bibleApi } from '../lib/api';
import { qk } from '../lib/queryKeys';
import { Topbar } from '../components/Layout';

/**
 * Objects page — story-significant items (weapons, artefacts, letters…) the AI
 * extracts from the manuscript. Mirrors the Locations dashboard.
 */
export function ObjectsPage() {
  const { projectId = '' } = useParams();

  const objsQ = useQuery({
    queryKey: qk.objects(projectId),
    queryFn: () => bibleApi.objects(projectId),
    enabled: !!projectId,
  });

  const objects = objsQ.data?.objects ?? [];

  return (
    <>
      <Topbar crumbs={[{ label: 'Objets' }]} />
      <div className="page-scroll">
        <div className="page">
          <h1 className="page-title">Objets</h1>
          <p className="page-subtitle">
            {objects.length} objet{objects.length > 1 ? 's' : ''} narratif
            {objects.length > 1 ? 's' : ''} extrait{objects.length > 1 ? 's' : ''} du manuscrit
          </p>

          {objsQ.isLoading && <div className="loading">Chargement…</div>}
          {!objsQ.isLoading && objects.length === 0 && (
            <div className="empty">
              Aucun objet encore. L'IA repère les artefacts, armes et objets clés à mesure
              que vous écrivez.
            </div>
          )}

          <ul className="loc-list">
            {objects.map((obj) => (
              <li key={obj._id} className="loc-card">
                <div className="loc-name">{obj.canonicalName}</div>
                {obj.summary && <div className="loc-summary">{obj.summary}</div>}
                <div className="loc-meta">
                  {obj.attributes.length > 0 && (
                    <span>
                      {obj.attributes.length} trait{obj.attributes.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {obj.attributes.length > 0 && (
                  <div className="loc-attrs">
                    {obj.attributes.slice(0, 5).map((a, i) => (
                      <span key={i} className="loc-attr">
                        <span className="loc-attr-key">{a.key.replace(/_/g, ' ')}</span> {a.value}
                      </span>
                    ))}
                    {obj.attributes.length > 5 && (
                      <span className="loc-attr-more">+{obj.attributes.length - 5}</span>
                    )}
                  </div>
                )}
              </li>
            ))}
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
        .loc-name { font-size: 14px; font-weight: 500; color: var(--text); margin-bottom: 6px; }
        .loc-summary { font-size: 12.5px; color: var(--text-2); line-height: 1.55; margin-bottom: 10px; }
        .loc-meta {
          display: flex; flex-wrap: wrap; gap: 12px;
          font-size: 11px; color: var(--text-3);
          font-family: var(--font-mono); margin-bottom: 10px;
        }
        .loc-attrs {
          display: flex; flex-wrap: wrap; gap: 4px;
          padding-top: 10px; border-top: 1px solid var(--border);
        }
        .loc-attr {
          font-size: 11.5px; color: var(--text-2);
          background: var(--bg-editor); padding: 2px 7px; border-radius: 3px;
        }
        .loc-attr-key { color: var(--text-3); margin-right: 4px; }
        .loc-attr-more { font-size: 11px; color: var(--text-3); font-family: var(--font-mono); padding: 2px 4px; }
      `}</style>
    </>
  );
}
