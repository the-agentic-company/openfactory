export function visualizationTheme(colors: {
  canvas: string;
  surface: string;
  inset: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
}): { properties: Record<string, string>; colorScheme: 'light' | 'dark' } {
  return {
    properties: {
      '--color-canvas': colors.canvas,
      '--color-surface': colors.surface,
      '--color-inset': colors.inset,
      '--color-text': colors.text,
      '--color-muted': colors.muted,
      '--color-border': colors.border,
      '--accent': colors.accent,
    },
    colorScheme: colors.canvas === '#1d1c1a' ? 'dark' : 'light',
  };
}
