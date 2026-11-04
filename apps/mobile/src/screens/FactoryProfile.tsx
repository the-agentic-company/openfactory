import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { agentAppearanceSchema, type AgentAppearance } from '@openfactory/core';
import { factoryProfileSchema } from '@openfactory/protocol/settings';
import type { RuntimeClient } from '@openfactory/client';
import { AppearanceFields } from '../AppearanceFields';
import { Button, ErrorNotice, Field, Label, styles } from '../ui';
import { useRefresh } from '../management-ui';

export function FactoryProfile({
  client,
  project,
}: {
  client: RuntimeClient;
  project: { id: string; title: string };
}) {
  const profile = useQuery({
    queryKey: ['factory-profile', project.id],
    queryFn: async () =>
      z.record(z.string(), factoryProfileSchema).parse(
        await client.call('factory.settings', {
          operation: 'read',
          section: 'factories',
          ids: [project.id],
        }),
      ),
  });
  return (
    <View style={styles.group}>
      <ErrorNotice error={profile.error} />
      {profile.data && (
        <ProfileForm
          key={project.id}
          client={client}
          projectId={project.id}
          initial={
            profile.data[project.id] ?? {
              title: project.title,
              icon: { kind: 'icon', name: 'factory' },
            }
          }
        />
      )}
    </View>
  );
}
function ProfileForm({
  client,
  projectId,
  initial,
}: {
  client: RuntimeClient;
  projectId: string;
  initial: z.infer<typeof factoryProfileSchema>;
}) {
  const [validAppearance, setValidAppearance] = useState(true);
  const [title, setTitle] = useState(initial.title);
  const [icon, setIcon] = useState<AgentAppearance>(initial.icon);
  const refresh = useRefresh();
  const save = useMutation({
    mutationFn: () =>
      client.call('factory.settings', {
        operation: 'write',
        section: 'factories',
        id: projectId,
        value: factoryProfileSchema.parse({ title, icon: agentAppearanceSchema.parse(icon) }),
      }),
    onSuccess: refresh,
  });
  return (
    <View style={styles.group}>
      <Label large>Factory appearance</Label>
      <Field label="Factory name" value={title} onChangeText={setTitle} />
      <AppearanceFields initial={icon} onChange={setIcon} onValidityChange={setValidAppearance} />
      <ErrorNotice error={save.error} />
      <Button
        title="Save factory appearance"
        disabled={!validAppearance}
        primary
        busy={save.isPending}
        onPress={() => save.mutate()}
      />
    </View>
  );
}
