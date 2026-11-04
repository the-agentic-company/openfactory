import { useEffect, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { pairComputer, type SavedComputer } from '@openfactory/client';
import { saveComputer } from './storage';
import { Button, ErrorNotice, Field, Label, styles } from './ui';

export function Pairing({ onConnected }: { onConnected: (computer: SavedComputer) => void }) {
  const [origin, setOrigin] = useState('');
  const [code, setCode] = useState('');
  useEffect(() => {
    function prefill(url: string | null | undefined) {
      if (!url) {
        return;
      }
      try {
        const link = new URL(url);
        if (link.protocol === 'openfactory:' && link.hostname === 'pair') {
          setOrigin(link.searchParams.get('address') ?? link.searchParams.get('origin') ?? '');
          setCode(link.hash.slice(1) || link.searchParams.get('code') || '');
        }
      } catch {
        /* Invalid links leave the editable form available. */
      }
    }
    void Linking.getInitialURL().then(prefill);
    const subscription = Linking.addEventListener('url', ({ url }) => prefill(url));
    return () => subscription.remove();
  }, []);
  const pairing = useMutation({
    mutationFn: async () => {
      const computer = await pairComputer({ origin, code, name: 'OpenFactory mobile' });
      await saveComputer(computer);
      return computer;
    },
    onSuccess: onConnected,
  });
  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Label large>Connect your computer</Label>
      <Label muted>
        Your agents run on your computer. Pair your phone to follow their work and continue
        conversations wherever you are.
      </Label>
      <View style={styles.group}>
        <Label>
          In the desktop app, open Settings, enable network access, and create a pairing code.
        </Label>
        <Label muted>
          Keep both devices on the same trusted network or Tailscale. Use the address shown by your
          computer.
        </Label>
      </View>
      <Field
        label="Computer address"
        value={origin}
        onChangeText={setOrigin}
        placeholder="https://computer.example.ts.net:8445"
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="URL"
      />
      <Field
        label="Pairing code"
        value={code}
        onChangeText={setCode}
        placeholder="Code from your computer"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <ErrorNotice error={pairing.error} />
      <Button
        title="Pair computer"
        primary
        busy={pairing.isPending}
        disabled={!origin.trim() || !code.trim()}
        onPress={() => pairing.mutate()}
      />
    </ScrollView>
  );
}
