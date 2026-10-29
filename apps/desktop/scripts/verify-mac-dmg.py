"""Mount each native DMG and compare its complete app bundle with the verified ZIP."""
from pathlib import Path
import json
import os
import plistlib
import stat
import subprocess
import sys
import zipfile

if sys.platform != 'darwin':
    print('DMG mounting requires macOS; run test:mac in the macOS release job.')
    sys.exit(0)

project = Path(__file__).resolve().parents[1]
version = json.loads((project / 'package.json').read_text())['version']
for arch in ['arm64', 'x64']:
    image = project / 'dist' / f'OpenFactory-{version}-{arch}.dmg'
    mounted = plistlib.loads(subprocess.check_output(['hdiutil', 'attach', '-plist', '-nobrowse', '-readonly', str(image)]))
    mount = next(Path(entity['mount-point']) for entity in mounted['system-entities'] if 'mount-point' in entity)
    try:
        assert (mount / 'Applications').is_symlink(), 'Missing drag-to-Applications link'
        assert os.readlink(mount / 'Applications') == '/Applications'
        with zipfile.ZipFile(project / 'dist' / f'OpenFactory-{version}-{arch}.zip') as archive:
            for entry in archive.infolist():
                if entry.is_dir():
                    continue
                path = mount / entry.filename
                actual = os.readlink(path).encode() if stat.S_ISLNK(entry.external_attr >> 16) else path.read_bytes()
                assert actual == archive.read(entry), f'DMG differs from verified bundle: {entry.filename}'
        print(f'{image.name}: mounted, Applications link verified, complete app matches verified ZIP.')
    finally:
        subprocess.run(['hdiutil', 'detach', str(mount)], check=True)
