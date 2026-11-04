import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { agentDefinition, type Agent } from '@openfactory/core';
import { agentUpdateFromDefinition } from '@openfactory/client';
import { upsertSchema } from '@openfactory/protocol/contracts';
import { Button, ErrorNotice, Field, Label } from '../ui';
import { Screen, Choices, useRefresh, type ManagementProps } from '../management-ui';

export function AgentEditor({
  client,
  project,
  agent,
  onSaved,
  onCancel,
  definitionOnly = false,
}: ManagementProps & {
  agent?: Agent;
  onSaved: () => void;
  onCancel: () => void;
  definitionOnly?: boolean;
}) {
  const [title, setTitle] = useState(agent?.title ?? '');
  const [prompt, setPrompt] = useState(agent?.prompt ?? '');
  const [model, setModel] = useState(agent?.modelSelection.model ?? 'gpt-6.1-sol');
  const [provider, setProvider] = useState<'codex' | 'claude-code'>(
    agent?.modelSelection.instanceId === 'claude-code' ||
      agent?.modelSelection.instanceId === 'claude'
      ? 'claude-code'
      : 'codex',
  );
  const [mode, setMode] = useState<'approval-required' | 'auto-accept-edits' | 'full-access'>(
    agent?.runtimeMode ?? 'approval-required',
  );
  const [trigger, setTrigger] = useState<'manual' | 'interval' | 'fixed_time' | 'webhook'>(
    agent?.schedule.type ?? 'manual',
  );
  const [minutes, setMinutes] = useState(
    String(agent?.schedule.type === 'interval' ? agent.schedule.everyMs / 60000 : 60),
  );
  const [time, setTime] = useState(
    agent?.schedule.type === 'fixed_time' ? agent.schedule.timeOfDay : '09:00',
  );
  const [strategy, setStrategy] = useState<'root' | 'worktree' | 'existing_worktree'>(
    agent?.workspaceStrategy?.type ?? 'root',
  );
  const [worktreePath, setWorktreePath] = useState(
    agent?.workspaceStrategy?.type === 'existing_worktree'
      ? agent.workspaceStrategy.worktreePath
      : '',
  );
  const [baseRef, setBaseRef] = useState(
    agent?.workspaceStrategy?.type === 'worktree' ? agent.workspaceStrategy.baseRef : 'HEAD',
  );
  const [interaction, setInteraction] = useState<'default' | 'plan'>(
    agent?.interactionMode ?? 'default',
  );
  const [options, setOptions] = useState(() =>
    JSON.stringify(agent?.modelSelection.options ?? {}, null, 2),
  );
  const [source, setSource] = useState(() => (agent ? agentDefinition(agent) : ''));
  const editingSource = definitionOnly;
  const [expectedSource] = useState(() => (agent ? agentDefinition(agent) : ''));
  const refresh = useRefresh();
  const save = useMutation({
    mutationFn: async () => {
      const schedule =
        trigger === 'interval'
          ? { type: trigger, everyMs: Number(minutes) * 60000 }
          : trigger === 'fixed_time'
            ? { ...agent?.schedule, type: trigger, timeOfDay: time }
            : { ...agent?.schedule, type: trigger };
      const update =
        agent && editingSource
          ? agentUpdateFromDefinition(agent, source, expectedSource)
          : upsertSchema.parse({
              ...(agent ? { id: agent.id, expectedSource } : {}),
              title,
              prompt,
              projectId: agent?.projectId ?? project,
              enabled: agent?.enabled ?? false,
              schedule,
              modelSelection: { instanceId: provider, model, options: JSON.parse(options) },
              runtimeMode: mode,
              interactionMode: interaction,
              workspaceStrategy:
                strategy === 'worktree'
                  ? { ...agent?.workspaceStrategy, type: strategy, baseRef }
                  : strategy === 'existing_worktree'
                    ? { type: strategy, worktreePath }
                    : { ...agent?.workspaceStrategy, type: 'root' },
            });
      return client.call('agents.upsert', update);
    },
    onSuccess: () => {
      refresh();
      onSaved();
    },
  });
  return (
    <Screen title={definitionOnly ? 'Agent definition' : agent ? 'Edit agent' : 'New agent'}>
      <Button title="Cancel" onPress={onCancel} />
      {editingSource ? (
        <Field
          label="agent.md"
          multiline
          value={source}
          onChangeText={setSource}
          autoCapitalize="none"
          autoCorrect={false}
          style={{ minHeight: 420, textAlignVertical: 'top' }}
        />
      ) : (
        <>
          <Field label="Agent name" value={title} onChangeText={setTitle} maxLength={120} />
          <Field
            label="Instructions"
            multiline
            value={prompt}
            onChangeText={setPrompt}
            maxLength={16000}
            style={{ minHeight: 160, textAlignVertical: 'top' }}
          />
          <Label>Provider</Label>
          <Choices values={['codex', 'claude-code']} value={provider} onChange={setProvider} />
          <Field label="Model" value={model} onChangeText={setModel} autoCapitalize="none" />
          <Label>Permissions</Label>
          <Choices
            values={['approval-required', 'auto-accept-edits', 'full-access']}
            value={mode}
            onChange={setMode}
          />
          <Label>Trigger</Label>
          <Choices
            values={['manual', 'interval', 'fixed_time', 'webhook']}
            value={trigger}
            onChange={setTrigger}
          />
          {trigger === 'interval' && (
            <Field
              label="Interval in minutes"
              value={minutes}
              onChangeText={setMinutes}
              keyboardType="number-pad"
            />
          )}
          {trigger === 'fixed_time' && (
            <Field label="Time on host computer (HH:MM)" value={time} onChangeText={setTime} />
          )}
          <Label>Workspace</Label>
          <Choices
            values={['root', 'worktree', 'existing_worktree']}
            value={strategy}
            onChange={setStrategy}
          />
          {strategy === 'worktree' && (
            <Field
              label="Base reference"
              value={baseRef}
              onChangeText={setBaseRef}
              autoCapitalize="none"
            />
          )}
          {strategy === 'existing_worktree' && (
            <Field
              label="Existing worktree directory"
              value={worktreePath}
              onChangeText={setWorktreePath}
              autoCapitalize="none"
            />
          )}
          <Label>Interaction</Label>
          <Choices values={['default', 'plan']} value={interaction} onChange={setInteraction} />
          <Field
            label="Model options (JSON)"
            value={options}
            onChangeText={setOptions}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
          />
        </>
      )}
      <ErrorNotice error={save.error} />
      <Button
        title="Save agent"
        primary
        busy={save.isPending}
        disabled={!project && !agent}
        onPress={() => save.mutate()}
      />
    </Screen>
  );
}
