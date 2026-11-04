import { Monitor, Palette, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';
import { ConnectionSettings, type SettingsSection } from './connection-settings';
import { Modal } from './modal';

const sections = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'computers', label: 'Computers', icon: Monitor },
  { id: 'devices', label: 'Devices & access', icon: ShieldCheck },
] satisfies { id: SettingsSection; label: string; icon: typeof Monitor }[];

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<SettingsSection>('computers');
  const current = sections.find((item) => item.id === section);
  return (
    <Modal titleId="settings-title" onClose={onClose} className="settings-modal">
      <nav className="settings-modal-nav" aria-label="Settings sections">
        <h2 id="settings-title">Settings</h2>
        <span className="settings-modal-group">Application</span>
        {sections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={section === id ? 'page' : undefined}
            onClick={() => setSection(id)}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>
      <div className="settings-modal-main">
        <header className="settings-modal-header">
          <div>
            <span>Settings</span>
            <span aria-hidden="true">/</span>
            <strong>{current?.label}</strong>
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label="Close settings"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        <div className="settings-modal-content">
          <ConnectionSettings section={section} />
        </div>
      </div>
    </Modal>
  );
}
