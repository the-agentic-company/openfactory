import { z } from 'zod';

export const workspaceViews = [
  'agents',
  'dashboard',
  'runs',
  'pull-requests',
  'scorers',
  'definition',
] as const;
export type WorkspaceView = (typeof workspaceViews)[number];
export { agentAppearanceSchema, type AgentAppearance } from './appearance';
export const scorerSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(100),
  project: z.string().min(1),
  agentId: z.string().nullable(),
  rule: z.discriminatedUnion('type', [
    z.object({ type: z.literal('contains'), text: z.string().trim().min(1).max(1000) }),
    z.object({ type: z.literal('excludes'), text: z.string().trim().min(1).max(1000) }),
    z.object({ type: z.literal('min_length'), length: z.number().int().min(1).max(100000) }),
  ]),
  createdAt: z.iso.datetime(),
});
export type Scorer = z.infer<typeof scorerSchema>;
export function scoreOutput(rule: Scorer['rule'], output: string) {
  switch (rule.type) {
    case 'contains':
      return output.toLowerCase().includes(rule.text.toLowerCase());
    case 'excludes':
      return !output.toLowerCase().includes(rule.text.toLowerCase());
    case 'min_length':
      return (
        Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(output))
          .length >= rule.length
      );
  }
}
