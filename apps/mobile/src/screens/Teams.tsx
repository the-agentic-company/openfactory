import { useState } from 'react';
import { View, Switch } from 'react-native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createTeamFiles } from '@openfactory/client';
import * as Crypto from 'expo-crypto';
import { Button, ErrorNotice, Field, Label, styles } from '../ui';
import {
  Screen,
  FactoryRequired,
  useRefresh,
  type ManagementProps,
  type OpenConversation,
} from '../management-ui';

export function Teams({
  client,
  project,
  onConversation,
  onDefinitions,
}: ManagementProps & { onConversation: OpenConversation; onDefinitions: () => void }) {
  const teams = useQuery({
    queryKey: ['teams', project],
    queryFn: () => client.call('teams.list', { projectId: project ?? '' }),
    enabled: !!project,
  });
  const agents = useQuery({ queryKey: ['agents'], queryFn: () => client.call('agents.list', {}) });
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [instructions, setInstructions] = useState('');
  const [lead, setLead] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const refresh = useRefresh();
  const [requestId, setRequestId] = useState(Crypto.randomUUID);
  const run = useMutation({
    mutationFn: (input: { path: string; member?: string }) =>
      client.call('teams.run', { projectId: project ?? '', ...input, requestId }),
    onSuccess: (receipt) => {
      setRequestId(Crypto.randomUUID());
      refresh();
      onConversation(receipt.task.id, receipt.threadId);
    },
  });
  const create = useMutation({
    mutationFn: async () => {
      const current = await client.call('definitions.get', { projectId: project ?? '' });
      const result = createTeamFiles(current, {
        name,
        slug,
        description,
        instructions,
        leadAgentId: lead,
        memberAgentIds: members,
      });
      return client.call('definitions.save', {
        projectId: project ?? '',
        revision: current.revision,
        files: result.files,
      });
    },
    onSuccess: () => {
      refresh();
      setCreating(false);
    },
  });
  return (
    <Screen title="Teams">
      <FactoryRequired project={project}>
        <ErrorNotice error={teams.error ?? agents.error ?? run.error ?? create.error} />
        <View style={styles.row}>
          <Button title="New team" onPress={() => setCreating(!creating)} />
          <Button title="Edit team definitions" onPress={onDefinitions} />
        </View>
        {creating && (
          <View style={styles.group}>
            <Field label="Team name" value={name} onChangeText={setName} />
            <Field label="Folder name" value={slug} onChangeText={setSlug} autoCapitalize="none" />
            <Field label="Description" value={description} onChangeText={setDescription} />
            <Field
              label="Shared instructions"
              value={instructions}
              onChangeText={setInstructions}
              multiline
            />
            <Label>Lead</Label>
            {agents.data?.tasks
              .filter((agent) => agent.projectId === project)
              .map((agent) => (
                <View key={agent.id} style={styles.row}>
                  <Button
                    title={agent.title}
                    primary={lead === agent.id}
                    onPress={() => setLead(agent.id)}
                  />
                  <Label>Member</Label>
                  <Switch
                    accessibilityLabel={`Include ${agent.title}`}
                    value={members.includes(agent.id)}
                    onValueChange={(value) =>
                      setMembers(
                        value ? [...members, agent.id] : members.filter((id) => id !== agent.id),
                      )
                    }
                  />
                </View>
              ))}
            <Button
              title="Create team"
              primary
              busy={create.isPending}
              disabled={!lead || !name || !slug || !description}
              onPress={() => create.mutate()}
            />
          </View>
        )}
        {teams.data?.teams.length === 0 && (
          <Label muted>No teams yet. Create a team from this factory's agents.</Label>
        )}
        {teams.data?.teams.map((team) => (
          <View key={team.path} style={styles.group}>
            <Label large>{team.definition.name}</Label>
            <Label>{team.definition.description}</Label>
            <Label muted>{team.instructions}</Label>
            <Button
              title="Run lead"
              primary
              busy={run.isPending}
              onPress={() => run.mutate({ path: team.path })}
            />
            {team.agents.map((member) => (
              <View key={member.id} style={styles.group}>
                <Label>
                  {member.agent.title} ·{' '}
                  {member.id === team.definition.lead ? 'Lead' : `Reports to ${member.reportsTo}`}
                </Label>
                <Button
                  title={`Run ${member.agent.title}`}
                  disabled={run.isPending}
                  onPress={() => run.mutate({ path: team.path, member: member.id })}
                />
              </View>
            ))}
          </View>
        ))}
      </FactoryRequired>
    </Screen>
  );
}
