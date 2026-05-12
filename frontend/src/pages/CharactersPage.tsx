import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { bibleApi } from '../lib/api';
import { qk } from '../lib/queryKeys';
import { Topbar } from '../components/Layout';

export function CharactersPage() {
  const { projectId = '' } = useParams();

  const charsQ = useQuery({
    queryKey: qk.characters(projectId),
    queryFn: () => bibleApi.characters(projectId),
    enabled: !!projectId,
  });

  const characters = charsQ.data?.characters ?? [];

  // Sort by importance, then mention count
  const sorted = [...characters].sort((a, b) => {
    const order = { main: 0, secondary: 1, tertiary: 2, mentioned: 3 } as const;
    const ia = order[a.importance];
    const ib = order[b.importance];
    if (ia !== ib) return ia - ib;
    const ma = a.appearances.reduce((s, x) => s + x.mentionCount, 0);
    const mb = b.appearances.reduce((s, x) => s + x.mentionCount, 0);
    return mb - ma;
  });

  const grouped = groupBy(sorted, (c) => c.importance);

  return (
    <>
      <Topbar crumbs={[{ label: 'Personnages' }]} />
      <div className="page-scroll">
        <div className="page">
          <h1 className="page-title">Personnages</h1>
          <p className="page-subtitle">
            {characters.length} entité{characters.length > 1 ? 's' : ''} extraite
            {characters.length > 1 ? 's' : ''} du manuscrit
          </p>

          {charsQ.isLoading && <div className="loading">Chargement…</div>}
          {!charsQ.isLoading && characters.length === 0 && (
            <div className="empty">
              Aucun personnage encore. L'IA les extrait à mesure que vous écrivez.
            </div>
          )}

          {(['main', 'secondary', 'tertiary', 'mentioned'] as const).map((imp) => {
            const list = grouped.get(imp) ?? [];
            if (list.length === 0) return null;
            return (
              <section key={imp}>
                <div className="section-label">{labelImportance(imp)}</div>
                <ul className="char-list">
                  {list.map((c) => {
                    const mentions = c.appearances.reduce((s, x) => s + x.mentionCount, 0);
                    return (
                      <li key={c._id}>
                        <Link to={`/projects/${projectId}/characters/${c._id}`} className="char-row">
                          <div className="char-iv">{initials(c.canonicalName)}</div>
                          <div className="char-body">
                            <div className="char-name">{c.canonicalName}</div>
                            {c.aliases.length > 0 && (
                              <div className="char-aliases">a.k.a. {c.aliases.join(', ')}</div>
                            )}
                          </div>
                          <div className="char-stats">
                            <span>{c.appearances.length} chap.</span>
                            <span>{mentions} ment.</span>
                            <span>{c.attributes.length} trait{c.attributes.length > 1 ? 's' : ''}</span>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      </div>

      <style>{`
        .char-list { list-style: none; display: flex; flex-direction: column; gap: 4px; margin-bottom: 24px; }
        .char-row {
          display: flex; align-items: center; gap: 14px;
          padding: 10px 12px; border-radius: 5px;
          border: 1px solid transparent;
          transition: background 100ms, border-color 100ms;
        }
        .char-row:hover { background: var(--bg-panel); border-color: var(--border); }
        .char-iv {
          width: 30px; height: 30px;
          border-radius: 50%;
          background: var(--bg-elevated);
          border: 1px solid var(--border);
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 500; color: var(--text-2);
          flex-shrink: 0;
        }
        .char-body { flex: 1; min-width: 0; }
        .char-name {
          color: var(--text); font-size: 13.5px; font-weight: 500;
          margin-bottom: 2px;
        }
        .char-aliases {
          color: var(--text-3); font-size: 11.5px; font-style: italic;
        }
        .char-stats {
          display: flex; gap: 14px;
          color: var(--text-3); font-size: 11.5px;
          font-family: var(--font-mono);
        }
      `}</style>
    </>
  );
}

function labelImportance(s: string): string {
  return { main: 'Principaux', secondary: 'Secondaires', tertiary: 'Tertiaires', mentioned: 'Évoqués' }[s] ?? s;
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

function groupBy<T, K extends string>(list: T[], fn: (t: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of list) {
    const k = fn(item);
    const arr = map.get(k) ?? [];
    arr.push(item);
    map.set(k, arr);
  }
  return map;
}
