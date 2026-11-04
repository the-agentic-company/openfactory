import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Button, ErrorNotice, Field, Label, styles } from '../ui';
import { Screen, FactoryRequired, type ManagementProps } from '../management-ui';

export function Usage({ client, project }: ManagementProps) {
  const [sinceDay, setSinceDay] = useState(() =>
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  );
  const [untilDay, setUntilDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [range, setRange] = useState({ sinceDay, untilDay });
  const query = useQuery({
    queryKey: ['usage', project, range],
    queryFn: () =>
      client.call('usage.factory', {
        project: project ?? '',
        ...range,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    enabled: !!project,
  });
  return (
    <Screen title="Token usage">
      <FactoryRequired project={project}>
        <Field label="From (YYYY-MM-DD)" value={sinceDay} onChangeText={setSinceDay} />
        <Field label="Through (YYYY-MM-DD)" value={untilDay} onChangeText={setUntilDay} />
        <Button title="Apply dates" onPress={() => setRange({ sinceDay, untilDay })} />
        <ErrorNotice error={query.error} />
        {query.data?.sources.map((source, index) => (
          <Label key={index} muted>
            Coverage: {source.status}
          </Label>
        ))}
        {query.data?.buckets.length === 0 && (
          <Label muted>No measured usage in this date range.</Label>
        )}
        {query.data?.buckets.map((bucket) => (
          <View key={`${bucket.day}:${bucket.model}`} style={styles.group}>
            <Label>
              {bucket.day} · {bucket.model}
            </Label>
            <Label muted>
              Input {bucket.totals.uncachedInputTokens.toLocaleString()} · Cached{' '}
              {bucket.totals.cachedInputTokens.toLocaleString()} · Cache creation{' '}
              {bucket.totals.cacheCreationTokens.toLocaleString()} · Output{' '}
              {bucket.totals.outputTokens.toLocaleString()}
            </Label>
          </View>
        ))}
      </FactoryRequired>
    </Screen>
  );
}
