import { z } from 'zod';

export const connectionHealthSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('reachable'), checkedAt: z.number(), latencyMs: z.number() }),
  z.object({
    kind: z.enum(['timeout', 'unreachable', 'access-denied', 'error']),
    checkedAt: z.number(),
    detail: z.string(),
    recommendation: z.string(),
  }),
]);

export async function checkConnection(probe: () => Promise<unknown>, local: boolean) {
  const started = Date.now();
  try {
    await probe();
    return connectionHealthSchema.parse({
      kind: 'reachable',
      checkedAt: Date.now(),
      latencyMs: Date.now() - started,
    });
  } catch (error) {
    return describeConnectionFailure(error, local);
  }
}

export function describeConnectionFailure(error: unknown, local: boolean) {
  const detail = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : '';
  const diagnostic = `${detail} ${cause}`;
  const kind =
    /HTTP 403.*Factory access|RPC request completed|Manage pairing and network access/i.test(
      diagnostic,
    )
      ? 'error'
      : /timeout|timed out|aborted/i.test(diagnostic)
        ? 'timeout'
        : /401|403|unauthori|forbidden|revoked|keyring|different computer|pair again/i.test(
              diagnostic,
            )
          ? 'access-denied'
          : /fetch failed|unavailable|unreachable|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ENOENT|network|DNS/i.test(
                diagnostic,
              )
            ? 'unreachable'
            : 'error';
  return connectionHealthSchema.options[1].parse({
    kind,
    checkedAt: Date.now(),
    detail: cause ? `${detail}: ${cause}` : detail,
    recommendation:
      kind === 'error'
        ? 'The host may be running an older OpenFactory version. Update OpenFactory on that computer to the same version as this app, then restart it.'
        : kind === 'access-denied'
          ? 'Unlock your system keyring if needed. If access was revoked or the computer changed, forget it and pair again.'
          : local
            ? 'Start or restart OpenFactory on this computer.'
            : 'Wake the selected computer and open OpenFactory on it. Check that both devices are connected to Tailscale.',
  });
}

export function workspaceUnavailableMessage(error: unknown, local: boolean) {
  const failure = describeConnectionFailure(error, local);
  const computer = local ? 'this computer' : 'the selected computer';
  switch (failure.kind) {
    case 'timeout':
      return `OpenFactory did not respond on ${computer} within 15 seconds. ${failure.recommendation} Then retry the connection, or choose another computer in Settings.`;
    case 'unreachable':
      return `Cannot connect to OpenFactory on ${computer}. ${failure.recommendation} Then retry the connection, or choose another computer in Settings.`;
    case 'access-denied':
      return `Access to OpenFactory on ${computer} was denied. Open Settings to check the connection. ${failure.recommendation}`;
    default:
      return /HTTP 403.*Factory access|RPC request completed|Manage pairing and network access/i.test(
        failure.detail,
      )
        ? `Factory access failed on ${computer}. ${failure.recommendation} Open Settings for connection details.`
        : `OpenFactory could not load your factories and agents from ${computer}. Retry the connection. If it still fails, restart OpenFactory on that computer and check its connection in Settings.`;
  }
}
