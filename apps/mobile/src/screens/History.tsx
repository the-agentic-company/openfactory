import { runBucket } from '@openfactory/core';
import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { readFactoryRuns } from '@openfactory/client';
import { Button, ErrorNotice, Field, Label, styles } from '../ui';
import { Screen, Choices, type ManagementProps, type OpenConversation } from '../management-ui';

export function History({
  client,
  project,
  dashboard = false,
  onConversation,
}: ManagementProps & { dashboard?: boolean; onConversation: OpenConversation }) {
  const query = useQuery({
    queryKey: ['factory-history', project],
    queryFn: () => readFactoryRuns(project ?? 'all', client.call),
    refetchInterval: 15000,
  });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const runs = query.data?.runs ?? [];
  const filtered = runs.filter(
    (run) =>
      (filter === 'all' || runBucket(run.status) === filter) &&
      `${run.title} ${run.request} ${run.output}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <Screen title={dashboard ? 'Dashboard' : 'Runs'}>
      <ErrorNotice error={query.error} />
      <Button
        title="Refresh"
        busy={query.isFetching}
        onPress={() => {
          void query.refetch();
        }}
      />
      {dashboard && (
        <>
          <Label>
            {runs.length} runs ·{' '}
            {runs.filter((run) => run.status === 'running' || run.status === 'queued').length}{' '}
            active
          </Label>
          <Label>
            {runs.filter((run) => run.status === 'completed').length} completed ·{' '}
            {runs.filter((run) => run.status === 'failed' || run.status === 'interrupted').length}{' '}
            failed or interrupted
          </Label>
        </>
      )}
      <Field label="Search runs" value={search} onChangeText={setSearch} />
      <Choices
        values={['all', 'running', 'complete', 'failed', 'blocked', 'cancelled', 'other']}
        value={filter}
        onChange={setFilter}
      />
      {query.data && (query.data.limited || query.data.unavailable > 0) && (
        <Label muted>
          History covers {query.data.sampledThreads} conversations. {query.data.unavailable} could
          not be read.{query.data.limited ? ' Older history is outside this snapshot.' : ''}
        </Label>
      )}
      {filtered.length === 0 && !query.isPending && <Label muted>No matching runs.</Label>}
      {(dashboard ? filtered.slice(0, 10) : filtered).map((run) => (
        <View key={run.id} style={styles.group}>
          <Label>
            {run.title} · {run.status}
          </Label>
          <Label muted>{new Date(run.requestedAt).toLocaleString()}</Label>
          <Label>{run.request}</Label>
          {run.error && <ErrorNotice error={run.error} />}
          <Button
            title="Open conversation"
            onPress={() => onConversation(run.agentId, run.threadId)}
          />
        </View>
      ))}
    </Screen>
  );
}
