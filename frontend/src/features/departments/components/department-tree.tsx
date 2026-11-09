import { ChevronRight, ChevronsDownUp, ChevronsUpDown, Crown, Landmark, Search, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useLocalizedName } from '@/features/classes/use-localized'
import { memberFullName } from '@/features/members/utils'
import { cn } from '@/lib/utils'
import type { DepartmentTreeNode } from '../types'
import { type DepartmentActions, DepartmentMenu } from './department-menu'

/** Every node id in the tree. */
const allIds = (nodes: DepartmentTreeNode[]): number[] => nodes.flatMap((n) => [n.id, ...allIds(n.children)])

const countAll = (nodes: DepartmentTreeNode[]): number => nodes.reduce((sum, n) => sum + 1 + countAll(n.children), 0)

/**
 * Ids to show for a search: every match plus all of its ancestors, so a
 * match is always seen in place. Null when there is no search.
 */
function visibleForSearch(nodes: DepartmentTreeNode[], query: string): Set<number> | null {
  const q = query.trim().toLowerCase()
  if (!q) return null
  const keep = new Set<number>()
  const walk = (node: DepartmentTreeNode): boolean => {
    const self = [node.nameAm, node.nameEn, node.code].some((s) => s.toLowerCase().includes(q))
    const below = node.children.map(walk).some(Boolean)
    if (self || below) keep.add(node.id)
    return self || below
  }
  nodes.forEach(walk)
  return keep
}

/** Wraps the first case-insensitive occurrence of `query` in a highlight. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1
  if (at < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-gold/35 px-0.5 text-inherit">{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length)}
    </>
  )
}

interface TreeState {
  query: string
  visible: Set<number> | null
  collapsed: Set<number>
  onToggle: (id: number) => void
  canManage: boolean
  actions: DepartmentActions
}

function TreeRow({
  node,
  number,
  depth,
  index,
  siblings,
  state,
}: {
  node: DepartmentTreeNode
  /** Outline number from the real position among all siblings (2.3, 5.3.1 …). */
  number: string
  depth: number
  index: number
  siblings: number
  state: TreeState
}) {
  const { t, i18n } = useTranslation()
  const name = useLocalizedName()
  const { query, visible, collapsed, onToggle, canManage, actions } = state
  const other = i18n.language === 'am' ? node.nameEn : node.nameAm
  const children = visible ? node.children.filter((c) => visible.has(c.id)) : node.children
  const hasChildren = children.length > 0
  // A search always shows the path to each match.
  const open = visible !== null || !collapsed.has(node.id)
  const isRoot = depth === 0

  return (
    <li role="treeitem" aria-level={depth + 1} aria-expanded={hasChildren ? open : undefined}>
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg py-1.5 pr-2 transition-colors hover:bg-accent/60',
          isRoot && 'bg-brand/8 py-2.5 hover:bg-brand/12',
          !node.isActive && 'opacity-60',
        )}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-label={
              open
                ? t('departments.tree.collapse', { name: name(node) })
                : t('departments.tree.expand', { name: name(node) })
            }
            className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <ChevronRight className={cn('size-4 transition-transform motion-reduce:transition-none', open && 'rotate-90')} />
          </button>
        ) : (
          <span className="grid size-7 shrink-0 place-items-center" aria-hidden>
            <span className="size-1.5 rounded-full bg-primary/40" />
          </span>
        )}

        {isRoot ? (
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand text-gold">
            <Landmark className="size-4" aria-hidden />
          </span>
        ) : (
          <span
            className={cn(
              'tabular grid h-6 min-w-6 shrink-0 place-items-center rounded-md px-1.5 font-mono text-[11px] font-semibold',
              depth === 1 ? 'bg-primary text-primary-foreground' : 'bg-accent text-accent-foreground',
            )}
          >
            {number}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <Link
            to={`/departments/${node.id}`}
            className={cn(
              'font-medium hover:text-brand hover:underline',
              isRoot && 'text-base font-semibold',
              depth === 1 && 'font-semibold',
            )}
          >
            <Highlight text={name(node)} query={query} />
          </Link>
          <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">
            <Highlight text={other} query={query} />
          </span>
          {!node.isActive && (
            <span className="ml-2 text-xs font-medium text-muted-foreground">· {t('departments.inactive')}</span>
          )}
        </div>

        {node.head && (
          <span
            className="hidden max-w-48 items-center gap-1 truncate text-xs text-muted-foreground md:inline-flex"
            title={t('departments.head')}
          >
            <Crown className="size-3 shrink-0 text-gilt-ink" aria-hidden />
            <span className="truncate">{memberFullName(node.head)}</span>
          </span>
        )}
        {node.children.length > 0 && (
          <span className="hidden text-xs text-muted-foreground lg:inline">
            {t('departments.administers', { count: node.children.length })}
          </span>
        )}
        <span
          className="tabular inline-flex h-6 shrink-0 items-center gap-1 rounded-full border bg-background px-2 text-xs text-muted-foreground"
          title={t('departments.members', { count: node.memberCount })}
        >
          <Users className="size-3" aria-hidden />
          {node.memberCount}
        </span>
        {canManage && (
          <DepartmentMenu department={node} isFirst={index === 0} isLast={index === siblings - 1} actions={actions} />
        )}
      </div>

      {hasChildren && open && (
        <ul role="group" className="ml-[13px] border-l border-dashed border-primary/30 pl-3">
          {children.map((child) => {
            // Numbers keep each department's real position, even while a search hides siblings.
            const position = node.children.indexOf(child) + 1
            return (
              <TreeRow
                key={child.id}
                node={child}
                number={depth === 0 ? String(position) : `${number}.${position}`}
                depth={depth + 1}
                index={position - 1}
                siblings={node.children.length}
                state={state}
              />
            )
          })}
        </ul>
      )}
    </li>
  )
}

/**
 * The whole structure as an outline: the office, its departments, their
 * sub-departments and any further levels, numbered in order (2.3, 5.3.1 …).
 */
export function DepartmentTree({
  tree,
  canManage,
  actions,
}: {
  tree: DepartmentTreeNode[]
  canManage: boolean
  actions: DepartmentActions
}) {
  const { t } = useTranslation()
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [query, setQuery] = useState('')
  const visible = useMemo(() => visibleForSearch(tree, query), [tree, query])
  const ids = useMemo(() => allIds(tree), [tree])
  const total = useMemo(() => countAll(tree), [tree])
  const roots = visible ? tree.filter((r) => visible.has(r.id)) : tree

  const state: TreeState = {
    query,
    visible,
    collapsed,
    canManage,
    actions,
    onToggle: (id) =>
      setCollapsed((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
  }

  return (
    <section className="rise-in rounded-xl border bg-card p-3 sm:p-4" aria-label={t('departments.tree.label')}>
      <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-dashed pb-3">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('departments.tree.search')}
            aria-label={t('departments.tree.search')}
            className="pl-8"
          />
        </div>
        <span className="text-xs text-muted-foreground">{t('departments.tree.total', { count: total })}</span>
        <Button variant="ghost" size="sm" onClick={() => setCollapsed(new Set())} disabled={visible !== null}>
          <ChevronsUpDown />
          {t('departments.tree.expandAll')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          // Keep the top level open so its departments stay listed.
          onClick={() => setCollapsed(new Set(ids.filter((id) => !tree.some((r) => r.id === id))))}
          disabled={visible !== null}
        >
          <ChevronsDownUp />
          {t('departments.tree.collapseAll')}
        </Button>
      </div>

      {roots.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">{t('departments.tree.noMatch')}</p>
      ) : (
        <ul role="tree" className="space-y-0.5">
          {roots.map((root) => {
            const position = tree.indexOf(root)
            return (
              <TreeRow
                key={root.id}
                node={root}
                number={String(position + 1)}
                depth={0}
                index={position}
                siblings={tree.length}
                state={state}
              />
            )
          })}
        </ul>
      )}
    </section>
  )
}
