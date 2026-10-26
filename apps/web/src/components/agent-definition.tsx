import {
  agentDefinition,
  agentDirectory,
  parseAgentDefinition,
  type Agent,
} from '@openfactory/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { saveAgentDefinition } from '../server/agent-definition';

export function AgentDefinition({ agent }: { agent: Agent }) {
  const client = useQueryClient();
  const [baseline, setBaseline] = useState(() => agentDefinition(agent));
  const [source, setSource] = useState(baseline);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState('');
  let validation = '';
  try {
    parseAgentDefinition(source);
  } catch (error) {
    validation = error instanceof Error ? error.message : 'Invalid definition.';
  }
  const save = useMutation({
    mutationFn: () =>
      saveAgentDefinition({ data: { id: agent.id, source, expectedSource: baseline } }),
    onSuccess: (task) => {
      const saved = agentDefinition(task);
      setBaseline(saved);
      setSource(saved);
      setEditing(false);
      setNotice('Definition saved to T3.');
      void client.invalidateQueries({ queryKey: ['agents'] });
    },
  });
  function download() {
    const url = URL.createObjectURL(new Blob([source], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${agentDirectory(agent)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return (
    <section className="agent-definition-page" aria-label="Agent definition">
      <div className="definition-heading">
        <div>
          <h2>Definition</h2>
          <code>agents/{agentDirectory(agent)}/agent.md</code>
        </div>
        <div className="definition-actions">
          <button className="button secondary" onClick={download}>
            Download file
          </button>
          <button
            className="button secondary"
            disabled={save.isPending}
            onClick={() => {
              setEditing(!editing);
              setNotice('');
            }}
          >
            {editing ? 'View file' : 'Edit definition'}
          </button>
        </div>
      </div>
      <p className="detail-note">
        YAML configuration and Markdown instructions.{' '}
        <Link to="/docs/$" params={{ _splat: '' }}>
          About factory as code
        </Link>
      </p>
      {editing ? (
        <label className="definition-editor-label">
          agent.md
          <textarea
            className="definition-editor"
            value={source}
            spellCheck={false}
            maxLength={20000}
            disabled={save.isPending}
            onChange={(event) => {
              setSource(event.target.value);
              setNotice('');
            }}
          />
        </label>
      ) : (
        <pre className="prompt-block definition-source">
          <code>{source}</code>
        </pre>
      )}
      {editing && validation && (
        <pre className="error-banner" role="alert">
          {validation}
        </pre>
      )}
      {save.isError && (
        <p className="error-banner" role="alert">
          {save.error.message}
        </p>
      )}
      {editing && (
        <div className="definition-actions">
          <button
            className="button primary"
            disabled={Boolean(validation) || save.isPending || source === baseline}
            onClick={() => save.mutate()}
          >
            {save.isPending ? 'Saving…' : 'Save definition'}
          </button>
          <button
            className="button secondary"
            disabled={save.isPending}
            onClick={() => {
              const latest = agentDefinition(agent);
              setSource(latest);
              setBaseline(latest);
              save.reset();
              setEditing(false);
            }}
          >
            Reload definition
          </button>
        </div>
      )}
      {notice && <output>{notice}</output>}
      <p className="detail-note">
        Saving updates this agent's name, instructions, and model. Its trigger and runtime
        permissions stay in T3. Downloaded files are snapshots.
      </p>
    </section>
  );
}
