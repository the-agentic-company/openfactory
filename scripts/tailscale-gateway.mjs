import http from 'node:http';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

export function createGateway({ origin, tlsPort = 8444 }) {
  const destination = new URL(origin);
  if (destination.protocol !== 'https:' || !destination.hostname.endsWith('.ts.net')) {
    throw new Error('OPENFACTORY_PUBLIC_URL must be a Tailscale HTTPS URL');
  }
  const redirects = http.createServer((request, response) => {
    // Use our configured origin, never the untrusted Host or absolute request URL.
    const path = request.url?.startsWith('/') ? request.url : '/';
    response.writeHead(308, {
      Location: `${destination.origin}${path}`,
      'Content-Length': '0',
      Connection: 'close',
    });
    response.end();
  });
  return net.createServer((client) => {
    client.on('error', () => client.destroy());
    client.setTimeout(10000, () => client.destroy());
    client.once('data', (first) => {
      client.pause();
      if (first[0] !== 0x16) {
        client.unshift(first);
        redirects.emit('connection', client);
        client.resume();
        return;
      }
      const upstream = net.connect({ host: destination.hostname, port: tlsPort });
      upstream.setTimeout(10000, () => upstream.destroy());
      upstream.on('error', () => client.destroy());
      upstream.on('close', () => client.destroy());
      client.on('close', () => upstream.destroy());
      upstream.once('connect', () => {
        client.setTimeout(0);
        upstream.setTimeout(0);
        upstream.write(first);
        client.pipe(upstream).pipe(client);
        client.resume();
      });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const gateway = createGateway({ origin: process.env.OPENFACTORY_PUBLIC_URL });
  gateway.listen(8020, '127.0.0.1');
}
