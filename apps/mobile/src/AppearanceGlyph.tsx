import { createElement } from 'react';
import { Text } from 'react-native';
import { Bot } from 'lucide-react-native';
import * as icons from 'lucide-react-native/icons';
import type { AgentAppearance, IconColor } from '@openfactory/core';
import { useTheme } from './ui';

const glyphs = new Map(
  Object.entries(icons).map(([name, component]) => [
    name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase(),
    component,
  ]),
);
const colors: Record<IconColor, string> = {
  gray: '#9ca3af',
  red: '#f87171',
  orange: '#fb923c',
  amber: '#fbbf24',
  yellow: '#facc15',
  lime: '#a3e635',
  green: '#4ade80',
  emerald: '#34d399',
  teal: '#2dd4bf',
  cyan: '#22d3ee',
  sky: '#38bdf8',
  blue: '#60a5fa',
  indigo: '#818cf8',
  violet: '#a78bfa',
  purple: '#c084fc',
  fuchsia: '#e879f9',
  pink: '#f472b6',
  rose: '#fb7185',
};
export function AppearanceGlyph({
  appearance,
  size = 26,
}: {
  appearance?: AgentAppearance;
  size?: number;
}) {
  const theme = useTheme();
  if (appearance?.kind === 'emoji') {
    return (
      <Text accessibilityElementsHidden style={{ fontSize: size }}>
        {appearance.value}
      </Text>
    );
  }
  const color = appearance?.color ? colors[appearance.color] : theme.muted;
  if (appearance?.kind === 'monogram') {
    return (
      <Text accessibilityElementsHidden style={{ color, fontSize: size * 0.7, fontWeight: '700' }}>
        {appearance.text}
      </Text>
    );
  }
  const Icon = appearance ? (glyphs.get(appearance.name) ?? Bot) : Bot;
  return createElement(Icon, { size, color, strokeWidth: 1.7, accessibilityElementsHidden: true });
}
