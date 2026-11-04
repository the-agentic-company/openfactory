import { AppearanceFields } from '../AppearanceFields';
import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { agentAppearanceSchema, type AgentAppearance, type Agent } from '@openfactory/core';
import { type RuntimeClient } from '@openfactory/client';
import { z } from 'zod';
import { Button, ErrorNotice, Field, Label, styles } from '../ui';
import { useRefresh } from '../management-ui';

export function AgentSettings({ client, agent }: { client: RuntimeClient; agent: Agent }) {
  const deliveries = useQuery({
    queryKey: ['deliveries', agent.id],
    queryFn: () => client.call('agents.deliveries', { id: agent.id }),
    enabled: agent.schedule.type === 'webhook',
  });
  const [validAppearance, setValidAppearance] = useState(true);
  const [secret, setSecret] = useState('');
  const [appearance, setAppearance] = useState<AgentAppearance | null>(null);
  const savedAppearance = useQuery({
    queryKey: ['appearance', agent.id],
    queryFn: async () =>
      z.record(z.string(), agentAppearanceSchema).parse(
        await client.call('factory.settings', {
          operation: 'read',
          section: 'appearances',
          ids: [agent.id],
        }),
      ),
  });
  const refresh = useRefresh();
  const saveAppearance = useMutation({
    mutationFn: () =>
      client.call('factory.settings', {
        operation: 'write',
        section: 'appearances',
        id: agent.id,
        value: appearance ?? savedAppearance.data?.[agent.id] ?? { kind: 'icon', name: 'bot' },
      }),
    onSuccess: refresh,
  });
  const configure = useMutation({
    mutationFn: () => client.call('agents.webhookSecret', { id: agent.id, secret }),
    onSuccess: () => {
      setSecret('');
      refresh();
    },
  });
  return (
    <View style={styles.group}>
      <Label large>Settings</Label>
      <Label muted>
        {agent.runCount} dispatches · Next trigger{' '}
        {agent.nextRunAt ? new Date(agent.nextRunAt).toLocaleString() : 'None'}
      </Label>
      <Label muted>{agent.projectPath}</Label>
      <ErrorNotice
        error={agent.lastRunError ?? deliveries.error ?? configure.error ?? saveAppearance.error}
      />
      {savedAppearance.data && (
        <AppearanceFields
          key={JSON.stringify(savedAppearance.data[agent.id])}
          initial={savedAppearance.data[agent.id] ?? { kind: 'icon', name: 'bot' }}
          onChange={setAppearance}
          onValidityChange={setValidAppearance}
        />
      )}
      <ErrorNotice error={savedAppearance.error} />
      <Button
        title="Save appearance"
        disabled={!validAppearance || !savedAppearance.data}
        busy={saveAppearance.isPending}
        onPress={() => saveAppearance.mutate()}
      />
      {agent.schedule.type === 'webhook' && (
        <>
          <Label>Webhook endpoint</Label>
          <Label muted>
            {agent.webhook?.url ??
              'Set OPENFACTORY_PUBLIC_URL on the host to publish the endpoint.'}
          </Label>
          <Label muted>
            {agent.webhook?.hasSecret
              ? 'Signature verification enabled'
              : 'URL token authentication'}
          </Label>
          <Field
            label="Signing secret"
            value={secret}
            onChangeText={setSecret}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button
            title="Set signing secret"
            disabled={secret.length < 16}
            busy={configure.isPending}
            onPress={() => configure.mutate()}
          />
          {deliveries.data?.deliveries.map((delivery) => (
            <View key={delivery.id}>
              <Label>
                {delivery.method} · {delivery.outcome}
              </Label>
              <Label muted>
                {delivery.receivedAt} · {delivery.bodyBytes} bytes
              </Label>
              <ErrorNotice error={delivery.error} />
            </View>
          ))}
        </>
      )}
    </View>
  );
}
