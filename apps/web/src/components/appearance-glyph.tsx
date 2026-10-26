import type { AgentAppearance } from '@openfactory/core';
import { Bot } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { projectIconColorClassName } from '../icon-colors';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const LucideGlyph = lazy(() =>
  import('./icon-library').then((module) => ({ default: module.LucideGlyph })),
);

export function AppearanceGlyph({
  appearance,
  size = 24,
}: {
  appearance?: AgentAppearance;
  size?: number;
}) {
  if (!appearance) {
    return <Bot size={size} strokeWidth={1.7} />;
  }
  if (appearance.kind === 'emoji') {
    return (
      <span aria-hidden="true" className="appearance-emoji" style={{ fontSize: size }}>
        {appearance.value}
      </span>
    );
  }
  const colorClass = projectIconColorClassName(appearance.color ?? 'gray');
  if (appearance.kind === 'monogram') {
    const count = Array.from(segmenter.segment(appearance.text)).length;
    return (
      <svg
        aria-hidden="true"
        width={size}
        height={size}
        viewBox="0 0 16 16"
        className={`appearance-monogram ${colorClass}`}
      >
        <text
          x="8"
          y="10.8"
          textAnchor="middle"
          fill="currentColor"
          fontSize="8.25"
          fontWeight="700"
          textLength={count === 1 ? 6 : 12}
          lengthAdjust="spacingAndGlyphs"
        >
          {appearance.text}
        </text>
      </svg>
    );
  }
  return (
    <span aria-hidden="true" className={`appearance-icon ${colorClass}`}>
      <Suspense fallback={<Bot size={size} />}>
        <LucideGlyph name={appearance.name} size={size} />
      </Suspense>
    </span>
  );
}
