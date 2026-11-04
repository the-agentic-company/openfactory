import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createColumnHelper, flexRender, tableFeatures, useTable } from '@tanstack/react-table';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Database,
  Eye,
  KeyRound,
  LockKeyhole,
  RefreshCw,
  Search,
  Table2,
} from 'lucide-react';
import { listAgentTables, readAgentTable } from '../server/agent-database';
import './agent-database.css';

type TableData = Awaited<ReturnType<typeof readAgentTable>>;
type Sort = { column: string; direction: 'asc' | 'desc' } | null;
const features = tableFeatures({});
const helper = createColumnHelper<typeof features, TableData['rows'][number]>();
const pageSize = 50;

export function AgentDatabase({ id, scope }: { id: string; scope: string }) {
  const [selection, setSelection] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const catalog = useQuery({
    queryKey: ['agent-database', scope, id, 'tables'],
    queryFn: () => listAgentTables({ data: { id } }),
    refetchInterval: 10000,
  });
  const tables = catalog.data?.tables ?? [];
  const selected = tables.find((table) => table.name === selection)?.name ?? tables[0]?.name;
  const matching = tables.filter((table) =>
    table.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section className="agent-database" aria-label="Agent database">
      <aside className="db-sidebar" aria-label="Database tables">
        <div className="db-sidebar-heading">
          <Database size={15} />
          <h2>Tables</h2>
          <span>{tables.length}</span>
        </div>
        <label className="db-search">
          <Search size={14} />
          <input
            aria-label="Search tables"
            placeholder="Find a table…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {catalog.isPending && <output className="db-message">Loading tables…</output>}
        {catalog.isError && (
          <div className="db-message" role="alert">
            <p>{catalog.error.message}</p>
            <button className="button secondary" onClick={() => void catalog.refetch()}>
              Retry
            </button>
          </div>
        )}
        <div className="db-table-list">
          {matching.map((table) => (
            <button
              type="button"
              key={table.name}
              aria-pressed={selected === table.name}
              onClick={() => setSelection(table.name)}
              title={table.name}
            >
              {table.kind === 'view' ? <Eye size={15} /> : <Table2 size={15} />}
              <span>{table.name}</span>
            </button>
          ))}
        </div>
        {catalog.isSuccess && tables.length > 0 && matching.length === 0 && (
          <p className="db-message">No matching tables.</p>
        )}
        <div className="db-sidebar-footer">
          <LockKeyhole size={13} />
          Read-only access
        </div>
      </aside>
      {selected ? (
        <DatabaseTable
          key={`${scope}:${id}:${selected}`}
          id={id}
          scope={scope}
          name={selected}
          refreshCatalog={() => void catalog.refetch()}
        />
      ) : (
        <div className="db-empty">
          <Database size={26} />
          <h3>{catalog.isPending ? 'Opening database…' : 'No tables yet'}</h3>
          <p>Your agent's tables will appear here when it starts saving data.</p>
        </div>
      )}
    </section>
  );
}

function DatabaseTable({
  id,
  scope,
  name,
  refreshCatalog,
}: {
  id: string;
  scope: string;
  name: string;
  refreshCatalog: () => void;
}) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<Sort>(null);
  const query = useQuery({
    queryKey: ['agent-database', scope, id, 'rows', name, page, sort],
    queryFn: () =>
      readAgentTable({ data: { id, table: name, offset: page * pageSize, limit: pageSize, sort } }),
    refetchInterval: 10000,
  });
  const total = query.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  function changeSort(column: string) {
    setPage(0);
    setSort((current) => ({
      column,
      direction: current?.column === column && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  }
  return (
    <div className="db-content">
      <div className="db-toolbar">
        <div className="db-table-title">
          <Table2 size={16} />
          <h3>{name}</h3>
          <span className="db-readonly">Read only</span>
        </div>
        <button
          className="button secondary"
          disabled={query.isFetching}
          onClick={() => {
            void query.refetch();
            refreshCatalog();
          }}
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>
      <section className="db-grid-scroll" aria-label={`${name} rows`} aria-busy={query.isFetching}>
        {query.data && (
          <TableGrid data={query.data} offset={page * pageSize} sort={sort} onSort={changeSort} />
        )}
        {query.isPending && <output className="db-message">Loading rows…</output>}
        {query.isError && (
          <div className="db-message" role="alert">
            <p>{query.error.message}</p>
            <button className="button secondary" onClick={() => void query.refetch()}>
              Retry
            </button>
          </div>
        )}
        {query.isSuccess && query.data.rows.length === 0 && (
          <div className="db-empty">
            <Table2 size={24} />
            <h3>{total > 0 ? 'No rows on this page' : 'This table is empty'}</h3>
            <p>
              {total > 0
                ? 'Return to the first page to see the remaining rows.'
                : 'Columns are ready. Rows will appear when your agent saves data.'}
            </p>
            {page > 0 && (
              <button className="button secondary" onClick={() => setPage(0)}>
                First page
              </button>
            )}
          </div>
        )}
      </section>
      <footer className="db-pagination">
        <span>
          {query.data
            ? `${total === 0 || query.data.rows.length === 0 ? 0 : page * pageSize + 1}–${Math.min(page * pageSize + query.data.rows.length, total)} of ${total.toLocaleString()} rows`
            : 'Loading…'}
        </span>
        <div>
          <span>50 per page</span>
          <button
            type="button"
            aria-label="Previous page"
            disabled={page === 0 || query.isFetching}
            onClick={() => setPage((current) => current - 1)}
          >
            <ChevronLeft size={15} />
          </button>
          <span>
            Page {page + 1} of {pages}
          </span>
          <button
            type="button"
            aria-label="Next page"
            disabled={page + 1 >= pages || query.isFetching}
            onClick={() => setPage((current) => current + 1)}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </footer>
    </div>
  );
}

function ColumnHeading({
  field,
  direction,
  onSort,
}: {
  field: TableData['columns'][number];
  direction: 'asc' | 'desc' | undefined;
  onSort: () => void;
}) {
  const SortIcon = direction === 'asc' ? ArrowUp : direction === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <th
      scope="col"
      aria-sort={direction ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button type="button" onClick={onSort} aria-label={`Sort by ${field.name}`}>
        <span className="db-column-name">
          {field.primaryKey && <KeyRound size={12} aria-label="Primary key" />}
          {field.name}
        </span>
        <span className="db-column-type">{field.type || 'any'}</span>
        <SortIcon size={12} />
      </button>
    </th>
  );
}

function TableGrid({
  data,
  offset,
  sort,
  onSort,
}: {
  data: TableData;
  offset: number;
  sort: Sort;
  onSort: (column: string) => void;
}) {
  const fields = data.columns;
  const columns = useMemo(
    () => [
      helper.display({ id: 'row-number', header: '#', cell: ({ row }) => offset + row.index + 1 }),
      ...fields.map((field, index) =>
        helper.display({
          id: `field-${index}`,
          header: field.name,
          cell: ({ row }) => {
            const value = row.original[index];
            return value === null ? (
              <span className="db-null">NULL</span>
            ) : (
              <span title={String(value)}>{String(value)}</span>
            );
          },
        }),
      ),
    ],
    [fields, offset],
  );
  const table = useTable({ columns, data: data.rows, features });
  const metadata = new Map(fields.map((field, index) => [`field-${index}`, field]));
  return (
    <table className="db-grid">
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id}>
            {group.headers.map((header) => {
              const field = metadata.get(header.column.id);
              if (field) {
                return (
                  <ColumnHeading
                    key={header.id}
                    field={field}
                    direction={sort?.column === field.name ? sort.direction : undefined}
                    onSort={() => onSort(field.name)}
                  />
                );
              }
              return (
                <th key={header.id} scope="col">
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              );
            })}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id}>
            {row.getAllCells().map((cell) => (
              <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
