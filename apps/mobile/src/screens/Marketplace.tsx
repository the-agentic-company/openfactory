import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type MarketplaceKind, type MarketplaceEntry } from '@openfactory/core';
import { Button, ErrorNotice, Field, Label, styles } from '../ui';
import { Screen, Choices, useRefresh, type ManagementProps } from '../management-ui';

export function Marketplace({ client, project }: ManagementProps) {
  const [kind, setKind] = useState<MarketplaceKind>('factory');
  const [search, setSearch] = useState('');
  const [queryText, setQueryText] = useState('');
  const [source, setSource] = useState('');
  const [entry, setEntry] = useState<MarketplaceEntry | null>(null);
  const query = useQuery({
    queryKey: ['marketplace', kind, queryText],
    queryFn: () => client.call('marketplace.leaderboard', { kind, query: queryText }),
    staleTime: 60000,
  });
  const preview = useQuery({
    queryKey: ['marketplace-preview', entry?.source],
    queryFn: () => client.call('marketplace.show', { source: entry?.source ?? '' }),
    enabled: !!entry,
  });
  const refresh = useRefresh();
  const add = useMutation({
    mutationFn: async () => {
      if (!project || !entry || !preview.data) {
        throw new Error('Select a factory and review the source before importing.');
      }
      const target = await client.call('definitions.get', { projectId: project });
      return client.call('marketplace.add', {
        ...entry,
        projectId: project,
        revision: target.revision,
        previewRevision: preview.data.revision,
      });
    },
    onSuccess: refresh,
  });
  return (
    <Screen title="Marketplace">
      <Choices
        values={['factory', 'agent', 'automation', 'team']}
        value={kind}
        onChange={setKind}
      />
      <Field label="Search marketplace" value={search} onChangeText={setSearch} />
      <Button title="Search" onPress={() => setQueryText(search)} />
      <ErrorNotice error={query.error ?? preview.error ?? add.error} />
      {query.data?.warning && <Label muted>{query.data.warning}</Label>}
      <Field
        label="Repository source"
        value={source}
        onChangeText={setSource}
        placeholder="owner/repository"
        autoCapitalize="none"
      />
      <Button
        title="Preview repository"
        disabled={!source}
        onPress={() =>
          setEntry({
            source,
            kind,
            name: 'factory',
            title: source,
            description: '',
            url: null,
            stars: null,
          })
        }
      />
      {entry && (
        <View style={styles.group}>
          <Label large>{entry.title}</Label>
          <Label>{entry.description}</Label>
          {preview.data && (
            <>
              <Label muted>{Object.keys(preview.data.files).length} source files</Label>
              {preview.data.entries.map((item) => (
                <Button
                  key={`${item.kind}:${item.name}`}
                  title={`${item.kind}: ${item.name}`}
                  primary={entry.kind === item.kind && entry.name === item.name}
                  onPress={() => setEntry(item)}
                />
              ))}
              {Object.entries(preview.data.files).map(([path, content]) => (
                <View key={path}>
                  <Label>{path}</Label>
                  <Label muted>{content}</Label>
                </View>
              ))}
              <Button
                title="Import into selected factory"
                primary
                busy={add.isPending}
                disabled={!project}
                onPress={() => add.mutate()}
              />
              {add.data && (
                <Label>
                  Imported {add.data.imported} files into {add.data.location}.
                </Label>
              )}
            </>
          )}
        </View>
      )}
      {query.data?.entries.map((item) => (
        <View key={`${item.source}:${item.kind}:${item.name}`} style={styles.group}>
          <Label>{item.title}</Label>
          <Label muted>{item.description}</Label>
          <Button title="Review source" onPress={() => setEntry(item)} />
        </View>
      ))}
    </Screen>
  );
}
