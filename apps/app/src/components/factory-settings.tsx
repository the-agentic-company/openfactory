import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderGit2, RefreshCw } from 'lucide-react';
import { factoryMachine, type FactoryGroup } from '../computer-workspaces';
import { selectComputer } from '../server/connections';
import { changeFactoryMachine } from '../server/factory-machine';
import type { FactoriesData } from './all-factories';
import { ComputerConnectionRow, native } from './computer-connections';
import { WorkspacePage } from './workspace-page';
import './factory-settings.css';

type Instance = FactoryGroup['instances'][number];
export function FactorySettings({
  group,
  data,
}: {
  group: FactoryGroup | undefined;
  data: FactoriesData;
}) {
  const client = useQueryClient();
  const selected = group && factoryMachine(group);
  const mutation = useMutation({
    mutationFn: async (destination: Instance) => {
      if (!group) {
        throw new Error('Factory is no longer available. Refresh and try again.');
      }
      const payload = {
        repository: destination.project.repository ?? null,
        instances: group.instances.map((entry) => ({
          computerId: entry.computerId,
          projectId: entry.project.id,
        })),
        destination: { computerId: destination.computerId, projectId: destination.project.id },
      };
      const api = native();
      if (api) {
        await api.invoke('factory-machine', payload);
      } else {
        await changeFactoryMachine({ data: payload });
      }
    },
    onSuccess: async (_, destination) => {
      const api = native();
      if (api) {
        await api.invoke('select-computer', { id: destination.computerId });
      } else {
        await selectComputer({ data: { id: destination.computerId } });
      }
      await client.invalidateQueries({ queryKey: ['agents'] });
      await client.invalidateQueries({ queryKey: ['connection-settings'] });
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['computer-workspace'] }),
  });
  const displayed = selected ?? group?.instances[0];
  const loading = data.settings.isPending || data.workspaces.some((entry) => entry.isPending);
  return (
    <WorkspacePage
      project={
        displayed
          ? {
              ...displayed.project,
              title: group?.title ?? displayed.project.title,
              icon: displayed.icon,
            }
          : undefined
      }
      title="Settings"
      contentClassName="factory-settings-page"
      actions={
        <button
          className="button secondary"
          disabled={mutation.isPending || data.workspaces.some((entry) => entry.isFetching)}
          onClick={() => void client.invalidateQueries({ queryKey: ['computer-workspace'] })}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      }
    >
      <section
        className="settings-section factory-machine-section"
        aria-labelledby="factory-machines-heading"
      >
        <div className="settings-section-heading">
          <div>
            <h2 id="factory-machines-heading">Machine</h2>
            <p>
              Choose where {group?.title ?? 'this factory'} runs. Agents and schedules run on one
              machine at a time.
            </p>
          </div>
        </div>
        {mutation.error && (
          <p role="alert" className="error-banner">
            {mutation.error.message} Refresh before retrying.
          </p>
        )}
        {mutation.isPending && (
          <output className="factory-machine-notice" aria-live="polite">
            Switching machines…
          </output>
        )}
        {mutation.isSuccess && !mutation.isPending && (
          <output className="settings-notice" aria-live="polite">
            Machine updated. Future runs use the selected machine.
          </output>
        )}
        {!group ? (
          <p className="settings-help">
            {loading
              ? 'Loading factory machines…'
              : 'This factory is unavailable. Check your machine connections, then refresh.'}
          </p>
        ) : (
          <>
            {!selected && (
              <p className="factory-machine-notice">Choose a machine to run this factory.</p>
            )}
            <ul
              className="computer-list factory-machine-list"
              aria-label={`Machines for ${group.title}`}
            >
              {group.instances.map((instance) => {
                const computer = data.computers.find((entry) => entry.id === instance.computerId);
                if (!computer) {
                  return null;
                }
                return (
                  <ComputerConnectionRow
                    key={JSON.stringify([instance.computerId, instance.project.id])}
                    computer={computer}
                    icon={data.settings.data?.computerIcons[computer.id]}
                    localName={data.settings.data?.local?.host.name}
                    localAddress={data.settings.data?.local?.address}
                    selected={selected === instance}
                    selectedLabel="Runs this factory"
                    selectLabel="Use this machine"
                    pending={mutation.isPending}
                    onSelect={() => mutation.mutate(instance)}
                    detail={
                      <span className="factory-machine-folder">
                        <FolderGit2 size={14} aria-hidden="true" />
                        {instance.project.workspaceRoot}
                      </span>
                    }
                  />
                );
              })}
            </ul>
            <p className="settings-help factory-machine-help">
              Finish active and queued runs before switching. Each machine keeps its own files and
              run history.
            </p>
          </>
        )}
      </section>
    </WorkspacePage>
  );
}
