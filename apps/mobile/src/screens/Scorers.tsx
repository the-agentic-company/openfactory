import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { scorerSchema, scoreOutput } from '@openfactory/core';
import { readFactoryRuns } from '@openfactory/client';
import * as Crypto from 'expo-crypto';
import { z } from 'zod';
import { Button, ErrorNotice, Field, Label, styles } from '../ui';
import {
  Screen,
  FactoryRequired,
  Choices,
  useRefresh,
  type ManagementProps,
} from '../management-ui';

export function Scorers({ client, project }: ManagementProps) {
  const [agentId, setAgentId] = useState<string | null>(null);
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => client.call('agents.list', {}) });
  const [scorerId, setScorerId] = useState(Crypto.randomUUID);
  const refresh = useRefresh();
  const [name, setName] = useState('');
  const [rule, setRule] = useState<'contains' | 'excludes' | 'min_length'>('contains');
  const [value, setValue] = useState('');
  const snapshot = useQuery({
    queryKey: ['workspace'],
    queryFn: () => client.call('workspace.snapshot', {}),
  });
  const selected = snapshot.data?.snapshot.projects.find((item) => item.id === project);
  const query = useQuery({
    queryKey: ['scorers'],
    queryFn: async () =>
      z
        .array(scorerSchema)
        .parse(await client.call('factory.settings', { operation: 'read', section: 'scorers' })),
  });
  const history = useQuery({
    queryKey: ['factory-history', project],
    queryFn: () => readFactoryRuns(project ?? 'all', client.call),
  });
  const create = useMutation({
    mutationFn: () =>
      client.call('factory.settings', {
        operation: 'write',
        section: 'scorers',
        id: scorerId,
        value: scorerSchema.parse({
          id: scorerId,
          name,
          project: selected?.workspaceRoot ?? project,
          agentId,
          rule:
            rule === 'min_length'
              ? { type: rule, length: Number(value) }
              : { type: rule, text: value },
          createdAt: new Date().toISOString(),
        }),
      }),
    onSuccess: () => {
      refresh();
      setName('');
      setValue('');
      setScorerId(Crypto.randomUUID());
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      client.call('factory.settings', { operation: 'remove', section: 'scorers', id }),
    onSuccess: refresh,
  });
  return (
    <Screen title="Scorers">
      <FactoryRequired project={project}>
        <ErrorNotice error={query.error ?? history.error ?? create.error ?? remove.error} />
        {query.data
          ?.filter(
            (scorer) => scorer.project === project || scorer.project === selected?.workspaceRoot,
          )
          .map((scorer) => (
            <View key={scorer.id} style={styles.group}>
              <Label>{scorer.name}</Label>
              <Label muted>{scorer.rule.type}</Label>
              {history.data?.runs
                .filter((run) => !scorer.agentId || run.agentId === scorer.agentId)
                .map((run) => (
                  <Label key={run.id} muted>
                    {run.title}:{' '}
                    {!['completed', 'succeeded'].includes(run.status) || !run.output
                      ? 'Pending'
                      : scoreOutput(scorer.rule, run.output)
                        ? 'Pass'
                        : 'Fail'}
                  </Label>
                ))}
              <Button title="Delete scorer" onPress={() => remove.mutate(scorer.id)} />
            </View>
          ))}
        <Label large>New scorer</Label>
        <Label>Applies to</Label>
        <View style={styles.row}>
          <Button title="All agents" primary={agentId === null} onPress={() => setAgentId(null)} />
          {agents.data?.tasks
            .filter((agent) => agent.projectId === project)
            .map((agent) => (
              <Button
                key={agent.id}
                title={agent.title}
                primary={agentId === agent.id}
                onPress={() => setAgentId(agent.id)}
              />
            ))}
        </View>
        <Field label="Scorer name" value={name} onChangeText={setName} />
        <Choices values={['contains', 'excludes', 'min_length']} value={rule} onChange={setRule} />
        <Field
          label={rule === 'min_length' ? 'Minimum characters' : 'Text to match'}
          value={value}
          onChangeText={setValue}
        />
        <Button
          title="Create scorer"
          primary
          disabled={!name || !value || !selected}
          busy={create.isPending}
          onPress={() => create.mutate()}
        />
      </FactoryRequired>
    </Screen>
  );
}
