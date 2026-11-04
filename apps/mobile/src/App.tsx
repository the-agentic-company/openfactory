import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, KeyboardAvoidingView, Platform, View } from 'react-native';
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { createRuntimeClient } from '@openfactory/client';
import { Pairing } from './Pairing';
import { Workspace } from './Workspace';
import { forgetComputers, loadComputers, saveComputers, type ComputerCatalog } from './storage';
import { Button, ErrorNotice, Theme, styles, useTheme } from './ui';

type ConnectionState =
  | { kind: 'loading' }
  | { kind: 'unpaired' }
  | { kind: 'connected'; catalog: ComputerCatalog }
  | { kind: 'error'; error: unknown };
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1 }, mutations: { retry: false } },
});

export default function App() {
  useEffect(() => {
    focusManager.setFocused(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) =>
      focusManager.setFocused(state === 'active'),
    );
    return () => subscription.remove();
  }, []);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <Theme>
          <Application />
        </Theme>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
function Application() {
  const [addingComputer, setAddingComputer] = useState(false);
  const [state, setState] = useState<ConnectionState>({ kind: 'loading' });
  const colors = useTheme();
  useEffect(() => {
    void loadComputers()
      .then((catalog) =>
        setState(catalog.computers.length ? { kind: 'connected', catalog } : { kind: 'unpaired' }),
      )
      .catch((error: unknown) => setState({ kind: 'error', error }));
  }, []);
  const catalog = state.kind === 'connected' ? state.catalog : null;
  const computer =
    catalog?.computers.find((item) => item.hostId === catalog.selectedId) ??
    catalog?.computers[0] ??
    null;
  const client = useMemo(() => (computer ? createRuntimeClient(computer) : null), [computer]);
  async function selectComputer(hostId: string) {
    if (!catalog) {
      return;
    }
    const next = { ...catalog, selectedId: hostId };
    try {
      await saveComputers(next);
      await queryClient.cancelQueries();
      queryClient.clear();
      setState({ kind: 'connected', catalog: next });
    } catch (error) {
      setState({ kind: 'error', error });
    }
  }
  async function disconnect(hostId?: string) {
    try {
      const next = catalog
        ? {
            computers: catalog.computers.filter((item) => item.hostId !== hostId),
            selectedId: catalog.selectedId === hostId ? null : catalog.selectedId,
          }
        : { computers: [], selectedId: null };
      if (next.computers.length) {
        await saveComputers(next);
      } else {
        await forgetComputers();
      }
      await queryClient.cancelQueries();
      queryClient.clear();
      setState(next.computers.length ? { kind: 'connected', catalog: next } : { kind: 'unpaired' });
    } catch (error) {
      setState({ kind: 'error', error });
    }
  }
  async function connected() {
    try {
      const next = await loadComputers();
      queryClient.clear();
      setAddingComputer(false);
      setState({ kind: 'connected', catalog: next });
    } catch (error) {
      setState({ kind: 'error', error });
    }
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.canvas }]}>
      <StatusBar style="auto" />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {state.kind === 'loading' && (
          <ActivityIndicator accessibilityLabel="Loading saved computer" color={colors.accent} />
        )}
        {state.kind === 'error' && (
          <View style={styles.content}>
            <ErrorNotice error={state.error} />
            <Button
              title="Forget saved computer"
              onPress={() => {
                void disconnect();
              }}
            />
          </View>
        )}
        {(state.kind === 'unpaired' || addingComputer) && (
          <View style={styles.fill}>
            {addingComputer && (
              <Button title="Back to computers" onPress={() => setAddingComputer(false)} />
            )}
            <Pairing
              onConnected={() => {
                void connected();
              }}
            />
          </View>
        )}
        {computer && client && catalog && !addingComputer && (
          <Workspace
            key={computer.hostId}
            client={client}
            computer={computer}
            computers={catalog.computers}
            onSelectComputer={(id) => {
              void selectComputer(id);
            }}
            onAddComputer={() => setAddingComputer(true)}
            onForgetComputer={(id) => {
              void disconnect(id);
            }}
          />
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
