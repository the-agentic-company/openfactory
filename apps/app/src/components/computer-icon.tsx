import {
  Cloud,
  Cpu,
  Database,
  HardDrive,
  Laptop,
  Monitor,
  Server,
  ServerCog,
  Smartphone,
} from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { z } from 'zod';
import { computerIconSchema } from '../computer-workspaces';
import { updateComputerIcon } from '../server/connections';
import './all-factories.css';
import { native } from './computer-connections';

const icons = {
  laptop: { icon: Laptop, label: 'Laptop' },
  monitor: { icon: Monitor, label: 'Desktop' },
  server: { icon: Server, label: 'Server' },
  'server-cog': { icon: ServerCog, label: 'Managed server' },
  cloud: { icon: Cloud, label: 'Cloud' },
  database: { icon: Database, label: 'Database' },
  cpu: { icon: Cpu, label: 'Compute' },
  'hard-drive': { icon: HardDrive, label: 'Storage' },
  smartphone: { icon: Smartphone, label: 'Phone' },
};
export type ComputerIconName = z.infer<typeof computerIconSchema>;
export function ComputerGlyph({
  icon = 'laptop',
  size = 19,
}: {
  icon?: ComputerIconName;
  size?: number;
}) {
  const Icon = icons[icon].icon;
  return <Icon size={size} aria-hidden="true" />;
}
export function ComputerIconPicker({
  id,
  name,
  icon = 'laptop',
}: {
  id: string;
  name: string;
  icon?: ComputerIconName;
}) {
  const client = useQueryClient();
  const menu = useRef<HTMLDivElement>(null);
  const save = useMutation({
    mutationFn: async (next: ComputerIconName) => {
      const api = native();
      if (api) {
        await api.invoke('computer-icon', { id, icon: next });
      } else {
        await updateComputerIcon({ data: { id, icon: next } });
      }
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['connection-settings'] });
      menu.current?.hidePopover();
    },
  });
  const menuId = `computer-icon-${id}`;
  return (
    <>
      <button
        type="button"
        className="icon-button"
        popoverTarget={menuId}
        aria-label={`Change icon for ${name}`}
        title={`Change icon for ${name}`}
      >
        <ComputerGlyph icon={icon} />
      </button>
      <div id={menuId} ref={menu} popover="auto" className="computer-icon-menu">
        <strong>Computer icon</strong>
        <div className="computer-icon-options">
          {computerIconSchema.options.map((value) => {
            const Icon = icons[value].icon;
            return (
              <button
                key={value}
                type="button"
                aria-label={icons[value].label}
                aria-pressed={value === icon}
                disabled={save.isPending}
                onClick={() => save.mutate(value)}
              >
                <Icon size={20} />
                <span>{icons[value].label}</span>
              </button>
            );
          })}
        </div>
        {save.error && <p role="alert">Could not save icon. {save.error.message}</p>}
      </div>
    </>
  );
}
