import { projectName } from '../project-path';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useSyncExternalStore, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import {
  Bot,
  ChartNoAxesCombined,
  FileCode2,
  GitPullRequest,
  History,
  ListChecks,
  Settings,
  Users,
} from 'lucide-react';
import {
  computerWorkspaceSchema,
  factoryMachine,
  groupComputerFactories,
} from '../computer-workspaces';
import { getComputerWorkspace } from '../server/computer-workspaces';
import { loadSettings, native } from './computer-connections';
import { AppearanceGlyph } from './appearance-glyph';
import './all-factories.css';
import { OverviewDashboard } from './overview-dashboard';
import { useOpenComputerFactory } from './factory-navigation';

const subscribe = () => () => {};
function cacheKey(id: string, origin: string | null | undefined) {
  return `openfactory-workspace:${JSON.stringify([id, origin])}`;
}
export function useComputerFactories() {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const settings = useQuery({
    queryKey: ['connection-settings'],
    queryFn: loadSettings,
    enabled: mounted,
    refetchInterval: 10000,
  });
  const computers = settings.data?.computers ?? [];
  const workspaces = useQueries({
    queries: computers.map((computer) => ({
      queryKey: ['computer-workspace', computer.id, computer.origin],
      queryFn: async () => {
        const api = native();
        const value = computerWorkspaceSchema.parse(
          api
            ? await api.invoke('workspace-summary', { computerId: computer.id })
            : await getComputerWorkspace({ data: { id: computer.id } }),
        );
        try {
          localStorage.setItem(cacheKey(computer.id, computer.origin), JSON.stringify(value));
        } catch {
          /* A full cache must not prevent live reads. */
        }
        return value;
      },
      initialData: () => {
        if (!mounted) {
          return undefined;
        }
        try {
          const parsed = computerWorkspaceSchema.safeParse(
            JSON.parse(localStorage.getItem(cacheKey(computer.id, computer.origin)) ?? 'null'),
          );
          return parsed.success ? parsed.data : undefined;
        } catch {
          return undefined;
        }
      },
      initialDataUpdatedAt: 0,
      enabled: mounted,
      refetchInterval: 10000,
      retry: false,
    })),
  });
  const groups = groupComputerFactories(
    computers.flatMap((computer, index) => {
      const result = workspaces[index];
      return result?.data ? [{ computerId: computer.id, workspace: result.data }] : [];
    }),
  );
  return { settings, computers, workspaces, groups };
}
export type FactoriesData = ReturnType<typeof useComputerFactories>;
export function AllFactories({ data, onCreate }: { data: FactoriesData; onCreate: () => void }) {
  return <OverviewDashboard data={data} onCreate={onCreate} />;
}
function subscribeFactoryNavigation(listener: () => void) {
  window.addEventListener('storage', listener);
  window.addEventListener('openfactory-navigation-change', listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener('openfactory-navigation-change', listener);
  };
}

function FactoryNavigationGroup({
  factoryKey,
  defaultOpen,
  children,
}: {
  factoryKey: string;
  defaultOpen: boolean;
  children: ReactNode;
}) {
  const preference = `openfactory-factory-expanded:${factoryKey}`;
  const expanded = useSyncExternalStore(
    subscribeFactoryNavigation,
    () => {
      const saved = localStorage.getItem(preference);
      return saved === null ? defaultOpen : saved === 'true';
    },
    () => defaultOpen,
  );
  return (
    <details
      className="all-factories-nav-group"
      open={expanded}
      onToggle={(event) => {
        if (event.target !== event.currentTarget) {
          return;
        }
        const next = event.currentTarget.open;
        localStorage.setItem(preference, String(next));
        window.dispatchEvent(new Event('openfactory-navigation-change'));
      }}
    >
      {children}
    </details>
  );
}

const factoryViews = [
  ['teams', 'Teams', Users],
  ['dashboard', 'Dashboard', ChartNoAxesCombined],
  ['runs', 'Runs', History],
  ['pull-requests', 'Pull requests', GitPullRequest],
  ['scorers', 'Scorers', ListChecks],
  ['definition', 'Factory definition', FileCode2],
  ['agents', 'Agents', Bot],
] as const;

export function AllFactoriesNavigation({
  data,
  activeProject,
  activeView,
}: {
  data: FactoriesData;
  activeProject?: string;
  activeView?: string;
}) {
  const open = useOpenComputerFactory();
  return (
    <>
      {data.groups.map((group) => {
        const machine = factoryMachine(group);
        const displayed = machine ?? group.instances[0];
        if (!displayed) {
          return null;
        }
        const selectedComputer = displayed.computerId === data.settings.data?.activeId;
        const active =
          (selectedComputer || activeView === 'settings') &&
          displayed.project.workspaceRoot === activeProject;
        const project = projectName(displayed.project.workspaceRoot);
        return (
          <FactoryNavigationGroup key={group.key} factoryKey={group.key} defaultOpen={active}>
            <summary>
              <AppearanceGlyph
                appearance={displayed.icon ?? { kind: 'icon', name: 'factory', color: 'gray' }}
                size={17}
              />
              <span className="sidebar-label">{group.title}</span>
            </summary>
            {machine && (
              <>
                <div className="factory-view-navigation">
                  {factoryViews.map(([view, label, Icon]) => {
                    const current = active && activeView === view;
                    return (
                      <Link
                        key={view}
                        className={`nav-link ${current ? 'active' : ''}`}
                        {...(view === 'teams'
                          ? ({
                              to: '/app/projects/$project/teams/{-$section}',
                              params: { project, section: undefined },
                            } as const)
                          : ({
                              to: '/app/projects/$project/$view',
                              params: { project, view },
                            } as const))}
                        aria-current={current ? 'page' : undefined}
                        onClick={(event) => {
                          if (!selectedComputer) {
                            event.preventDefault();
                            open.mutate({
                              computerId: machine.computerId,
                              workspaceRoot: machine.project.workspaceRoot,
                              view,
                            });
                          }
                        }}
                      >
                        <Icon size={15} aria-hidden="true" />
                        <span className="sidebar-label">{label}</span>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
            <Link
              to="/app/projects/$project/settings"
              params={{ project }}
              search={{ factory: group.key }}
              className={`nav-link ${active && activeView === 'settings' ? 'active' : ''}`}
              aria-label={`Settings for ${group.title}`}
              aria-current={active && activeView === 'settings' ? 'page' : undefined}
            >
              <Settings size={15} /> <span className="sidebar-label">Settings</span>
            </Link>
          </FactoryNavigationGroup>
        );
      })}
      {open.error && <p role="alert">{open.error.message}</p>}
    </>
  );
}
