#!/usr/bin/env python3
"""Stage a verified, immutable copy of the completed production build."""
import hashlib
import os
from pathlib import Path
import shutil
import uuid

repository = Path(__file__).resolve().parent.parent
source = repository / 'apps/web/.output'
runtime_source = repository / 'packages/runtime/dist'
if not (source / 'nitro.json').is_file() or not (source / 'server/index.mjs').is_file():
    raise SystemExit('No complete production build found. Run pnpm build first.')


if not (runtime_source / 'runtime.mjs').is_file():
    raise SystemExit('No runtime build found. Run pnpm build first.')


def assert_no_build():
    for process in Path('/proc').iterdir():
        if not process.name.isdigit():
            continue
        try:
            arguments = (process / 'cmdline').read_bytes().split(b'\0')
            cwd = (process / 'cwd').resolve()
            commands = {part for arg in arguments[:2] for part in Path(arg.decode(errors='replace')).name.split()}
            building = b'build' in arguments or 'build' in commands
            if building and commands.intersection({'pnpm', 'pnpm.cjs', 'vp', 'vite-plus'}) and cwd.is_relative_to(repository):
                raise SystemExit('An OpenFactory build is in progress. Wait for it to finish and retry.')
        except (OSError, RuntimeError):
            continue


assert_no_build()


def fingerprints(directory):
    return {
        path.relative_to(directory).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in sorted(directory.rglob('*')) if path.is_file()
    }


base = Path.home() / '.local/share/openfactory'
releases = base / 'releases'
releases.mkdir(parents=True, exist_ok=True, mode=0o700)
release = releases / uuid.uuid4().hex
try:
    before = fingerprints(source)
    runtime_before = fingerprints(runtime_source)
    shutil.copytree(source, release)
    shutil.copytree(runtime_source, release / 'runtime')
    assert_no_build()
    if {key: value for key, value in fingerprints(release).items() if not key.startswith('runtime/')} != before or fingerprints(source) != before or fingerprints(runtime_source) != runtime_before or fingerprints(release / 'runtime') != runtime_before:
        raise RuntimeError('The build changed while staging. Wait for the build to finish and retry.')
except (Exception, SystemExit):
    if release.exists():
        shutil.rmtree(release)
    raise

pointer = base / f'.current-{uuid.uuid4().hex}'
pointer.symlink_to(release, target_is_directory=True)
os.replace(pointer, base / 'current')
print(f'Staged OpenFactory release {release.name}')
