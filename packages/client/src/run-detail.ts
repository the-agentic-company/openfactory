import { projectRunDetail, scorerSchema } from '@openfactory/core';
import { z } from 'zod';
import type { RuntimeCall } from './history';
import { runtimeResults } from '@openfactory/protocol';

export async function readRunDetail(data: { threadId: string; runId: string }, call: RuntimeCall) {
  const [history, workspace, scores] = await Promise.all([
    call('sessions.read', { threadId: data.threadId }),
    call('workspace.snapshot', {}),
    call('factory.settings', { operation: 'read', section: 'scorers' }),
  ]);
  const { projection } = runtimeResults['sessions.read'].parse(history);
  const { snapshot } = runtimeResults['workspace.snapshot'].parse(workspace);
  return projectRunDetail(
    projection,
    data.runId,
    snapshot.projects,
    z.array(scorerSchema).parse(scores),
  );
}
