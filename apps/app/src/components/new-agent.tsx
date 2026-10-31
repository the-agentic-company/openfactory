import { Select, SelectItem } from './ui/select';
import type { Agent } from '@openfactory/core';
import { useMutation } from '@tanstack/react-query';
import { Plus, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { createAgent } from '../server/agents';
import { Modal } from './modal';

export function NewAgent({
  agents,
  targetProject,
  onClose,
  onCreated,
}: {
  agents: Agent[];
  targetProject?: { id: string; title: string };
  onClose: () => void;
  onCreated: () => void;
}) {
  const [trigger, setTrigger] = useState<'manual' | 'interval' | 'fixed_time' | 'webhook'>(
    'manual',
  );
  const mutation = useMutation({
    mutationFn: (data: Parameters<typeof createAgent>[0]['data']) => createAgent({ data }),
    onSuccess: onCreated,
  });
  const [provider, setProvider] = useState<'codex' | 'claude-code'>('codex');
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const field = (name: string, fallback = '') => {
      const value = fields.get(name);
      return typeof value === 'string' ? value : fallback;
    };
    mutation.mutate({
      title: field('title'),
      prompt: field('prompt'),
      provider,
      model: field('model'),
      runtimeMode: z
        .enum(['approval-required', 'auto-accept-edits', 'full-access'])
        .parse(field('runtimeMode')),
      workspaceRoot: targetProject ? undefined : field('workspaceRoot'),
      projectId: targetProject?.id,
      trigger,
      minutes: Number(field('minutes', '60')),
      timeOfDay: field('timeOfDay', '09:00'),
    });
  }
  return (
    <Modal titleId="create-title" onClose={onClose}>
      <div className="modal-heading">
        <button className="icon-button" aria-label="Close new agent" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <h2 id="create-title">Create an agent</h2>
      <p>Choose its instructions and schedule. New agents start paused.</p>
      <form onSubmit={submit}>
        <label>
          Name
          <input
            required
            name="title"
            maxLength={120}
            placeholder="e.g. Morning project briefing"
          />
        </label>
        <label>
          Instructions
          <textarea
            required
            name="prompt"
            maxLength={16000}
            rows={5}
            placeholder="What should this agent do? Webhooks can use {{body.event}}."
          />
        </label>
        <label htmlFor="new-agent-select-1">
          Trigger
          <Select
            id="new-agent-select-1"
            value={trigger}
            onValueChange={(value) =>
              setTrigger(z.enum(['manual', 'interval', 'fixed_time', 'webhook']).parse(value))
            }
          >
            <SelectItem value="manual">Manual only</SelectItem>
            <SelectItem value="interval">Repeating interval</SelectItem>
            <SelectItem value="fixed_time">Daily at a fixed time</SelectItem>
            <SelectItem value="webhook">Incoming webhook</SelectItem>
          </Select>
        </label>
        {trigger === 'interval' && (
          <label>
            Interval in minutes
            <input name="minutes" type="number" defaultValue={60} min={1} max={525600} required />
          </label>
        )}
        {trigger === 'fixed_time' && (
          <label>
            Time (host timezone)
            <input name="timeOfDay" type="time" defaultValue="09:00" required />
          </label>
        )}
        {!targetProject && (
          <label>
            Working directory
            <input name="workspaceRoot" required placeholder="/absolute/path/to/project" />
          </label>
        )}
        <label htmlFor="new-agent-select-2">
          Provider
          <Select
            id="new-agent-select-2"
            value={provider}
            onValueChange={(value) => setProvider(z.enum(['codex', 'claude-code']).parse(value))}
          >
            <SelectItem value="codex">Codex CLI</SelectItem>
            <SelectItem value="claude-code">Claude Code CLI</SelectItem>
          </Select>
        </label>
        <label>
          Model
          <input
            key={provider}
            name="model"
            required
            defaultValue={
              agents.find((agent) => agent.modelSelection.instanceId === provider)?.modelSelection
                .model ?? ''
            }
            placeholder="Model available in your provider account"
          />
        </label>
        <label htmlFor="new-agent-select-3">
          Permissions
          <Select id="new-agent-select-3" name="runtimeMode" defaultValue="auto-accept-edits">
            <SelectItem value="approval-required">Read only</SelectItem>
            <SelectItem value="auto-accept-edits">Allow workspace edits</SelectItem>
            <SelectItem value="full-access">Full host access</SelectItem>
          </Select>
        </label>
        <p className="detail-note">
          OpenFactory starts the selected CLI in {targetProject?.title ?? 'this directory'}. Install
          and sign in to that CLI on the host. Each run creates a new session; follow-ups resume it.
        </p>
        {mutation.isError && (
          <p role="alert" className="error-banner">
            {mutation.error.message}
          </p>
        )}
        <button className="button primary" disabled={mutation.isPending} type="submit">
          {mutation.isPending ? 'Creating…' : 'Create paused agent'}
          <Plus size={14} />
        </button>
      </form>
    </Modal>
  );
}
