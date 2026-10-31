import { expect, it } from 'vite-plus/test';
import { factoryTeamSetups, parseAgentDefinition, validateFactoryFile } from '@openfactory/core';
import {
  marketplaceExamples,
  marketplaceTypes,
  marketplaceExampleCommand,
} from '../marketplace-examples';

it('provides valid, inspectable source files for every public example and import type', () => {
  for (const { kind } of marketplaceTypes) {
    expect(marketplaceExamples.some((entry) => entry.kind === kind)).toBe(true);
  }
  const routes = new Set<string>();
  for (const entry of marketplaceExamples) {
    expect(Number.isFinite(Date.parse(entry.firstSeen))).toBe(true);
    const route = `${entry.kind}/${entry.slug}`;
    expect(routes.has(route)).toBe(false);
    routes.add(route);
    const bindings: Record<string, string> = {};
    for (const [path, source] of Object.entries(entry.files)) {
      validateFactoryFile(path, source);
      if (path.startsWith('agents/')) {
        bindings[path] = parseAgentDefinition(source).id ?? '';
      }
    }
    expect(Object.keys(bindings)).toHaveLength(entry.agentCount);
    expect(factoryTeamSetups(entry.files, bindings)).toHaveLength(entry.teamCount);
  }
});

it('shows a full GitHub URL and named selector without requiring a destination', () => {
  expect(
    marketplaceExampleCommand({
      source: 'example-labs/review-factory',
      kind: 'agent',
      name: 'reviewer',
    }),
  ).toBe('openfactory factory add https://github.com/example-labs/review-factory --agent reviewer');
  expect(
    marketplaceExampleCommand({
      source: 'example-labs/review-factory',
      kind: 'factory',
      name: 'factory',
    }),
  ).toBe('openfactory factory add https://github.com/example-labs/review-factory');
});
