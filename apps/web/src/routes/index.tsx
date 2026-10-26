import { categories, type Category } from '@factory/core';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { flexRender, tableFeatures, useTable, type ColumnDef } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDown,
  ArrowUpRight,
  Box,
  Check,
  CheckCheck,
  Circle,
  Command,
  Copy,
  Layers,
  LayoutDashboard,
  RefreshCw,
  Terminal,
  Workflow,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { create } from 'zustand';
import { getWorkspace } from '../server/workspace';

export const Route = createFileRoute('/')({
  loader: () => getWorkspace({ data: 'All' }),
  component: Workspace,
});

const useFilters = create<{ category: Category; setCategory: (category: Category) => void }>(
  (set) => ({
    category: 'All',
    setCategory: (category) => set({ category }),
  }),
);

type StackEntry = Awaited<ReturnType<typeof getWorkspace>>['stack'][number];
const features = tableFeatures({});
const columns: ColumnDef<typeof features, StackEntry>[] = [
  {
    accessorKey: 'name',
    header: 'Technology',
    cell: ({ row }) => (
      <span className="technology">
        <Box size={15} />
        {row.original.name}
      </span>
    ),
  },
  { accessorKey: 'role', header: 'Purpose' },
  {
    accessorKey: 'category',
    header: 'Layer',
    cell: ({ row }) => <span className="tag">{row.original.category}</span>,
  },
];

function Workspace() {
  const initial = Route.useLoaderData();
  const { category, setCategory } = useFilters();
  const query = useQuery({
    queryKey: ['workspace', category],
    queryFn: () => getWorkspace({ data: category }),
    initialData: category === 'All' ? initial : undefined,
  });
  const scrollRef = useRef<HTMLDivElement>(null);
  const table = useTable({
    features,
    data: query.data?.stack ?? [],
    columns,
  });
  const rows = table.getRowModel().rows;
  // oxlint-disable-next-line react/incompatible-library -- React Compiler is not enabled in this app.
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 57,
    overscan: 5,
    initialRect: { width: 800, height: 342 },
  });
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText('pnpm dev');
      setCopied(true);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview">
          <span className="brand-mark">
            <Circle size={22} />
          </span>
          blackhole<span className="brand-dot">.</span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-avatar">B</span>
          <div>
            Software factory<small>Local workspace</small>
          </div>
          <span className="shortcut">⌘ K</span>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav aria-label="Workspace navigation">
          <a className="nav-link active" href="#overview">
            <LayoutDashboard size={17} />
            Overview
          </a>
          <a className="nav-link" href="#stack">
            <Layers size={17} />
            Tech stack<span className="nav-count">{initial.stack.length}</span>
          </a>
          <a className="nav-link" href="#packages">
            <Box size={17} />
            Packages<span className="nav-count">4</span>
          </a>
          <a className="nav-link" href="#commands">
            <Terminal size={17} />
            Commands
          </a>
        </nav>
        <div className="sidebar-bottom">
          <span className="green-dot" />
          Development environment<small>localhost:8018</small>
        </div>
      </aside>

      <div className="main-shell">
        <header className="topbar">
          <span>
            Workspace <span className="slash">/</span> <strong>Overview</strong>
          </span>
          <span className="environment">
            <span className="green-dot" />
            Local
          </span>
        </header>
        <main id="overview">
          <div className="eyebrow">
            <Workflow size={14} /> SOFTWARE FACTORY / 001
          </div>
          <div className="page-heading">
            <div>
              <h1>
                A foundation to build on<span>.</span>
              </h1>
              <p>Your stack, your workspace, your next idea. Ready when you are.</p>
            </div>
            <a className="button secondary" href="#stack">
              Explore the stack <ArrowDown size={15} />
            </a>
          </div>

          <section className="launch-panel" id="commands" aria-labelledby="launch-title">
            <div className="launch-copy">
              <span className="mini-label">YOUR NEXT PROJECT STARTS HERE</span>
              <h2 id="launch-title">
                Less setup.
                <br />
                More shipping.
              </h2>
              <p>
                A typed monorepo with one toolchain
                <br className="desktop-break" /> from development to production.
              </p>
              <div className="launch-pills">
                <span>pnpm workspaces</span>
                <span>Vite+ powered</span>
              </div>
            </div>
            <div className="terminal-window">
              <div className="terminal-heading">
                <span className="terminal-dots">
                  <i />
                  <i />
                  <i />
                </span>
                <span>~/blackhole-generator</span>
                <Terminal size={13} />
              </div>
              <div className="terminal-body">
                <div className="terminal-comment"># Start something good.</div>
                <div className="terminal-command">
                  <span>❯</span> pnpm dev
                  <button type="button" aria-label="Copy development command" onClick={copyCommand}>
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                </div>
                <div className="terminal-output">
                  <span>VITE+</span> unified development
                </div>
                <div className="terminal-url">↳ http://localhost:8018/</div>
                <div className="terminal-comment command-list">
                  pnpm check <span>·</span> pnpm test <span>·</span> pnpm build
                </div>
                <output className="sr-only">
                  {copied
                    ? 'Command copied'
                    : copyError
                      ? 'Copy unavailable. Select the command manually.'
                      : ''}
                </output>
              </div>
            </div>
          </section>

          <section className="metrics" aria-label="Workspace summary">
            <div>
              <span className="metric-label">
                WORKSPACE PACKAGES
                <Box size={15} />
              </span>
              <strong>
                04<span>apps & shared modules</span>
              </strong>
            </div>
            <div>
              <span className="metric-label">
                TOOLCHAIN
                <Command size={15} />
              </span>
              <strong>
                One<span>Vite+ · powered by pnpm</span>
              </strong>
            </div>
            <div>
              <span className="metric-label">
                APPLICATION LAYER
                <Layers size={15} />
              </span>
              <strong>
                TanStack<span>Start, Router, Query & more</span>
              </strong>
            </div>
          </section>

          <section id="stack" className="stack-section" aria-labelledby="stack-title">
            <div className="section-heading">
              <div>
                <h2 id="stack-title">The building blocks</h2>
                <p>A familiar stack. A cleaner starting point.</p>
              </div>
              <button
                type="button"
                className="refresh"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
                aria-label="Refresh stack from server"
              >
                <RefreshCw size={15} className={query.isFetching ? 'spinning' : ''} />
              </button>
            </div>
            <div className="filters" aria-label="Filter by layer">
              {categories.map((item) => (
                <button
                  type="button"
                  key={item}
                  className={category === item ? 'selected' : ''}
                  aria-pressed={category === item}
                  onClick={() => {
                    setCategory(item);
                    virtualizer.scrollToOffset(0);
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
            {query.isError ? (
              <p role="alert">Could not load the stack. Use refresh to try again.</p>
            ) : query.isPending ? (
              <output>Loading the stack…</output>
            ) : (
              <div className="table-scroll" ref={scrollRef}>
                <table aria-label="Technology stack" aria-rowcount={rows.length + 1}>
                  <thead className="table-header">
                    {table.getHeaderGroups().map((group) => (
                      <tr className="table-row" key={group.id}>
                        {group.headers.map((header) => (
                          <th scope="col" key={header.id}>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody
                    style={{
                      height: virtualizer.getTotalSize(),
                      position: 'relative',
                      display: 'block',
                    }}
                  >
                    {virtualizer.getVirtualItems().map((virtualRow) => {
                      const row = rows[virtualRow.index];
                      return (
                        <tr
                          aria-rowindex={virtualRow.index + 2}
                          key={row.id}
                          className="table-row data-row"
                          title={row.original.detail}
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: virtualRow.size,
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                        >
                          {row.getAllCells().map((cell) => (
                            <td key={cell.id}>
                              {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="table-footer">
              <span>
                {rows.length} technologies <span className="footer-dot">·</span>{' '}
                {category === 'All' ? 'All layers' : category}
              </span>
              <span>
                <CheckCheck size={14} />
                {query.isError
                  ? 'Connection failed'
                  : query.isFetching
                    ? 'Refreshing…'
                    : 'Server functions connected'}
              </span>
            </div>
          </section>

          <section id="packages" className="packages-section" aria-labelledby="packages-title">
            <div className="section-heading">
              <div>
                <h2 id="packages-title">A place for everything</h2>
                <p>Clear boundaries. Shared by design.</p>
              </div>
              <span className="subtle-label">PNPM WORKSPACES</span>
            </div>
            <div className="package-grid">
              {initial.packages.map((pkg) => (
                <article key={pkg.path}>
                  <div className="package-icon">
                    <Box size={18} />
                    <ArrowUpRight size={14} />
                  </div>
                  <h3>{pkg.path}</h3>
                  <p>{pkg.purpose}</p>
                  <code>{pkg.name}</code>
                </article>
              ))}
            </div>
          </section>
          <footer>
            <span>
              <span className="footer-orbit">◉</span> Build something that matters.
            </span>
            <span>
              Blackhole <span className="footer-dot">/</span> Factory starter
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}
