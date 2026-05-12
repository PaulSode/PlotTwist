import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { bibleApi, chaptersApi } from '../lib/api';
import { qk } from '../lib/queryKeys';
import { refLabel, type Chapter } from '../lib/types';
import { Topbar } from '../components/Layout';

/**
 * Timeline view — events in narrative order, with pivotal events emphasised.
 * Tapping an event jumps to its source chapter.
 */
export function TimelinePage() {
  const { projectId = '' } = useParams();

  const eventsQ = useQuery({
    queryKey: qk.timeline(projectId),
    queryFn: () => bibleApi.timeline(projectId),
    enabled: !!projectId,
  });

  const chaptersQ = useQuery({
    queryKey: qk.chapters(projectId),
    queryFn: () => chaptersApi.listForProject(projectId),
    enabled: !!projectId,
  });

  const events = eventsQ.data?.events ?? [];
  const chapterMap = new Map((chaptersQ.data?.chapters ?? []).map((c) => [c._id, c]));

  // Group events by their containing chapter for a tidy left rail.
  const byChapter = new Map<string, typeof events>();
  for (const ev of events) {
    const arr = byChapter.get(ev.chapterId) ?? [];
    arr.push(ev);
    byChapter.set(ev.chapterId, arr);
  }

  const orderedChapterIds = [...byChapter.keys()].sort((a, b) => {
    const ca = chapterMap.get(a);
    const cb = chapterMap.get(b);
    return (ca?.order ?? 0) - (cb?.order ?? 0);
  });

  return (
    <>
      <Topbar crumbs={[{ label: 'Chronologie' }]} />
      <div className="page-scroll">
        <div className="page">
          <h1 className="page-title">Chronologie</h1>
          <p className="page-subtitle">
            {events.length} événement{events.length > 1 ? 's' : ''} dans l'ordre du
            récit
          </p>

          {eventsQ.isLoading && <div className="loading">Chargement…</div>}
          {!eventsQ.isLoading && events.length === 0 && (
            <div className="empty">
              Aucun événement encore. Les événements pivots sont extraits chapitre par
              chapitre.
            </div>
          )}

          <div className="tl">
            {orderedChapterIds.map((chapId) => {
              const chapter = chapterMap.get(chapId);
              if (!chapter) return null;
              const list = byChapter.get(chapId) ?? [];
              return (
                <TimelineChapterBlock
                  key={chapId}
                  chapter={chapter}
                  projectId={projectId}
                  events={list}
                />
              );
            })}
          </div>
        </div>
      </div>

      <TimelineStyles />
    </>
  );
}

interface BlockProps {
  chapter: Chapter;
  projectId: string;
  events: ReturnType<typeof bibleApi.timeline> extends Promise<{ events: infer E }> ? E : never;
}

function TimelineChapterBlock({ chapter, projectId, events }: BlockProps) {
  return (
    <div className="tl-block">
      <div className="tl-chap">
        <Link to={`/projects/${projectId}/manuscript/${chapter._id}`} className="tl-chap-link">
          <span className="num">{String(chapter.order).padStart(2, '0')}</span>
          <span className="tl-chap-title">{chapter.title}</span>
        </Link>
      </div>
      <ul className="tl-events">
        {events.map((ev) => (
          <li key={ev._id} className={`tl-event${ev.significance === 'pivotal' ? ' pivotal' : ''}`}>
            <span className="tl-dot" />
            <div className="tl-event-body">
              <div className="tl-event-summary">{ev.summary}</div>
              <div className="tl-event-meta">
                {ev.inWorldTime && <span>{ev.inWorldTime}</span>}
                {ev.locationId && <span>{refLabel(ev.locationId)}</span>}
                {ev.participantIds.length > 0 && (
                  <span>
                    {ev.participantIds
                      .map((p) => refLabel(p))
                      .filter((l) => l !== '?')
                      .join(', ')}
                  </span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TimelineStyles() {
  return (
    <style>{`
      .tl { position: relative; padding-left: 8px; }
      .tl-block { margin-bottom: 24px; }
      .tl-chap { margin-bottom: 10px; }
      .tl-chap-link {
        display: inline-flex; align-items: center; gap: 9px;
        font-size: 13.5px; color: var(--text);
        padding: 4px 6px; border-radius: 4px;
        margin-left: -6px;
      }
      .tl-chap-link:hover { background: var(--bg-panel); }
      .tl-chap-link .num {
        font-family: var(--font-mono); font-size: 11px;
        color: var(--text-3);
      }
      .tl-chap-title { font-weight: 500; }

      .tl-events { list-style: none; border-left: 1px solid var(--border); margin-left: 8px; padding-left: 0; }
      .tl-event {
        position: relative;
        padding: 8px 0 8px 22px;
        display: flex; align-items: flex-start; gap: 0;
      }
      .tl-dot {
        position: absolute; left: -4px; top: 14px;
        width: 7px; height: 7px;
        border-radius: 50%;
        background: var(--bg);
        border: 1.5px solid var(--text-3);
      }
      .tl-event.pivotal .tl-dot { background: var(--accent); border-color: var(--accent); }
      .tl-event-body { flex: 1; min-width: 0; }
      .tl-event-summary {
        font-size: 13px; color: var(--text-2); line-height: 1.55;
      }
      .tl-event.pivotal .tl-event-summary { color: var(--text); font-weight: 500; }
      .tl-event-meta {
        display: flex; flex-wrap: wrap; gap: 14px;
        margin-top: 4px;
        font-size: 11.5px; color: var(--text-3);
      }
    `}</style>
  );
}
