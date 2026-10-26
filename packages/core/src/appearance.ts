import { z } from 'zod';

export const iconColorNames = [
  'gray',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
] as const;
export type IconColor = (typeof iconColorNames)[number];

// Adapted from T3 Code projectIconOptions.ts. See third-party/T3-CODE-LICENSE.
export function firstEmoji(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(trimmed);
  const segment = segments[Symbol.iterator]().next().value?.segment;
  const isFlag = /^\p{Regional_Indicator}{2}$/u.test(segment ?? '');
  const isKeycap = /^[#*0-9]\uFE0F?\u20E3$/u.test(segment ?? '');
  if (!segment || (!/\p{Extended_Pictographic}/u.test(segment) && !isFlag && !isKeycap)) {
    return null;
  }
  return segment;
}

export const monogramSchema = z
  .string()
  .normalize('NFKC')
  .trim()
  .toUpperCase()
  .regex(/^[\p{L}\p{N}][\p{L}\p{N}\p{M}\u200c\u200d]*$/u)
  .refine(
    (text) =>
      Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)).length <=
      2,
    'Use one or two letters or numbers.',
  );

export const agentAppearanceSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('icon'),
    name: z
      .string()
      .trim()
      .min(1)
      .max(64)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    color: z.enum(iconColorNames).optional(),
  }),
  z.object({
    kind: z.literal('emoji'),
    value: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .refine((value) => firstEmoji(value) === value, 'Choose a single emoji.'),
  }),
  z.object({
    kind: z.literal('monogram'),
    text: monogramSchema,
    color: z.enum(iconColorNames).optional(),
  }),
]);
export type AgentAppearance = z.infer<typeof agentAppearanceSchema>;
