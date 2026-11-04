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
    const detail = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : '';
    const diagnostic = `${detail} ${cause}`;
    const kind = /timeout|timed out|aborted/i.test(diagnostic)
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
    return connectionHealthSchema.parse({
      kind,
      checkedAt: Date.now(),
      detail: cause ? `${detail}: ${cause}` : detail,
      recommendation:
        kind === 'access-denied'
          ? 'Unlock your system keyring if needed. If access was revoked or the computer changed, forget it and pair again.'
          : local
            ? 'Start or restart the OpenFactory host on this computer, then check again.'
            : 'Wake this computer and open OpenFactory on it. Check that both devices are connected to Tailscale, then check again.',
    });
  }
}
