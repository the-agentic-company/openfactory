export async function watchHostChanges(target, { signal, onChange, onStatus }) {
  while (!signal.aborted) {
    try {
      const response = await fetch(`${target.origin}/v1/events`, {
        headers: { authorization: `Bearer ${target.token}` },
        redirect: 'error',
        signal,
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          onStatus({ status: 'revoked', message: 'Access was revoked. Pair this computer again.' });
          return;
        }
        throw new Error(`The host rejected live updates (${response.status}).`);
      }
      if (!response.headers.get('content-type')?.startsWith('text/event-stream')) {
        throw new Error('The host does not support live updates.');
      }
      onStatus({ status: 'connected' });
      const decoder = new TextDecoder();
      let pending = '';
      for await (const chunk of response.body) {
        pending += decoder.decode(chunk, { stream: true }).replaceAll('\r\n', '\n');
        let end;
        while ((end = pending.indexOf('\n\n')) !== -1) {
          const event = pending.slice(0, end);
          pending = pending.slice(end + 2);
          if (event.includes('event: revoked')) {
            onStatus({
              status: 'revoked',
              message: 'Access was revoked. Pair this computer again.',
            });
            return;
          }
          if (event.split('\n').some((line) => line.startsWith('data:'))) {
            onChange();
          }
        }
      }
      throw new Error('Connection lost. Showing saved data while reconnecting.');
    } catch (error) {
      if (signal.aborted) {
        return;
      }
      onStatus({ status: 'offline', message: error.message });
    }
    await new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', done);
        resolve();
      };
      const timer = setTimeout(done, 2000);
      signal.addEventListener('abort', done, { once: true });
      if (signal.aborted) {
        done();
      }
    });
  }
}
