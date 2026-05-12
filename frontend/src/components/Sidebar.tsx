import { useMemo, useState } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { chaptersApi, inconsistenciesApi, projectsApi } from '../lib/api';
import { qk } from '../lib/queryKeys';
import type { Chapter } from '../lib/types';
import {
  IconBook,
  IconUsers,
  IconClock,
  IconMap,
  IconLink,
  IconAlert,
  IconChat,
  IconChevron,
  IconSearch,
  IconSettings,
} from './icons';

interface SidebarProps {
  /** Optional — highlights this chapter in the tree when on the editor page. */
  activeChapterId?: string;
}

export function Sidebar({ activeChapterId }: SidebarProps) {
  const { projectId = '' } = useParams();

  const projectQ = useQuery({
    queryKey: qk.project(projectId),
    queryFn: () => projectsApi.get(projectId),
    enabled: !!projectId,
  });

  const chaptersQ = useQuery({
    queryKey: qk.chapters(projectId),
    queryFn: () => chaptersApi.listForProject(projectId),
    enabled: !!projectId,
  });

  // Count open inconsistencies for the nav badge
  const incoQ = useQuery({
    queryKey: qk.inconsistencies(projectId, 'open'),
    queryFn: () => inconsistenciesApi.forProject(projectId, 'open'),
    enabled: !!projectId,
  });

  const openIncoCount = incoQ.data?.inconsistencies.length ?? 0;
  const project = projectQ.data?.project;

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <Link to="/" className="brand">
          <span className="brand-mark" />
          Plotwise
        </Link>
        <Link to="/" className="project-pick" title="Changer de projet">
          {project ? truncate(project.title, 8) : '…'}
          <IconChevron size={11} />
        </Link>
      </div>

      <div className="search">
        <span className="ico-search">
          <IconSearch size={13} />
        </span>
        <input type="text" placeholder="Rechercher dans l'œuvre…" />
        <span className="kbd">⌘K</span>
      </div>

      <nav className="nav">
        <SideLink to={`/projects/${projectId}/manuscript`} icon={<IconBook size={14} />}>
          Manuscrit
        </SideLink>
        <SideLink to={`/projects/${projectId}/characters`} icon={<IconUsers size={14} />}>
          Personnages
        </SideLink>
        <SideLink to={`/projects/${projectId}/timeline`} icon={<IconClock size={14} />}>
          Chronologie
        </SideLink>
        <SideLink to={`/projects/${projectId}/locations`} icon={<IconMap size={14} />}>
          Lieux
        </SideLink>
        <SideLink to={`/projects/${projectId}/relationships`} icon={<IconLink size={14} />}>
          Relations
        </SideLink>
        <SideLink
          to={`/projects/${projectId}/inconsistencies`}
          icon={<IconAlert size={14} />}
          count={openIncoCount > 0 ? openIncoCount : undefined}
          countAlert
        >
          Cohérence
        </SideLink>
        <SideLink to={`/projects/${projectId}/assistant`} icon={<IconChat size={14} />}>
          Assistant
        </SideLink>
      </nav>

      <div className="divider" />

      {chaptersQ.data ? (
        <ChapterTree
          chapters={chaptersQ.data.chapters}
          projectId={projectId}
          activeChapterId={activeChapterId}
        />
      ) : (
        <div className="tree">
          <div className="loading" style={{ padding: '8px 14px' }}>
            …
          </div>
        </div>
      )}

      <div className="sidebar-foot">
        <div className="avatar">CL</div>
        <div className="user-info">
          <div className="uname">Camille Lefort</div>
          <div className="uplan">Plan auteur</div>
        </div>
        <button className="icon-btn" aria-label="Paramètres">
          <IconSettings size={14} />
        </button>
      </div>
    </aside>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

interface SideLinkProps {
  to: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  count?: number;
  countAlert?: boolean;
}

function SideLink({ to, icon, children, count, countAlert }: SideLinkProps) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
    >
      {icon}
      {children}
      {count !== undefined && (
        <span className={`nav-count${countAlert ? ' alert' : ''}`}>{count}</span>
      )}
    </NavLink>
  );
}

// ─── Chapter tree ────────────────────────────────────────────────────────────

interface ChapterTreeProps {
  chapters: Chapter[];
  projectId: string;
  activeChapterId?: string;
}

function ChapterTree({ chapters, projectId, activeChapterId }: ChapterTreeProps) {
  // Build a parent → children map keyed by parentId
  const byParent = useMemo(() => {
    const map = new Map<string | null, Chapter[]>();
    for (const c of chapters) {
      const key = c.parentId ?? null;
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.order - b.order);
    }
    return map;
  }, [chapters]);

  const rootNodes = byParent.get(null) ?? [];

  return (
    <div className="tree">
      {rootNodes.length === 0 && (
        <div className="loading" style={{ padding: '8px 14px' }}>
          Aucun chapitre
        </div>
      )}
      {rootNodes.map((node) => (
        <TreeNode
          key={node._id}
          node={node}
          byParent={byParent}
          projectId={projectId}
          activeChapterId={activeChapterId}
          depth={0}
        />
      ))}
    </div>
  );
}

interface TreeNodeProps {
  node: Chapter;
  byParent: Map<string | null, Chapter[]>;
  projectId: string;
  activeChapterId?: string;
  depth: number;
}

function TreeNode({ node, byParent, projectId, activeChapterId, depth }: TreeNodeProps) {
  const children = byParent.get(node._id) ?? [];
  const isLeaf = node.kind === 'chapter' || children.length === 0;

  // Auto-expand if a descendant is active
  const containsActive = useMemo(
    () => activeChapterId && descendantOf(node._id, activeChapterId, byParent),
    [activeChapterId, node._id, byParent],
  );
  const [open, setOpen] = useState<boolean>(!!containsActive || depth === 0);

  if (isLeaf) {
    const active = node._id === activeChapterId;
    return (
      <Link
        to={`/projects/${projectId}/manuscript/${node._id}`}
        className={`chapter${active ? ' active' : ''}`}
      >
        <span className="num">{padOrder(node.order)}</span>
        <span className="title">{node.title}</span>
        {node.status === 'outline' && <span className="tag">plan</span>}
        {node.status === 'draft' && node.wordCount < 200 && (
          <span className="tag">brouillon</span>
        )}
      </Link>
    );
  }

  return (
    <div className="tree-group">
      <div
        className={`tree-group-head${open ? '' : ' collapsed'}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="chev">
          <IconChevron size={10} />
        </span>
        {node.title}
        <span className="head-meta">
          {node.kind === 'tome' ? formatWords(sumWords(node, byParent)) : ''}
        </span>
      </div>
      <div className={`tree-group-body${open ? '' : ' collapsed'}`}>
        {children.map((child) => (
          <TreeNode
            key={child._id}
            node={child}
            byParent={byParent}
            projectId={projectId}
            activeChapterId={activeChapterId}
            depth={depth + 1}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function padOrder(n: number): string {
  return String(n).padStart(2, '0');
}

function descendantOf(
  ancestorId: string,
  candidateId: string,
  byParent: Map<string | null, Chapter[]>,
): boolean {
  const stack: string[] = [ancestorId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (id === candidateId) return true;
    for (const child of byParent.get(id) ?? []) stack.push(child._id);
  }
  return false;
}

function sumWords(node: Chapter, byParent: Map<string | null, Chapter[]>): number {
  let total = node.wordCount;
  for (const child of byParent.get(node._id) ?? []) {
    total += sumWords(child, byParent);
  }
  return total;
}

function formatWords(n: number): string {
  if (n < 1000) return String(n);
  return new Intl.NumberFormat('fr-FR').format(n);
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
