import { createFileRoute } from '@tanstack/react-router';
import { runtimeRpc } from '@openfactory/runtime/client';
import { z } from 'zod';

export const Route = createFileRoute('/api/webhooks/$agentId/$token')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const reader = request.body?.getReader();
        const chunks: Uint8Array[] = [];
        let bytes = 0;
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            bytes += value.byteLength;
            if (bytes > 1_048_576) {
              await reader.cancel();
              return Response.json({ error: 'Keep webhook bodies under 1 MB.' }, { status: 413 });
            }
            chunks.push(value);
          }
        }
        try {
          const result = z
            .object({
              status: z.number(),
              error: z.string().optional(),
              runId: z.string().optional(),
              threadId: z.string().optional(),
            })
            .parse(
              await runtimeRpc('webhooks.receive', {
                id: params.agentId,
                token: params.token,
                body: Buffer.concat(chunks).toString('base64'),
                headers: Object.fromEntries(request.headers),
                requestId: request.headers.get('idempotency-key') ?? undefined,
              }),
            );
          return Response.json(result, { status: result.status });
        } catch {
          return Response.json({ error: 'Webhook unavailable.' }, { status: 503 });
        }
      },
    },
  },
});
