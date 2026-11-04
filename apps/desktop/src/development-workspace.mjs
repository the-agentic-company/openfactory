import { randomUUID } from 'node:crypto';

export function selectDevelopmentConnection(connection, channel = process) {
  return new Promise((resolve, reject) => {
    if (!channel.send || !channel.connected) {
      reject(new Error('Start development with pnpm dev from the repository root.'));
      return;
    }
    const requestId = randomUUID();
    const cleanup = () => {
      clearTimeout(timer);
      channel.removeListener('message', selected);
      channel.removeListener('disconnect', disconnected);
    };
    const disconnected = () => {
      cleanup();
      reject(new Error('The desktop development launcher disconnected.'));
    };
    const selected = (message) => {
      if (message.type === 'selected' && message.requestId === requestId) {
        cleanup();
        resolve();
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Could not switch the development workspace connection.'));
    }, 5000);
    channel.on('message', selected);
    channel.once('disconnect', disconnected);
    channel.send({ type: 'connection', requestId, ...connection }, (error) => {
      if (error) {
        cleanup();
        reject(error);
      }
    });
  });
}

export async function connectDevelopmentWorkspace({ origin, sessionId, cookies, target }) {
  if (!origin || !sessionId) {
    throw new Error('Start development with pnpm dev from the repository root.');
  }
  const url = new URL(origin);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') {
    throw new Error('The desktop development server must use HTTP on 127.0.0.1.');
  }
  await selectDevelopmentConnection(target);
  await cookies.set({
    url: url.origin,
    name: `openfactory-desktop-${url.port}`,
    value: sessionId,
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
  });
  return {
    origin: url.origin,
    select: selectDevelopmentConnection,
    close: () => {},
  };
}
