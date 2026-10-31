const safeSegment = /^[a-zA-Z0-9_-]+$/;

export function routeReference(id: string) {
  if (safeSegment.test(id)) {
    return id;
  }
  const migrated =
    /^thread:project:[^:]+:([^:]+)$/.exec(id)?.[1] ??
    /^run:thread:.+:ordinal:([0-9]+)$/.exec(id)?.[1];
  if (migrated && safeSegment.test(migrated)) {
    return migrated;
  }
  throw new Error('Unsupported run or conversation identifier.');
}

export function runPathParams(run: { project: string; threadId: string; id: string }) {
  return {
    project: run.project,
    thread: routeReference(run.threadId),
    runId: routeReference(run.id),
  };
}
