import json
import http.client
from pathlib import Path
import runpy
import subprocess
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).with_name('configure-tailscale.py')
HOST = 'computer.test.ts.net'
DASHBOARD = {'Handlers': {'/': {'Proxy': 'http://127.0.0.1:8019'}}}


class ConfigureTailscaleTest(unittest.TestCase):
    def configure(self, home, configuration, starting=False):
        def execute(command, **kwargs):
            if command == ['tailscale', 'status', '--json']:
                return json.dumps({'BackendState': 'Running', 'Self': {'DNSName': HOST + '.'}})
            if command == ['tailscale', 'serve', 'status', '--json']:
                return json.dumps(configuration)
            return ''

        with patch.object(Path, 'home', return_value=home), \
             patch.object(subprocess, 'check_output', side_effect=execute) as commands, \
             patch.object(subprocess, 'run') as services, \
             patch.object(http.client, 'HTTPConnection') as health, \
             patch('time.sleep'), \
             patch('builtins.print'):
            if starting:
                health.return_value.request.side_effect = [ConnectionRefusedError(), None]
            response = health.return_value.getresponse.return_value
            response.status = 308
            response.getheader.return_value = f'https://{HOST}:8018/'
            runpy.run_path(str(SCRIPT), run_name='__main__')
        return [call.args[0] for call in commands.call_args_list], services, health

    def test_migration_and_repeat_setup_preserve_settings(self):
        with tempfile.TemporaryDirectory() as directory:
            home = Path(directory)
            settings = home / '.config/openfactory/service.env'
            settings.parent.mkdir(parents=True)
            settings.write_text('KEEP_SETTING=value\nOPENFACTORY_PUBLIC_URL=http://old:8018\n')
            commands, services, health = self.configure(home, {
                'TCP': {'8018': {'HTTPS': True}},
                'Web': {HOST + ':8018': DASHBOARD},
            }, starting=True)
            self.assertEqual(health.return_value.request.call_count, 2)
            self.assertIn(['tailscale', 'serve', '--https=8018', 'off'], commands)
            self.assertIn(['tailscale', 'serve', '--bg', '--yes', '--tcp=8018', 'tcp://127.0.0.1:8020'], commands)
            self.assertIn(['systemctl', '--user', 'enable', '--now', 'openfactory-tailscale-gateway.service'],
                          [call.args[0] for call in services.call_args_list])
            expected = f'KEEP_SETTING=value\nOPENFACTORY_PUBLIC_URL=https://{HOST}:8018\n'
            self.assertEqual(settings.read_text(), expected)
            self.assertEqual(settings.stat().st_mode & 0o777, 0o600)
            commands, _, _ = self.configure(home, {
                'TCP': {'8018': {'TCPForward': '127.0.0.1:8020'}, '8444': {'HTTPS': True}},
                'Web': {HOST + ':8444': DASHBOARD},
            })
            self.assertFalse(any('off' in command for command in commands))
            self.assertEqual(settings.read_text(), expected)

    def test_refuses_to_replace_other_services_before_mutating_anything(self):
        for port in ('8018', '8444'):
            with self.subTest(port=port), tempfile.TemporaryDirectory() as directory:
                home = Path(directory)
                with self.assertRaisesRegex(SystemExit, 'another service'):
                    self.configure(home, {'TCP': {port: {'TCPForward': '127.0.0.1:9999'}}})
                self.assertEqual(list(home.iterdir()), [])


if __name__ == '__main__':
    unittest.main()
