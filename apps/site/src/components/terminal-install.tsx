import { useState } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';

export function TerminalInstall({ origin }: { origin: string }) {
  const command = `curl -fsSL ${origin}/install.sh | sh`;
  const [copyState, setCopyState] = useState<'ready' | 'copied' | 'unavailable'>('ready');
  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopyState('copied');
    } catch {
      setCopyState('unavailable');
    }
  }
  return (
    <section
      className="download-platform-section download-terminal"
      aria-labelledby="terminal-title"
    >
      <h2 id="terminal-title">
        <Terminal size={20} />
        Terminal
      </h2>
      <div className="download-command">
        <code>{command}</code>
        <button
          type="button"
          onClick={() => void copy()}
          aria-label={copyState === 'copied' ? 'Install command copied' : 'Copy install command'}
          title="Copy install command"
        >
          {copyState === 'copied' ? <Check size={17} /> : <Copy size={17} />}
        </button>
      </div>
      <p className="download-platform-note">
        Installs the standalone CLI on macOS or Linux. No Node or npm required. Run{' '}
        <code>openfactory --help</code> to get started.
      </p>
      <p className="download-platform-note">
        Looking for the desktop app? Choose an installer above.{' '}
        <a href="/install.sh">Read the install script</a>.
      </p>
      <output className="download-copy-status">
        {copyState === 'copied'
          ? 'Copied to clipboard.'
          : copyState === 'unavailable'
            ? 'Select the command above and copy it manually.'
            : ''}
      </output>
    </section>
  );
}
