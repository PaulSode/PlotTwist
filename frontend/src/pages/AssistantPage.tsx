import { useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { chaptersApi, streamAssistant } from '../lib/api';
import { qk } from '../lib/queryKeys';
import { Topbar } from '../components/Layout';
import { IconChat } from '../components/icons';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  /** Chapters the backend retrieved for this turn (start event). */
  ragHits?: string[];
}

/**
 * Assistant page.
 *
 * - One message thread per session (not persisted server-side; that can be a
 *   later addition)
 * - SSE streaming via streamAssistant() — the assistant message grows as
 *   deltas arrive
 * - The author can scope the conversation to a specific chapter, in which
 *   case the backend will include its full text in the context
 */
export function AssistantPage() {
  const { projectId = '' } = useParams();

  const chaptersQ = useQuery({
    queryKey: qk.chapters(projectId),
    queryFn: () => chaptersApi.listForProject(projectId),
    enabled: !!projectId,
  });

  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [focusedChapterId, setFocusedChapterId] = useState<string>('');
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const leafChapters = (chaptersQ.data?.chapters ?? []).filter((c) => c.kind === 'chapter');

  async function send() {
    const text = draft.trim();
    if (!text || streaming) return;

    const userMsg: Message = { role: 'user', content: text };
    const assistantMsg: Message = { role: 'assistant', content: '' };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setDraft('');
    setStreaming(true);

    // Build the history we send to the backend (everything before the empty
    // assistant message)
    const history = [...messages, userMsg].map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await streamAssistant({
        projectId,
        messages: history,
        currentChapterId: focusedChapterId || undefined,
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === 'start') {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === 'assistant') {
                next[next.length - 1] = { ...last, ragHits: event.ragHits };
              }
              return next;
            });
          } else if (event.type === 'delta') {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === 'assistant') {
                next[next.length - 1] = { ...last, content: last.content + event.text };
              }
              return next;
            });
            // Keep scrolled to bottom
            requestAnimationFrame(() => {
              const el = scrollRef.current;
              if (el) el.scrollTop = el.scrollHeight;
            });
          } else if (event.type === 'error') {
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last && last.role === 'assistant') {
                next[next.length - 1] = {
                  ...last,
                  content: last.content + `\n\n[erreur : ${event.message}]`,
                };
              }
              return next;
            });
          }
        },
      });
    } catch (err) {
      // Aborted or network failed
      if (!controller.signal.aborted) {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last && last.role === 'assistant') {
            next[next.length - 1] = {
              ...last,
              content: last.content || `[erreur : ${(err as Error).message}]`,
            };
          }
          return next;
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function abort() {
    abortRef.current?.abort();
  }

  return (
    <>
      <Topbar crumbs={[{ label: 'Assistant' }]} />

      <div className="ass-wrap">
        <div className="ass-scroll" ref={scrollRef}>
          <div className="ass-inner">
            {messages.length === 0 && (
              <div className="ass-empty">
                <div className="ass-empty-ico">
                  <IconChat size={20} />
                </div>
                <h2>Posez une question sur votre œuvre.</h2>
                <p>
                  L'assistant connaît votre bible — personnages, lieux, événements — et peut
                  retrouver les passages pertinents du manuscrit. Il ne réécrit pas à votre place,
                  il vous aide à débloquer.
                </p>
                <ul className="ass-suggestions">
                  <li onClick={() => setDraft('Qu\'a-t-on appris sur Liora dans les trois derniers chapitres ?')}>
                    Qu'a-t-on appris sur Liora dans les trois derniers chapitres ?
                  </li>
                  <li onClick={() => setDraft('Donne-moi 3 façons de relancer la tension au chapitre suivant.')}>
                    Donne-moi 3 façons de relancer la tension au chapitre suivant.
                  </li>
                  <li onClick={() => setDraft('Quels fils narratifs sont restés en suspens ?')}>
                    Quels fils narratifs sont restés en suspens ?
                  </li>
                </ul>
              </div>
            )}

            {messages.map((m, i) => (
              <MessageBubble key={i} message={m} />
            ))}

            {streaming && messages[messages.length - 1]?.content === '' && (
              <div className="ass-typing">…</div>
            )}
          </div>
        </div>

        <div className="ass-composer">
          <div className="ass-composer-inner">
            <div className="ass-scope">
              <label>
                Contexte :
                <select
                  value={focusedChapterId}
                  onChange={(e) => setFocusedChapterId(e.target.value)}
                  disabled={streaming}
                >
                  <option value="">Toute l'œuvre</option>
                  {leafChapters.map((c) => (
                    <option key={c._id} value={c._id}>
                      ch. {c.order} · {c.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="ass-input-row">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Posez une question, demandez 3 pistes de continuation, vérifiez la cohérence…"
                rows={2}
                disabled={streaming}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              {streaming ? (
                <button className="btn" onClick={abort}>
                  Arrêter
                </button>
              ) : (
                <button
                  className="btn primary"
                  onClick={() => void send()}
                  disabled={!draft.trim()}
                >
                  Envoyer
                </button>
              )}
            </div>

            <div className="ass-hint">
              Entrée pour envoyer · Maj+Entrée pour aller à la ligne
            </div>
          </div>
        </div>
      </div>

      <AssStyles />
    </>
  );
}

// ─── Message bubble ──────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: Message }) {
  if (message.role === 'user') {
    return (
      <div className="msg msg-user">
        <div className="msg-body">{message.content}</div>
      </div>
    );
  }
  return (
    <div className="msg msg-assistant">
      {message.ragHits && message.ragHits.length > 0 && (
        <div className="msg-rag">
          Passages consultés : {message.ragHits.slice(0, 3).join(' · ')}
          {message.ragHits.length > 3 && ` (+${message.ragHits.length - 3})`}
        </div>
      )}
      <div className="msg-body msg-prose">{renderProse(message.content)}</div>
    </div>
  );
}

/** Render newlines as paragraph breaks. Light-touch — full markdown can come later. */
function renderProse(text: string): React.ReactNode {
  const paragraphs = text.split(/\n\n+/);
  return paragraphs.map((p, i) => <p key={i}>{p}</p>);
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function AssStyles() {
  return (
    <style>{`
      .ass-wrap {
        flex: 1; min-height: 0;
        display: flex; flex-direction: column;
      }
      .ass-scroll { flex: 1; overflow-y: auto; }
      .ass-inner {
        max-width: 720px; margin: 0 auto;
        padding: 36px 40px 24px;
        display: flex; flex-direction: column; gap: 18px;
      }

      .ass-empty {
        margin-top: 60px; text-align: center;
        color: var(--text-3);
      }
      .ass-empty-ico {
        width: 38px; height: 38px;
        border-radius: 50%;
        background: var(--bg-panel);
        border: 1px solid var(--border);
        display: flex; align-items: center; justify-content: center;
        color: var(--text-2);
        margin: 0 auto 16px;
      }
      .ass-empty h2 {
        font-size: 17px; font-weight: 500;
        color: var(--text); margin-bottom: 6px;
        letter-spacing: -0.005em;
      }
      .ass-empty p {
        font-size: 13px; line-height: 1.6;
        max-width: 460px; margin: 0 auto 24px;
      }
      .ass-suggestions {
        list-style: none; display: flex; flex-direction: column;
        gap: 6px; max-width: 460px; margin: 0 auto;
      }
      .ass-suggestions li {
        padding: 9px 14px;
        font-size: 12.5px;
        background: var(--bg-panel);
        border: 1px solid var(--border);
        border-radius: 5px;
        cursor: pointer;
        text-align: left;
        color: var(--text-2);
        transition: all 100ms;
      }
      .ass-suggestions li:hover {
        border-color: var(--border-strong);
        color: var(--text);
      }

      .msg { display: flex; flex-direction: column; }
      .msg-user { align-items: flex-end; }
      .msg-user .msg-body {
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        padding: 9px 14px; border-radius: 12px 12px 4px 12px;
        max-width: 80%;
        font-size: 13.5px; color: var(--text);
        line-height: 1.55;
        white-space: pre-wrap;
      }

      .msg-assistant { align-items: stretch; }
      .msg-rag {
        font-size: 11px; color: var(--text-3);
        margin-bottom: 6px; padding: 0 2px;
        font-family: var(--font-mono);
      }
      .msg-prose {
        font-family: var(--font-serif);
        font-size: 14.5px; line-height: 1.7;
        color: var(--text);
      }
      .msg-prose p { margin-bottom: 0.9em; }
      .msg-prose p:last-child { margin-bottom: 0; }

      .ass-typing { color: var(--text-3); font-size: 16px; padding-left: 4px; }

      .ass-composer {
        border-top: 1px solid var(--border);
        background: var(--bg-editor);
        flex-shrink: 0;
      }
      .ass-composer-inner {
        max-width: 720px; margin: 0 auto;
        padding: 14px 40px 18px;
      }
      .ass-scope { font-size: 11.5px; color: var(--text-3); margin-bottom: 8px; }
      .ass-scope label { display: inline-flex; align-items: center; gap: 6px; }
      .ass-scope select {
        background: var(--bg-panel);
        border: 1px solid var(--border);
        color: var(--text-2);
        font-family: inherit; font-size: 11.5px;
        padding: 2px 6px; border-radius: 4px;
        outline: none;
      }
      .ass-input-row { display: flex; gap: 8px; align-items: flex-end; }
      .ass-input-row textarea {
        flex: 1;
        background: var(--bg-panel);
        border: 1px solid var(--border);
        border-radius: 6px;
        padding: 10px 12px;
        color: var(--text); font-family: inherit;
        font-size: 13.5px; line-height: 1.55;
        outline: none; resize: none;
        transition: border-color 120ms;
      }
      .ass-input-row textarea:focus { border-color: var(--border-strong); }
      .ass-hint {
        margin-top: 6px; font-size: 11px; color: var(--text-3);
        text-align: right;
      }
    `}</style>
  );
}
