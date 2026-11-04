import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type RuntimeClient } from '@openfactory/client';
import { Button, ErrorNotice, Field, Label, styles } from '../ui';
import { Screen, useRefresh } from '../management-ui';

export function Factories({
  client,
  onSelect,
}: {
  client: RuntimeClient;
  onSelect: (id: string) => void;
}) {
  const query = useQuery({
    queryKey: ['workspace'],
    queryFn: () => client.call('workspace.snapshot', {}),
  });
  const [title, setTitle] = useState('');
  const [directory, setDirectory] = useState('');
  const refresh = useRefresh();
  const create = useMutation({
    mutationFn: () =>
      client.call('projects.upsert', {
        id: directory.trim(),
        title,
        workspaceRoot: directory.trim(),
      }),
    onSuccess: (project) => {
      refresh();
      setTitle('');
      setDirectory('');
      onSelect(project.id);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => client.call('projects.delete', { id }),
    onSuccess: refresh,
  });
  return (
    <Screen title="Factories">
      <ErrorNotice error={query.error ?? create.error ?? remove.error} />
      {query.data?.snapshot.projects.map((item) => (
        <View key={item.id} style={styles.group}>
          <Label>{item.title}</Label>
          <Label muted>{item.workspaceRoot}</Label>
          <View style={styles.row}>
            <Button title="Open factory" onPress={() => onSelect(item.id)} />
            <Button
              title="Remove factory"
              onPress={() =>
                Alert.alert(
                  'Remove factory?',
                  'This removes the factory and its agents from OpenFactory. Repository files stay on the computer.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Remove', style: 'destructive', onPress: () => remove.mutate(item.id) },
                  ],
                )
              }
            />
          </View>
        </View>
      ))}
      <Label large>New factory</Label>
      <Field label="Factory name" value={title} onChangeText={setTitle} />
      <Field
        label="Repository directory on computer"
        value={directory}
        onChangeText={setDirectory}
        placeholder="/absolute/path/to/repository"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Button
        title="Create factory"
        primary
        busy={create.isPending}
        disabled={!title.trim() || !directory.trim()}
        onPress={() => create.mutate()}
      />
    </Screen>
  );
}
