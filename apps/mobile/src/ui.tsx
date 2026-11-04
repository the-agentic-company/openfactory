import { createContext, useContext, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
  type TextInputProps,
} from 'react-native';

const light = {
  canvas: '#faf9f7',
  surface: '#ffffff',
  inset: '#f4f2ef',
  border: '#dedad4',
  text: '#292622',
  muted: '#6f6860',
  accent: '#963e32',
  accentSoft: '#f8e7e3',
  danger: '#b53737',
};
const dark: typeof light = {
  canvas: '#1d1c1a',
  surface: '#252421',
  inset: '#302e2a',
  border: '#48443f',
  text: '#f2eee8',
  muted: '#b7afa5',
  accent: '#f1a393',
  accentSoft: '#4a2c27',
  danger: '#ffaba9',
};
const ThemeContext = createContext(light);
export function Theme({ children }: { children: ReactNode }) {
  const colors = useColorScheme() === 'dark' ? dark : light;
  return <ThemeContext.Provider value={colors}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
export function Label({
  children,
  muted = false,
  large = false,
}: {
  children: ReactNode;
  muted?: boolean;
  large?: boolean;
}) {
  const colors = useTheme();
  return (
    <Text
      style={[styles.text, { color: muted ? colors.muted : colors.text }, large && styles.heading]}
    >
      {children}
    </Text>
  );
}
export function Button({
  title,
  onPress,
  disabled = false,
  primary = false,
  busy = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  busy?: boolean;
}) {
  const colors = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: primary ? colors.accentSoft : colors.inset,
          opacity: disabled || busy ? 0.5 : pressed ? 0.7 : 1,
        },
      ]}
    >
      {busy && <ActivityIndicator color={colors.accent} />}
      <Text style={[styles.buttonText, { color: primary ? colors.accent : colors.text }]}>
        {title}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const colors = useTheme();
  return (
    <View style={styles.group}>
      <Label>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...props}
        style={[
          styles.input,
          { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border },
          props.style,
        ]}
      />
    </View>
  );
}
export function ErrorNotice({ error }: { error: unknown }) {
  const colors = useTheme();
  if (!error) {
    return null;
  }
  return (
    <Text accessibilityRole="alert" style={[styles.text, { color: colors.danger }]}>
      {error instanceof Error
        ? error.message
        : typeof error === 'string'
          ? error
          : 'Something went wrong. Try again.'}
    </Text>
  );
}
export const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 20, gap: 20, width: '100%', maxWidth: 760, alignSelf: 'center' },
  group: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  heading: { fontSize: 28, fontWeight: '600', lineHeight: 34 },
  text: { fontSize: 16, lineHeight: 24, flexShrink: 1 },
  button: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  buttonText: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  input: {
    minHeight: 50,
    fontSize: 16,
    lineHeight: 24,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
});
