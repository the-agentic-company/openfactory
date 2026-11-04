import { useState } from 'react';
import { Linking, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { readRunDetail, type RuntimeClient } from '@openfactory/client';
import { Button, ErrorNotice, Label, styles } from '../ui';
import { Choices } from '../management-ui';
import { MessageContent } from '../MessageContent';

export function RunInspector({
  client,
  threadId,
  runId,
}: {
  client: RuntimeClient;
  threadId: string;
  runId: string;
}) {
  const [tab, setTab] = useState<'Artifacts' | 'Timeline' | 'Agents' | 'Scores' | 'Metadata'>(
    'Artifacts',
  );
  const query = useQuery({
    queryKey: ['run-detail', threadId, runId],
    queryFn: () => readRunDetail({ threadId, runId }, client.call),
    refetchInterval: 5000,
  });
  const detail = query.data;
  return (
    <View style={styles.group}>
      <Label large>Run detail</Label>
      <Choices
        values={['Artifacts', 'Timeline', 'Agents', 'Scores', 'Metadata']}
        value={tab}
        onChange={setTab}
      />
      <ErrorNotice error={query.error} />
      {detail && (
        <>
          <Label>
            Run {detail.run.ordinal} · {detail.run.status}
          </Label>
          <ErrorNotice error={detail.run.error} />
          {detail.limited && <Label muted>Long messages are truncated in this view.</Label>}
          {tab === 'Artifacts' && (
            <>
              <Label>Links</Label>
              {detail.links.map((link) => (
                <Button
                  key={link.url}
                  title={link.label}
                  onPress={() => {
                    void Linking.openURL(link.url);
                  }}
                />
              ))}
              {detail.links.length === 0 && <Label muted>No links in this run.</Label>}
              <Label>Attachments</Label>
              {detail.attachments.map((item) => (
                <Label key={item.id}>
                  {item.name} · {item.mimeType} · {item.sizeBytes} bytes
                </Label>
              ))}
              {detail.attachments.length === 0 && <Label muted>No attachments in this run.</Label>}
              {detail.messages
                .filter((message) => message.role === 'assistant')
                .map((message) => (
                  <MessageContent key={message.id} text={message.text} />
                ))}
            </>
          )}
          {tab === 'Timeline' &&
            detail.messages.map((message) => (
              <View key={message.id} style={styles.group}>
                <Label muted>
                  {message.role} · {new Date(message.createdAt).toLocaleString()}
                </Label>
                <MessageContent text={message.text} />
              </View>
            ))}
          {tab === 'Agents' && (
            <>
              <Label>Agent ID: {detail.agentId ?? 'Unassigned'}</Label>
              <Label muted>
                Created by {detail.createdBy ?? 'Unknown'} · Source{' '}
                {detail.creationSource ?? 'Unknown'}
              </Label>
              <Label muted>
                {detail.run.modelSelection?.instanceId} · {detail.run.modelSelection?.model}
              </Label>
            </>
          )}
          {tab === 'Scores' && (
            <>
              {detail.scores.map((score) => (
                <Label key={score.id}>
                  {score.name} ·{' '}
                  {score.result === null ? 'Pending' : score.result ? 'Pass' : 'Fail'}
                </Label>
              ))}
              {detail.scores.length === 0 && (
                <Label muted>No scorer rules apply to this run.</Label>
              )}
            </>
          )}
          {tab === 'Metadata' && (
            <>
              <Label muted>Run {detail.run.id}</Label>
              <Label muted>Conversation {detail.thread.id}</Label>
              <Label muted>Requested {detail.run.requestedAt}</Label>
              <Label muted>Started {detail.run.startedAt ?? 'Not started'}</Label>
              <Label muted>Completed {detail.run.completedAt ?? 'Not completed'}</Label>
              <Label muted>Directory {detail.thread.cwd ?? detail.project?.workspaceRoot}</Label>
              <Label muted>Provider session {detail.thread.nativeSessionId ?? 'None'}</Label>
              {detail.run.usage && (
                <Label muted>
                  Input {detail.run.usage.input} · Cached {detail.run.usage.cached} · Output{' '}
                  {detail.run.usage.output}
                </Label>
              )}
            </>
          )}
        </>
      )}
    </View>
  );
}
