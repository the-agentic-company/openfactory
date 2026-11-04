import { AppearanceGlyph } from './AppearanceGlyph';
import { z } from 'zod';
import { agentAppearanceSchema } from '@openfactory/core';
import { RunInspector } from './screens/RunInspector';
import { AgentUsage } from './screens/AgentUsage';
import { AgentApp } from './screens/AgentApp';
import { MessageContent } from './MessageContent';
import {
  AgentEditor,
  AgentSettings,
  Definitions,
  Factories,
  History,
  Marketplace,
  PullRequests,
  Scorers,
  Screen,
  Teams,
  Usage,
  FactoryProfile,
} from './Management';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Switch,
  View,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { type RuntimeClient, type SavedComputer } from '@openfactory/client';
import { type Agent, scheduleLabel } from '@openfactory/core';
import { Button, ErrorNotice, Field, Label, styles, useTheme } from './ui';

type Section =
  | 'Agents'
  | 'Factories'
  | 'Dashboard'
  | 'Runs'
  | 'Usage'
  | 'Pull requests'
  | 'Teams'
  | 'Scorers'
  | 'Definition'
  | 'Marketplace'
  | 'Settings';
type Destination =
  | { kind: 'section'; section: Section }
  | { kind: 'agent'; id: string; threadId?: string }
  | { kind: 'editor'; agent?: Agent; definition?: boolean };
const sections: Section[] = [
  'Agents',
  'Factories',
  'Dashboard',
  'Runs',
  'Usage',
  'Pull requests',
  'Teams',
  'Scorers',
  'Definition',
  'Marketplace',
  'Settings',
];
export function Workspace({
  client,
  computer,
  computers,
  onSelectComputer,
  onAddComputer,
  onForgetComputer,
}: {
  client: RuntimeClient;
  computer: SavedComputer;
  computers: SavedComputer[];
  onSelectComputer: (id: string) => void;
  onAddComputer: () => void;
  onForgetComputer: (id: string) => void;
}) {
  const [destination, setDestination] = useState<Destination>({
    kind: 'section',
    section: 'Agents',
  });
  const [project, setProject] = useState<string | null>(null);
  const colors = useTheme();
  const agents = useQuery({
    queryKey: ['agents'],
    queryFn: () => client.call('agents.list', {}),
    refetchInterval: 5000,
  });
  const snapshot = useQuery({
    queryKey: ['workspace'],
    queryFn: () => client.call('workspace.snapshot', {}),
    refetchInterval: 10000,
  });
  const appearances = useQuery({
    queryKey: ['appearances', agents.data?.tasks.map((item) => item.id)],
    queryFn: async () =>
      z.record(z.string(), agentAppearanceSchema).parse(
        await client.call('factory.settings', {
          operation: 'read',
          section: 'appearances',
          ids: agents.data?.tasks.map((item) => item.id) ?? [],
        }),
      ),
    enabled: !!agents.data,
  });
  const goBack = () => setDestination({ kind: 'section', section: 'Agents' });
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (destination.kind === 'section' && destination.section === 'Agents') {
        return false;
      }
      setDestination({ kind: 'section', section: 'Agents' });
      return true;
    });
    return () => subscription.remove();
  }, [destination]);
  const openConversation = (id: string, threadId: string) =>
    setDestination({ kind: 'agent', id, threadId });
  if (destination.kind === 'editor') {
    return (
      <AgentEditor
        client={client}
        project={project}
        agent={destination.agent}
        definitionOnly={destination.definition}
        onSaved={goBack}
        onCancel={goBack}
      />
    );
  }
  if (destination.kind === 'agent') {
    const raw = agents.data?.tasks.find((item) => item.id === destination.id);
    const factory = snapshot.data?.snapshot.projects.find((item) => item.id === raw?.projectId);
    const agent = raw
      ? {
          ...raw,
          projectName: factory?.title ?? raw.projectName,
          projectPath: factory?.workspaceRoot ?? raw.projectPath,
        }
      : undefined;
    return agent ? (
      <AgentDetail
        key={`${agent.id}:${destination.threadId ?? ''}`}
        agent={agent}
        initialThread={destination.threadId}
        client={client}
        onBack={goBack}
        onEdit={() => setDestination({ kind: 'editor', agent })}
        onEditDefinition={() => setDestination({ kind: 'editor', agent, definition: true })}
      />
    ) : (
      <View style={styles.content}>
        <Label>This agent is unavailable.</Label>
        <Button title="Back to agents" onPress={goBack} />
      </View>
    );
  }
  const section = destination.section;
  const props = { client, project };
  const tasks = agents.data?.tasks.filter((item) => !project || item.projectId === project) ?? [];
  const selectedProject = snapshot.data?.snapshot.projects.find((item) => item.id === project);
  return (
    <View style={styles.fill}>
      <View
        style={{
          paddingHorizontal: 20,
          paddingBottom: 12,
          gap: 8,
          borderBottomWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Label muted>{computer.name}</Label>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          <Button
            title="All factories"
            primary={project === null}
            onPress={() => setProject(null)}
          />
          {snapshot.data?.snapshot.projects.map((item) => (
            <Button
              key={item.id}
              title={item.title}
              primary={project === item.id}
              onPress={() => setProject(item.id)}
            />
          ))}
        </ScrollView>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {sections.map((item) => (
            <Button
              key={item}
              title={item}
              primary={section === item}
              onPress={() => setDestination({ kind: 'section', section: item })}
            />
          ))}
        </ScrollView>
      </View>
      {section === 'Agents' && (
        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={agents.isRefetching}
              onRefresh={() => {
                void agents.refetch();
                void snapshot.refetch();
              }}
              tintColor={colors.accent}
            />
          }
          ListHeaderComponent={
            <View style={styles.group}>
              <Label large>Agents</Label>
              <Button
                title="New agent"
                primary
                disabled={!project}
                onPress={() => setDestination({ kind: 'editor' })}
              />
              {!project && <Label muted>Select a factory to create an agent.</Label>}
              <ErrorNotice error={agents.error ?? snapshot.error} />
              {agents.error && (
                <Button
                  title="Retry connection"
                  onPress={() => {
                    void agents.refetch();
                  }}
                />
              )}
            </View>
          }
          ListEmptyComponent={
            agents.isPending ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Label muted>
                {agents.error ? 'Check the host and network connection.' : 'No agents here yet.'}
              </Label>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.title}`}
              onPress={() => setDestination({ kind: 'agent', id: item.id })}
              style={({ pressed }) => ({
                gap: 6,
                paddingVertical: 20,
                borderBottomWidth: 1,
                borderColor: colors.border,
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <View style={styles.row}>
                <AppearanceGlyph appearance={appearances.data?.[item.id]} />
                <Label>{item.title}</Label>
              </View>
              <Label muted>
                {item.projectName} · {item.enabled ? scheduleLabel(item.schedule) : 'Paused'}
              </Label>
              <Label muted>
                {item.lastRunStatus === 'never' ? 'No runs yet' : item.lastRunStatus} ·{' '}
                {item.modelSelection.model}
              </Label>
            </Pressable>
          )}
        />
      )}
      {section === 'Factories' && (
        <Factories
          client={client}
          onSelect={(id) => {
            setProject(id);
            goBack();
          }}
        />
      )}
      {(section === 'Runs' || section === 'Dashboard') && (
        <History {...props} dashboard={section === 'Dashboard'} onConversation={openConversation} />
      )}
      {section === 'Usage' && <Usage {...props} />}
      {section === 'Pull requests' && <PullRequests {...props} />}
      {section === 'Teams' && (
        <Teams
          {...props}
          onConversation={openConversation}
          onDefinitions={() => setDestination({ kind: 'section', section: 'Definition' })}
        />
      )}
      {section === 'Scorers' && <Scorers {...props} />}
      {section === 'Definition' && <Definitions {...props} />}
      {section === 'Marketplace' && <Marketplace {...props} />}
      {section === 'Settings' && (
        <Screen title="Settings">
          <Button title="Add computer" primary onPress={onAddComputer} />
          {computers.map((item) => (
            <View key={item.hostId} style={styles.group}>
              <Label>{item.name}</Label>
              <Label muted>{item.origin}</Label>
              <View style={styles.row}>
                <Button
                  title={item.hostId === computer.hostId ? 'Current computer' : 'Use computer'}
                  primary={item.hostId === computer.hostId}
                  onPress={() => onSelectComputer(item.hostId)}
                />
                <Button
                  title="Forget"
                  onPress={() =>
                    Alert.alert('Forget computer?', item.name, [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Forget',
                        style: 'destructive',
                        onPress: () => onForgetComputer(item.hostId),
                      },
                    ])
                  }
                />
              </View>
            </View>
          ))}
          {selectedProject && <FactoryProfile client={client} project={selectedProject} />}
        </Screen>
      )}
    </View>
  );
}

function AgentDetail({
  agent,
  client,
  onBack,
  onEdit,
  onEditDefinition,
  initialThread,
}: {
  agent: Agent;
  client: RuntimeClient;
  onBack: () => void;
  onEdit: () => void;
  onEditDefinition: () => void;
  initialThread?: string;
}) {
  const colors = useTheme();
  const cache = useQueryClient();
  const [tab, setTab] = useState<'App' | 'Conversation' | 'Runs' | 'Usage' | 'Settings'>(
    'Conversation',
  );
  const [selectedRun, setSelectedRun] = useState<string | null>(null);
  const [thread, setThread] = useState(initialThread ?? agent.threadId);
  const [text, setText] = useState('');
  const [runRequestId, setRunRequestId] = useState(Crypto.randomUUID);
  const [messageId, setMessageId] = useState(Crypto.randomUUID);
  const history = useQuery({
    queryKey: ['conversation', thread],
    queryFn: () => client.call('sessions.projection', { threadId: thread ?? '' }),
    enabled: !!thread,
    refetchInterval: 3000,
  });
  const snapshot = useQuery({
    queryKey: ['workspace'],
    queryFn: () => client.call('workspace.snapshot', {}),
    refetchInterval: 10000,
  });
  const conversations =
    snapshot.data?.snapshot.threads.filter(
      (item) =>
        item.agentIds?.includes(agent.id) || item.id === agent.threadId || item.id === thread,
    ) ?? [];
  const refresh = () => {
    void cache.invalidateQueries();
  };
  const run = useMutation({
    mutationFn: () => client.call('agents.run', { id: agent.id, requestId: runRequestId }),
    onSuccess: (receipt) => {
      setThread(receipt.threadId);
      setRunRequestId(Crypto.randomUUID());
      refresh();
    },
  });
  const enabled = useMutation({
    mutationFn: (value: boolean) =>
      client.call('agents.setEnabled', { id: agent.id, enabled: value }),
    onSuccess: refresh,
  });
  const send = useMutation({
    mutationFn: () =>
      client.call('sessions.send', {
        threadId: thread ?? '',
        text,
        agentId: agent.id,
        messageId,
      }),
    onSuccess: () => {
      setText('');
      setMessageId(Crypto.randomUUID());
      refresh();
    },
  });
  const stop = useMutation({
    mutationFn: () => client.call('sessions.stop', { threadId: thread ?? '', agentId: agent.id }),
    onSuccess: refresh,
  });
  const active = history.data?.runs.some(
    (item) => item.status === 'running' || item.status === 'queued',
  );
  return (
    <FlatList
      data={
        tab === 'Conversation' && !selectedRun
          ? (history.data?.messages.filter(
              (message) => !selectedRun || message.runId === selectedRun,
            ) ?? [])
          : []
      }
      keyExtractor={(item) => item.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={history.isRefetching}
          onRefresh={() => {
            refresh();
          }}
          tintColor={colors.accent}
        />
      }
      ListHeaderComponent={
        <View style={styles.group}>
          <Button title="Back to agents" onPress={onBack} />
          <Button title="Edit agent" onPress={onEdit} />
          <Label large>{agent.title}</Label>
          <Label muted>
            {agent.projectName} · {agent.modelSelection.model}
          </Label>
          <View style={styles.row}>
            {(['App', 'Conversation', 'Runs', 'Usage', 'Settings'] as const).map((item) => (
              <Button
                key={item}
                title={item}
                primary={tab === item}
                onPress={() => {
                  setTab(item);
                  setSelectedRun(null);
                }}
              />
            ))}
          </View>
          <View style={styles.row}>
            <Label>Scheduled runs</Label>
            <Switch
              accessibilityLabel="Scheduled runs"
              value={agent.enabled}
              disabled={enabled.isPending}
              onValueChange={(value) => enabled.mutate(value)}
              trackColor={{ true: colors.accent }}
            />
            <Label muted>{scheduleLabel(agent.schedule)}</Label>
          </View>
          <View style={styles.row}>
            <Button title="Run now" primary busy={run.isPending} onPress={() => run.mutate()} />
            {thread && (
              <Button
                title="Stop conversation"
                disabled={!active}
                busy={stop.isPending}
                onPress={() => stop.mutate()}
              />
            )}
          </View>
          <ErrorNotice error={run.error ?? enabled.error ?? stop.error} />
          {conversations.length > 1 && (
            <ScrollView horizontal contentContainerStyle={styles.row}>
              {conversations.map((item) => (
                <Button
                  key={item.id}
                  title={item.title}
                  primary={thread === item.id}
                  onPress={() => setThread(item.id)}
                />
              ))}
            </ScrollView>
          )}
          {tab === 'Usage' && <AgentUsage client={client} id={agent.id} />}
          {tab === 'App' && <AgentApp client={client} id={agent.id} />}
          {tab === 'Settings' && (
            <>
              <Label>{agent.prompt}</Label>
              <Button title="Edit agent.md" onPress={onEditDefinition} />
              <AgentSettings client={client} agent={agent} />
            </>
          )}
          {tab === 'Conversation' && <Label large>Conversation</Label>}
          <ErrorNotice error={history.error} />
          {history.error && (
            <Button
              title="Retry conversation"
              onPress={() => {
                void history.refetch();
              }}
            />
          )}
          {thread && history.isPending && <ActivityIndicator color={colors.accent} />}
          {!thread && <Label muted>Run this agent to start a conversation.</Label>}
          {tab === 'Runs' &&
            history.data?.runs.map((item) => (
              <View key={item.id} style={styles.group}>
                <Label>
                  Run {item.ordinal} · {item.status}
                </Label>
                <Label muted>Requested {new Date(item.requestedAt).toLocaleString()}</Label>
                <Label muted>
                  Started {item.startedAt ?? 'Not started'} · Completed{' '}
                  {item.completedAt ?? 'Not complete'}
                </Label>
                {item.usage && (
                  <Label muted>
                    Input {item.usage.input} · Cached {item.usage.cached} · Cache creation{' '}
                    {item.usage.cacheWrite} · Output {item.usage.output}
                    {item.usage.costUsd !== null ? ` · $${item.usage.costUsd}` : ''}
                  </Label>
                )}
                <Label muted>Run ID: {item.id}</Label>
                <ErrorNotice error={item.error} />
                <Button
                  title="View run output"
                  onPress={() => {
                    setSelectedRun(item.id);
                    setTab('Conversation');
                  }}
                />
              </View>
            ))}
          {selectedRun && thread && (
            <RunInspector client={client} threadId={thread} runId={selectedRun} />
          )}
          {selectedRun && (
            <Button title="Show whole conversation" onPress={() => setSelectedRun(null)} />
          )}
        </View>
      }
      renderItem={({ item }) => (
        <View
          style={{
            padding: 16,
            gap: 8,
            borderRadius: 12,
            backgroundColor: item.role === 'user' ? colors.accentSoft : colors.surface,
          }}
        >
          <Label muted>
            {item.role === 'user' ? 'You' : item.role === 'assistant' ? agent.title : 'System'}
          </Label>
          <MessageContent text={item.text || 'Waiting for a response…'} />
        </View>
      )}
      ListFooterComponent={
        thread && tab === 'Conversation' ? (
          <View style={styles.group}>
            <Field
              label="Message"
              value={text}
              onChangeText={(value) => {
                setText(value);
                setMessageId(Crypto.randomUUID());
              }}
              placeholder="Continue the conversation…"
              multiline
              maxLength={16000}
              editable={!send.isPending}
              style={{ minHeight: 100, textAlignVertical: 'top' }}
            />
            <ErrorNotice error={send.error} />
            <Button
              title={active ? 'Queue message' : 'Send message'}
              primary
              busy={send.isPending}
              disabled={!text.trim()}
              onPress={() => send.mutate()}
            />
          </View>
        ) : undefined
      }
    />
  );
}
