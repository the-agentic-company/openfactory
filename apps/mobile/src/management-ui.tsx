import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { RuntimeClient } from '@openfactory/client';
import { Button, Label, styles } from './ui';

export type ManagementProps = { client: RuntimeClient; project: string | null };
export type OpenConversation = (agentId: string, threadId: string) => void;

export function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Label large>{title}</Label>
      {children}
    </ScrollView>
  );
}
export function useRefresh() {
  const cache = useQueryClient();
  return () => {
    void cache.invalidateQueries();
  };
}
export function FactoryRequired({
  children,
  project,
}: {
  children: ReactNode;
  project: string | null;
}) {
  return project ? children : <Label muted>Select a factory above to manage it.</Label>;
}
export function Choices<T extends string>({
  values,
  value,
  onChange,
}: {
  values: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.row}>
      {values.map((item) => (
        <Button
          key={item}
          title={item.replaceAll('_', ' ')}
          primary={value === item}
          onPress={() => onChange(item)}
        />
      ))}
    </View>
  );
}
