#!/usr/bin/env python3
"""Expose OpenFactory on port 8018 with HTTP redirects and private HTTPS."""
import json
import http.client
from pathlib import Path
import shutil
import subprocess
import time


def tailscale(*arguments):
    return subprocess.check_output(['tailscale', *arguments], text=True)


status = json.loads(tailscale('status', '--json'))
if status.get('BackendState') != 'Running':
    raise SystemExit('Connect this computer to Tailscale before configuring OpenFactory.')
hostname = status['Self']['DNSName'].rstrip('.')
if not hostname.endswith('.ts.net'):
    raise SystemExit('Tailscale did not provide a .ts.net hostname for this computer.')
configuration = json.loads(tailscale('serve', 'status', '--json'))
listener = configuration.get('TCP', {}).get('8018', {})
dashboard = {'/': {'Proxy': 'http://127.0.0.1:8019'}}
handlers = configuration.get('Web', {})
if listener and not (
    listener.get('TCPForward') in ('127.0.0.1:8019', '127.0.0.1:8020')
    or (listener == {'HTTPS': True}
        and handlers.get(f'{hostname}:8018', {}).get('Handlers') == dashboard)
):
    raise SystemExit('Port 8018 serves another service; leave it unchanged.')
tls_listener = configuration.get('TCP', {}).get('8444', {})
if tls_listener and not (
    tls_listener == {'HTTPS': True}
    and handlers.get(f'{hostname}:8444', {}).get('Handlers') == dashboard
):
    raise SystemExit('Port 8444 serves another service; leave it unchanged.')

origin = f'https://{hostname}:8018'
settings = Path.home() / '.config/openfactory/service.env'
settings.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
lines = settings.read_text().splitlines() if settings.exists() else []
lines = [line for line in lines if not line.startswith('OPENFACTORY_PUBLIC_URL=')]
lines.append(f'OPENFACTORY_PUBLIC_URL={origin}')
settings.write_text('\n'.join(lines) + '\n')
settings.chmod(0o600)

repository = Path(__file__).resolve().parent.parent
units = Path.home() / '.config/systemd/user'
units.mkdir(parents=True, exist_ok=True)
unit = 'openfactory-tailscale-gateway.service'
shutil.copyfile(repository / 'deployment/systemd' / unit, units / unit)
subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
subprocess.run(['systemctl', '--user', 'enable', '--now', unit], check=True)
subprocess.run(['systemctl', '--user', 'restart', unit], check=True)
for attempt in range(50):
    connection = http.client.HTTPConnection('127.0.0.1', 8020, timeout=1)
    try:
        connection.request('HEAD', '/')
        response = connection.getresponse()
        if response.status != 308 or response.getheader('Location') != origin + '/':
            raise SystemExit('Port 8020 did not return the expected OpenFactory HTTPS redirect.')
        break
    except (OSError, http.client.HTTPException):
        if attempt == 49:
            raise SystemExit(f'The gateway did not start; inspect systemctl --user status {unit}.')
        time.sleep(0.1)
    finally:
        connection.close()

# Keep certificate issuance and TLS termination in Tailscale. The gateway sends
# TLS here unchanged, and redirects plaintext HTTP to the canonical HTTPS URL.
print(tailscale('serve', '--bg', '--yes', '--https=8444', 'http://127.0.0.1:8019'), end='')
if listener.get('HTTPS'):
    tailscale('serve', '--https=8018', 'off')
print(tailscale('serve', '--bg', '--yes', '--tcp=8018', 'tcp://127.0.0.1:8020'), end='')
print(f'OpenFactory URL: {origin}/')
print('HTTP on port 8018 redirects to the same HTTPS URL, including paths and queries.')
