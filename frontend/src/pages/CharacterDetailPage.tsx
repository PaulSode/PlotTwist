import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { bibleApi, chaptersApi } from '../lib/api';
import { qk } from '../lib/queryKeys';
import type { Attribute, Chapter } from '../lib/types';
import { Topbar } from '../components/Layout';

/**
 * Character detail page.
 *
 * The interesting thing here: every attribute (every fact about the character)
 * is grouped by category, and each fact shows its source chapter + verbatim
 * quote. That's the scene-anchored pattern made visible — the author can
 * trace every claim back to where it was stated.
 */
export function CharacterDetailPage() {
  const { projectId = '', characterId = '' } = useParams();

  const charQ = useQuery({
    queryKey: qk.character(characterId),
    queryFn: () => bibleApi.character(characterId),
    enabled: !!characterId,
  });

  const chaptersQ = useQuery({
    queryKey: qk.chapters(projectId),
    queryFn: () => chaptersApi.listForProject(projectId),
    enabled: !!projectId,
  });

  const character = charQ.data?.character;
  const chapterMap = new Map((chaptersQ.data?.chapters ?? []).map((c) => [c._id, c]));

  if (!character) {
    return (
      <>
        <Topbar crumbs={[{ label: 'Personnages' }]} />
        <div className="page-scroll">
          <div className="page">
            <div className="loading">Chargement…</div>
          </div>
        </div>
      </>
    );
  }

  const byCategory = groupAttributes(character.attributes);
  const totalMentions = character.appearances.reduce((s, a) => s + a.mentionCount, 0);

  return (
    <>
      <Topbar
        crumbs={[
          { label: 'Personnages', to: `/projects/${projectId}/characters` },
          { label: character.canonicalName },
        ]}
      />
      <div className="page-scroll">
        <div className="page">
          {/* Header */}
          <div className="char-header">
            <div className="char-portrait">{initials(character.canonicalName)}</div>
            <div className="char-meta">
              <h1 className="page-title" style={{ marginBottom: 6 }}>
                {character.canonicalName}
              </h1>
              {character.aliases.length > 0 && (
                <div className="char-sub">
                  Aussi appelé{character.aliases.length > 1 ? 's' : ''}{' '}
                  <em>{character.aliases.join(', ')}</em>
                </div>
              )}
              <div className="char-tags">
                <span className="tag">{labelImportance(character.importance)}</span>
                <span className="tag">{character.appearances.length} chapitres</span>
                <span className="tag">{totalMentions} mentions</span>
                <span className="tag">{character.attributes.length} traits</span>
              </div>
            </div>
          </div>

          {character.summary && (
            <div className="char-summary">{character.summary}</div>
          )}

          {/* Attributes by category */}
          {(['physical', 'psychological', 'background', 'skill', 'relational', 'state'] as const).map(
            (cat) => {
              const list = byCategory.get(cat) ?? [];
              if (list.length === 0) return null;
              return (
                <section key={cat} className="attr-section">
                  <div className="section-label">{labelCategory(cat)}</div>
                  <AttributeGroup attributes={list} chapterMap={chapterMap} />
                </section>
              );
            },
          )}

          {/* Appearances */}
          <section className="attr-section">
            <div className="section-label">Apparitions</div>
            <ul className="appearances">
              {character.appearances
                .map((app) => ({ app, chapter: chapterMap.get(app.chapterId) }))
                .filter((x): x is { app: typeof x.app; chapter: Chapter } => !!x.chapter)
                .sort((a, b) => a.chapter.order - b.chapter.order)
                .map(({ app, chapter }) => (
                  <li key={chapter._id}>
                    <Link
                      to={`/projects/${projectId}/manuscript/${chapter._id}`}
                      className="app-row"
                    >
                      <span className="num">{String(chapter.order).padStart(2, '0')}</span>
                      <span className="app-title">{chapter.title}</span>
                      <span className="app-mentions">
                        {app.mentionCount} mention{app.mentionCount > 1 ? 's' : ''}
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        </div>
      </div>

      <CharStyles />
    </>
  );
}

// ─── Attribute group ─────────────────────────────────────────────────────────

interface AttributeGroupProps {
  attributes: Attribute[];
  chapterMap: Map<string, Chapter>;
}

function AttributeGroup({ attributes, chapterMap }: AttributeGroupProps) {
  // Group by key (multiple attributes may share a key if the character evolves)
  const byKey = new Map<string, Attribute[]>();
  for (const attr of attributes) {
    const arr = byKey.get(attr.key) ?? [];
    arr.push(attr);
    byKey.set(attr.key, arr);
  }

  return (
    <ul className="attr-list">
      {[...byKey.entries()].map(([key, attrs]) => (
        <li key={key} className="attr-card">
          <div className="attr-key">{prettyKey(key)}</div>
          <div className="attr-values">
            {attrs.map((attr, i) => {
              const chapter = chapterMap.get(attr.sourceChapterId);
              return (
                <div key={attr._id ?? `${attr.value}-${i}`} className="attr-value-row">
                  <div className="attr-value">
                    {attr.value}
                    {attr.factuality === 'temporary' && (
                      <span className="attr-factuality">état temporaire</span>
                    )}
                    {attr.factuality === 'inferred' && (
                      <span className="attr-factuality">déduit</span>
                    )}
                  </div>
                  {attr.sourceQuote && (
                    <div className="attr-quote">« {attr.sourceQuote} »</div>
                  )}
                  {chapter && (
                    <div className="attr-source">
                      {chapter.title} · chap. {chapter.order}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupAttributes(list: Attribute[]): Map<string, Attribute[]> {
  const map = new Map<string, Attribute[]>();
  for (const attr of list) {
    const arr = map.get(attr.category) ?? [];
    arr.push(attr);
    map.set(attr.category, arr);
  }
  return map;
}

function prettyKey(key: string): string {
  return key.replace(/_/g, ' ');
}

function labelCategory(s: string): string {
  return (
    { physical: 'Apparence', psychological: 'Psychologie', background: 'Origine', skill: 'Compétences', relational: 'Relations', state: 'États' }[s] ?? s
  );
}

function labelImportance(s: string): string {
  return { main: 'Principal', secondary: 'Secondaire', tertiary: 'Tertiaire', mentioned: 'Évoqué' }[s] ?? s;
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function CharStyles() {
  return (
    <style>{`
      .char-header {
        display: flex; gap: 20px; align-items: flex-start;
        margin-bottom: 24px;
      }
      .char-portrait {
        width: 64px; height: 64px;
        border-radius: 50%;
        background: var(--bg-panel);
        border: 1px solid var(--border);
        display: flex; align-items: center; justify-content: center;
        font-size: 20px; font-weight: 500; color: var(--text-2);
        flex-shrink: 0;
      }
      .char-meta { flex: 1; min-width: 0; padding-top: 4px; }
      .char-sub { color: var(--text-3); font-size: 13px; margin-bottom: 10px; }
      .char-sub em { font-style: italic; color: var(--text-2); }
      .char-tags { display: flex; flex-wrap: wrap; gap: 6px; }
      .tag {
        font-size: 11px; color: var(--text-2);
        background: var(--bg-panel);
        border: 1px solid var(--border);
        padding: 2px 8px; border-radius: 4px;
      }

      .char-summary {
        font-family: var(--font-serif);
        font-size: 14.5px;
        color: var(--text-2);
        line-height: 1.65;
        border-left: 2px solid var(--border-strong);
        padding-left: 14px;
        margin: 4px 0 28px;
      }

      .attr-section { margin-bottom: 28px; }

      .attr-list { list-style: none; display: flex; flex-direction: column; gap: 4px; }
      .attr-card {
        display: grid;
        grid-template-columns: 140px 1fr;
        gap: 18px;
        padding: 12px 14px;
        border-radius: 5px;
        border: 1px solid transparent;
      }
      .attr-card:hover { border-color: var(--border); background: var(--bg-panel); }
      .attr-key {
        font-size: 12px; color: var(--text-3);
        padding-top: 1px;
      }
      .attr-values { display: flex; flex-direction: column; gap: 12px; }
      .attr-value-row { display: flex; flex-direction: column; gap: 4px; }
      .attr-value {
        font-size: 13.5px; color: var(--text);
        display: flex; align-items: center; gap: 8px;
      }
      .attr-factuality {
        font-size: 10px; color: var(--text-3);
        background: var(--bg-elevated);
        padding: 1px 6px; border-radius: 3px;
        letter-spacing: 0.01em;
      }
      .attr-quote {
        font-family: var(--font-serif);
        font-size: 12.5px; color: var(--text-2);
        font-style: italic;
        border-left: 1.5px solid var(--border-strong);
        padding: 2px 0 2px 9px;
        line-height: 1.55;
      }
      .attr-source {
        font-size: 11px; color: var(--text-3);
        font-family: var(--font-mono);
      }

      .appearances { list-style: none; display: flex; flex-direction: column; gap: 1px; }
      .app-row {
        display: flex; align-items: center; gap: 14px;
        padding: 7px 12px; border-radius: 5px;
        color: var(--text-2);
        transition: background 100ms, color 100ms;
      }
      .app-row:hover { background: var(--bg-hover); color: var(--text); }
      .app-row .num {
        font-family: var(--font-mono);
        font-size: 11px; color: var(--text-3);
        width: 22px; flex-shrink: 0;
      }
      .app-title { flex: 1; min-width: 0; font-size: 13px; }
      .app-mentions {
        font-size: 11.5px; color: var(--text-3);
        font-family: var(--font-mono);
      }
    `}</style>
  );
}
