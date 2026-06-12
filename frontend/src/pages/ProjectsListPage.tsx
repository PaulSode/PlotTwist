import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { projectsApi } from '../lib/api';
import { qk } from '../lib/queryKeys';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { Project } from '../lib/types';
import { IconBook, IconPlus, IconArrow, IconTrash } from '../components/icons';

export function ProjectsListPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');

  const projectsQ = useQuery({
    queryKey: qk.projects(),
    queryFn: () => projectsApi.list(),
  });

  const create = useMutation({
    mutationFn: (data: { title: string }) =>
      projectsApi.create({ title: data.title, language: 'fr' }),
    onSuccess: ({ project }) => {
      qc.invalidateQueries({ queryKey: qk.projects() });
      navigate(`/projects/${project._id}/manuscript`);
    },
  });

  const handleCreate = () => {
    if (!title.trim()) return;
    create.mutate({ title: title.trim() });
  };

  // ─── Delete project ──────────────────────────────────────────────────────
  const [toDelete, setToDelete] = useState<Project | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => projectsApi.remove(id),
    onSuccess: () => {
      setToDelete(null);
      qc.invalidateQueries({ queryKey: qk.projects() });
    },
  });

  return (
    <div className="standalone">
      <div className="hero">
        <div className="brand-row">
          <span className="brand-mark" />
          <span className="brand-text">PlotTwist</span>
        </div>
        <h1>Vos œuvres</h1>
        <p className="hero-sub">
          Le copilote qui comprend votre histoire. Ouvrez un manuscrit ou créez-en un.
        </p>
      </div>

      <section className="projects">
        {projectsQ.isLoading && <div className="loading">Chargement…</div>}
        {projectsQ.data?.projects.length === 0 && !creating && (
          <div className="empty">
            <p style={{ marginBottom: 14 }}>Pas encore d'œuvre. Commencez votre première.</p>
            <button className="btn primary" onClick={() => setCreating(true)}>
              <IconPlus size={12} /> Nouvelle œuvre
            </button>
          </div>
        )}

        <ul className="proj-list">
          {projectsQ.data?.projects.map((p) => (
            <li key={p._id} className="proj-li">
              <Link to={`/projects/${p._id}/manuscript`} className="proj">
                <span className="proj-ico">
                  <IconBook size={16} />
                </span>
                <span className="proj-body">
                  <span className="proj-title">{p.title}</span>
                  {p.description && (
                    <span className="proj-desc">{p.description}</span>
                  )}
                  <span className="proj-meta">
                    {p.genre ?? 'Sans genre'} · maj {formatDate(p.updatedAt)}
                  </span>
                </span>
                <span className="proj-arrow">
                  <IconArrow size={14} />
                </span>
              </Link>
              <button
                className="proj-del"
                title="Supprimer cette œuvre"
                aria-label={`Supprimer ${p.title}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setToDelete(p);
                }}
              >
                <IconTrash size={13} />
              </button>
            </li>
          ))}
        </ul>

        {creating ? (
          <div className="create-card">
            <label className="create-label" htmlFor="new-title">
              Titre de l'œuvre
            </label>
            <input
              id="new-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="ex. Les Cendres de Valdoria"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <div className="create-actions">
              <button
                className="btn"
                onClick={() => {
                  setCreating(false);
                  setTitle('');
                }}
              >
                Annuler
              </button>
              <button
                className="btn primary"
                onClick={handleCreate}
                disabled={!title.trim() || create.isPending}
              >
                {create.isPending ? 'Création…' : 'Créer'}
              </button>
            </div>
            {create.isError && (
              <div className="create-error">
                Échec : {(create.error as Error).message}
              </div>
            )}
          </div>
        ) : (
          projectsQ.data?.projects.length !== 0 && (
            <button className="add-row" onClick={() => setCreating(true)}>
              <IconPlus size={12} /> Nouvelle œuvre
            </button>
          )
        )}
      </section>

      <ConfirmDialog
        open={!!toDelete}
        title="Supprimer cette œuvre ?"
        message={
          <>
            Vous êtes sur le point de supprimer <em>{toDelete?.title}</em>. Tous les
            chapitres, la bible (personnages, lieux, événements, relations) et les
            incohérences associées seront définitivement effacés. Cette action est
            irréversible.
          </>
        }
        confirmLabel="Supprimer l'œuvre"
        destructive
        busy={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete._id)}
        onCancel={() => setToDelete(null)}
      />

      <style>{`
        .standalone {
          height: 100vh; overflow-y: auto;
          background: var(--bg);
          display: flex; flex-direction: column; align-items: center;
          padding: 80px 24px 60px;
        }
        .hero { max-width: 580px; width: 100%; margin-bottom: 36px; }
        .brand-row {
          display: flex; align-items: center; gap: 9px;
          margin-bottom: 32px; color: var(--text-2); font-size: 13px;
        }
        .brand-text { font-weight: 500; color: var(--text); letter-spacing: -0.005em; }
        .hero h1 {
          font-size: 26px; font-weight: 500;
          letter-spacing: -0.012em; margin-bottom: 8px;
        }
        .hero-sub { color: var(--text-3); font-size: 13.5px; line-height: 1.55; }

        .projects { max-width: 580px; width: 100%; }
        .proj-list { list-style: none; display: flex; flex-direction: column; gap: 6px; }
        .proj-li { position: relative; }
        .proj {
          display: flex; align-items: center; gap: 14px;
          background: var(--bg-panel);
          border: 1px solid var(--border);
          padding: 12px 14px; border-radius: 6px;
          transition: border-color 100ms, background 100ms;
        }
        .proj:hover { border-color: var(--border-strong); background: var(--bg-hover); }
        .proj-del {
          position: absolute; top: 50%; right: 44px;
          transform: translateY(-50%);
          display: flex; align-items: center; justify-content: center;
          width: 28px; height: 28px;
          background: none; border: 1px solid transparent;
          border-radius: 5px; color: var(--text-3);
          cursor: pointer; opacity: 0;
          transition: opacity 100ms, color 100ms, background 100ms, border-color 100ms;
        }
        .proj-li:hover .proj-del { opacity: 1; }
        .proj-del:hover { color: var(--danger); background: var(--danger-bg); border-color: var(--danger-strong); }
        .proj-del:focus-visible { opacity: 1; outline: none; color: var(--danger); border-color: var(--danger-strong); }
        .proj-ico {
          width: 30px; height: 30px; flex-shrink: 0;
          border-radius: 5px; background: var(--bg-elevated);
          display: flex; align-items: center; justify-content: center;
          color: var(--text-2);
        }
        .proj-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
        .proj-title { color: var(--text); font-size: 13.5px; font-weight: 500; }
        .proj-desc {
          color: var(--text-2); font-size: 12.5px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .proj-meta { color: var(--text-3); font-size: 11.5px; }
        .proj-arrow { color: var(--text-3); }
        .proj:hover .proj-arrow { color: var(--text-2); }

        .add-row {
          margin-top: 12px;
          display: flex; align-items: center; gap: 6px;
          background: none; border: 1px dashed var(--border);
          color: var(--text-3);
          padding: 11px 14px; border-radius: 6px;
          font-size: 12.5px; font-family: inherit;
          cursor: pointer; width: 100%;
          justify-content: center;
          transition: all 100ms;
        }
        .add-row:hover { border-color: var(--border-strong); color: var(--text-2); }

        .create-card {
          margin-top: 12px;
          background: var(--bg-panel);
          border: 1px solid var(--border-strong);
          padding: 16px; border-radius: 6px;
        }
        .create-label {
          display: block; font-size: 11.5px;
          color: var(--text-3); margin-bottom: 6px;
        }
        .create-card input {
          width: 100%;
          background: var(--bg);
          border: 1px solid var(--border);
          color: var(--text);
          padding: 6px 10px;
          border-radius: 5px; font-family: inherit;
          font-size: 13px; outline: none;
          transition: border-color 120ms;
        }
        .create-card input:focus { border-color: var(--border-strong); }
        .create-actions {
          display: flex; gap: 8px; justify-content: flex-end;
          margin-top: 12px;
        }
        .create-error {
          margin-top: 10px; color: var(--danger); font-size: 12px;
        }
      `}</style>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
