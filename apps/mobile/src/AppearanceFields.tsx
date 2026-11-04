import { AppearanceGlyph } from './AppearanceGlyph';
import { useState } from 'react';
import { View } from 'react-native';
import { agentAppearanceSchema, iconColorNames, type AgentAppearance } from '@openfactory/core';
import { Button, ErrorNotice, Field, Label, styles } from './ui';
import { Choices } from './management-ui';

export function AppearanceFields({
  initial,
  onChange,
  onValidityChange,
}: {
  initial: AgentAppearance;
  onChange: (value: AgentAppearance) => void;
  onValidityChange?: (valid: boolean) => void;
}) {
  const [kind, setKind] = useState(initial.kind);
  const [text, setText] = useState(
    initial.kind === 'icon'
      ? initial.name
      : initial.kind === 'emoji'
        ? initial.value
        : initial.text,
  );
  const [color, setColor] = useState(initial.kind !== 'emoji' ? (initial.color ?? 'gray') : 'gray');
  const update = (nextKind: typeof kind, nextText: string, nextColor: typeof color) => {
    const parsed = agentAppearanceSchema.safeParse(
      nextKind === 'emoji'
        ? { kind: nextKind, value: nextText }
        : nextKind === 'monogram'
          ? { kind: nextKind, text: nextText, color: nextColor }
          : { kind: nextKind, name: nextText, color: nextColor },
    );
    onValidityChange?.(parsed.success);
    if (parsed.success) {
      onChange(parsed.data);
    }
  };
  const current = agentAppearanceSchema.safeParse(
    kind === 'emoji'
      ? { kind, value: text }
      : kind === 'monogram'
        ? { kind, text, color }
        : { kind, name: text, color },
  );
  return (
    <View style={styles.group}>
      <Label>Appearance</Label>
      <AppearanceGlyph appearance={current.success ? current.data : initial} size={36} />
      <ErrorNotice error={current.success ? null : current.error} />
      <Choices
        values={['icon', 'emoji', 'monogram']}
        value={kind}
        onChange={(value) => {
          setKind(value);
          const next = value === 'icon' ? 'bot' : value === 'emoji' ? '🤖' : 'OF';
          setText(next);
          update(value, next, color);
        }}
      />
      <Field
        label={kind === 'icon' ? 'Icon name' : kind === 'emoji' ? 'Emoji' : 'One or two initials'}
        value={text}
        onChangeText={(value) => {
          setText(value);
          update(kind, value, color);
        }}
        autoCapitalize={kind === 'monogram' ? 'characters' : 'none'}
        autoCorrect={false}
      />
      {kind === 'icon' && (
        <View style={styles.row}>
          {['bot', 'factory', 'code', 'search', 'shield-check', 'sparkles'].map((name) => (
            <Button
              key={name}
              title={name}
              primary={text === name}
              onPress={() => {
                setText(name);
                update(kind, name, color);
              }}
            />
          ))}
        </View>
      )}
      {kind !== 'emoji' && (
        <View style={styles.row}>
          {iconColorNames.map((value) => (
            <Button
              key={value}
              title={value}
              primary={color === value}
              onPress={() => {
                setColor(value);
                update(kind, text, value);
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}
