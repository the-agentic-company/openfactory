import { useState } from 'react';
import { View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { RuntimeClient } from '@openfactory/client';
import { Button, ErrorNotice, Field, Label, styles } from '../ui';

export function AgentUsage({ client, id }: { client: RuntimeClient; id: string }) {
  const [sinceDay, setSinceDay] = useState(() =>
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  );
  const [untilDay, setUntilDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [range, setRange] = useState({ sinceDay, untilDay });
  const query = useQuery({
    queryKey: ['agent-usage', id, range],
    queryFn: () =>
      client.call('usage.agent', {
        id,
        ...range,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
  });
  return (
    <View style={styles.group}>
      <Label large>Agent usage</Label>
      <Field label="From (YYYY-MM-DD)" value={sinceDay} onChangeText={setSinceDay} />
      <Field label="Through (YYYY-MM-DD)" value={untilDay} onChangeText={setUntilDay} />
      <Button title="Apply dates" onPress={() => setRange({ sinceDay, untilDay })} />
      <ErrorNotice error={query.error} />
      {query.data && (
        <>
          <Label>
            {query.data.total.toLocaleString()} tokens · {query.data.runs} runs
          </Label>
          <Label muted>
            Input {query.data.input.toLocaleString()} · Cached {query.data.cached.toLocaleString()}{' '}
            · Cache creation {query.data.cacheWrite.toLocaleString()} · Output{' '}
            {query.data.output.toLocaleString()} · Reasoning {query.data.reasoning.toLocaleString()}
          </Label>
          <Label>
            {query.data.completed} completed · {query.data.failed} failed
          </Label>
          <Label muted>
            {query.data.partial ? 'Partial coverage' : 'Complete coverage'} ·{' '}
            {query.data.measuredTurns} measured turns
          </Label>
          <Label muted>
            Measured cost ${query.data.costUsd.toFixed(4)} · {query.data.unpriced} records without a
            price
          </Label>
          {query.data.pricingAt && <Label muted>Prices as of {query.data.pricingAt}</Label>}
        </>
      )}
    </View>
  );
}
