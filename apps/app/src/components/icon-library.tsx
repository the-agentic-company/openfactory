import * as Lucide from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { createElement } from 'react';

const components = new Map<unknown, LucideIcon>(
  Object.values(Lucide.icons).map((icon) => [icon, icon]),
);
const byName = new Map<string, LucideIcon>();
for (const [name, exported] of Object.entries(Lucide)) {
  const component = components.get(exported);
  if (component) {
    byName.set(name, component);
  }
}
export const lucideIconNames = Object.keys(Lucide.icons).map((name) =>
  (name.match(/[A-Z][a-z]*|[0-9]+[a-z]*/g) ?? []).join('-').toLowerCase(),
);

export function LucideGlyph({ name, size = 20 }: { name: string; size?: number }) {
  const pascalName = name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return createElement(byName.get(pascalName) ?? Lucide.Folder, { size, strokeWidth: 1.7 });
}
