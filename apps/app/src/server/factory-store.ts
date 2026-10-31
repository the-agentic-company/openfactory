import { agentAppearanceSchema, scorerSchema, type AgentAppearance } from '@openfactory/core';
import { factoryProfileSchema, type FactoryProfile } from '../factory-profile';
import { z } from 'zod';
import { runtimeRpc } from './runtime-rpc';

export async function readAppearances(ids: string[]) {
  if (!ids.length) {
    return {};
  }
  return z
    .record(z.string(), agentAppearanceSchema)
    .parse(
      await runtimeRpc('factory.settings', { operation: 'read', section: 'appearances', ids }),
    );
}
export async function writeAppearance(id: string, appearance: AgentAppearance) {
  await runtimeRpc('factory.settings', {
    operation: 'write',
    section: 'appearances',
    id,
    value: agentAppearanceSchema.parse(appearance),
  });
}
export async function readFactoryProfiles(ids: string[]) {
  if (!ids.length) {
    return {};
  }
  return z
    .record(z.string(), factoryProfileSchema)
    .parse(await runtimeRpc('factory.settings', { operation: 'read', section: 'factories', ids }));
}
export async function writeFactoryProfile(id: string, profile: FactoryProfile) {
  await runtimeRpc('factory.settings', {
    operation: 'write',
    section: 'factories',
    id,
    value: factoryProfileSchema.parse(profile),
  });
}
export async function readScorers() {
  return z
    .array(scorerSchema)
    .parse(await runtimeRpc('factory.settings', { operation: 'read', section: 'scorers' }));
}
export async function writeScorer(scorer: unknown) {
  const value = scorerSchema.parse(scorer);
  await runtimeRpc('factory.settings', {
    operation: 'write',
    section: 'scorers',
    id: value.id,
    value,
  });
}
export async function removeScorer(id: string) {
  await runtimeRpc('factory.settings', { operation: 'remove', section: 'scorers', id });
}
