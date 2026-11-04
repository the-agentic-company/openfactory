import { useState } from 'react';
import { View, Linking } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Button, ErrorNotice, Field, Label, styles } from '../ui';
import { Screen, type ManagementProps } from '../management-ui';

export function PullRequests({ client, project }: ManagementProps) {
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const [search, setSearch] = useState('');
  const query = useQuery({
    queryKey: ['pull-requests', project, days],
    queryFn: () => client.call('pullRequests.list', { project: project ?? 'all', days }),
    staleTime: 60000,
  });
  return (
    <Screen title="Pull requests">
      <View style={styles.row}>
        {([1, 7, 30] as const).map((value) => (
          <Button
            key={value}
            title={`${value} days`}
            primary={days === value}
            onPress={() => setDays(value)}
          />
        ))}
      </View>
      <Field label="Search pull requests" value={search} onChangeText={setSearch} />
      <Button
        title="Refresh"
        busy={query.isFetching}
        onPress={() => {
          void query.refetch();
        }}
      />
      <ErrorNotice error={query.error} />
      {!!query.data?.unavailable.length && (
        <Label muted>
          Could not load {query.data.unavailable.join(', ')}. Check GitHub CLI authentication on the
          computer.
        </Label>
      )}
      {!!query.data?.unlinked.length && (
        <Label muted>No GitHub origin: {query.data.unlinked.join(', ')}</Label>
      )}
      {query.data?.limited && (
        <Label muted>Results are limited to 100 pull requests per repository.</Label>
      )}
      {query.data?.pulls
        .filter((pr) =>
          `${pr.title} ${pr.number} ${pr.author}`.toLowerCase().includes(search.toLowerCase()),
        )
        .map((pr) => (
          <View key={pr.url} style={styles.group}>
            <Label>
              #{pr.number} {pr.title}
            </Label>
            <Label muted>
              {pr.repository} · {pr.state} · {pr.author}
            </Label>
            <Label muted>
              Checks {pr.checks} · {pr.review || 'No review'} · +{pr.additions} / -{pr.deletions}
            </Label>
            <Button
              title="Open on GitHub"
              onPress={() => {
                void Linking.openURL(pr.url);
              }}
            />
          </View>
        ))}
    </Screen>
  );
}
