import { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { type RuntimeClient, type RuntimeResult } from '@openfactory/client';
import { Button, ErrorNotice, Field, Label, styles } from '../ui';
import { Screen, FactoryRequired, useRefresh, type ManagementProps } from '../management-ui';

type Definition = RuntimeResult<'definitions.get'>;
export function Definitions({ client, project }: ManagementProps) {
  const query = useQuery({
    queryKey: ['definitions', project],
    queryFn: () => client.call('definitions.get', { projectId: project ?? '' }),
    enabled: !!project,
  });
  return (
    <Screen title="Factory definition">
      <FactoryRequired project={project}>
        <ErrorNotice error={query.error} />
        {query.data && project && (
          <DefinitionForm
            key={`${project}:${query.data.revision}`}
            current={query.data}
            client={client}
            project={project}
          />
        )}
      </FactoryRequired>
    </Screen>
  );
}
function DefinitionForm({
  current,
  client,
  project,
}: {
  current: Definition;
  client: RuntimeClient;
  project: string;
}) {
  const [files, setFiles] = useState(current.files);
  const [path, setPath] = useState('factory.yaml');
  const [newPath, setNewPath] = useState('');
  const refresh = useRefresh();
  const save = useMutation({
    mutationFn: () =>
      client.call('definitions.save', { projectId: project, revision: current.revision, files }),
    onSuccess: refresh,
  });
  return (
    <>
      <Label muted>{current.location}</Label>
      <Label muted>
        Save applies these files to the computer. The revision prevents overwriting another edit.
      </Label>
      <ScrollView horizontal contentContainerStyle={styles.row}>
        {Object.keys(files).map((item) => (
          <Button key={item} title={item} primary={path === item} onPress={() => setPath(item)} />
        ))}
      </ScrollView>
      <Field
        label={path}
        value={files[path] ?? ''}
        onChangeText={(value) => setFiles({ ...files, [path]: value })}
        multiline
        autoCapitalize="none"
        autoCorrect={false}
        style={{ minHeight: 400, textAlignVertical: 'top' }}
      />
      {path !== 'factory.yaml' && (
        <Button
          title="Remove file"
          onPress={() =>
            Alert.alert('Remove this definition file?', path, [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Remove',
                style: 'destructive',
                onPress: () => {
                  setFiles(
                    Object.fromEntries(Object.entries(files).filter(([key]) => key !== path)),
                  );
                  setPath('factory.yaml');
                },
              },
            ])
          }
        />
      )}
      <Field
        label="New file path"
        value={newPath}
        onChangeText={setNewPath}
        placeholder="teams/my-team/team.yaml"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Button
        title="Add file"
        disabled={!newPath || newPath in files}
        onPress={() => {
          setFiles({ ...files, [newPath]: '' });
          setPath(newPath);
          setNewPath('');
        }}
      />
      <ErrorNotice error={save.error} />
      {save.isSuccess && <Label>Saved.</Label>}
      <Button
        title="Save factory definition"
        primary
        busy={save.isPending}
        onPress={() => save.mutate()}
      />
    </>
  );
}
