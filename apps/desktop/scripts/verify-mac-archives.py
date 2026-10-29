"""Check cross-built Mac bundles without claiming a macOS launch test."""

from pathlib import Path
import json
import hashlib
import plistlib
import stat
import struct
import zipfile


project = Path(__file__).resolve().parents[1]
version = json.loads((project / "package.json").read_text())["version"]
manifest = json.loads((project / "dist" / f"OpenFactory-{version}-build-manifest.json").read_text())
for arch, cpu in [("arm64", 0x0100000C), ("x64", 0x01000007)]:
    archive_path = project / "dist" / f"OpenFactory-{version}-{arch}.zip"
    with zipfile.ZipFile(archive_path) as archive:
        assert archive.testzip() is None, f"Corrupted ZIP: {archive_path}"
        roots = {name.split("/")[0] for name in archive.namelist()}
        assert roots == {"OpenFactory.app"}, roots
        contents = "OpenFactory.app/Contents/"
        info = plistlib.loads(archive.read(contents + "Info.plist"))
        assert info["CFBundleIdentifier"] == "dev.openfactory.desktop.prototype"
        assert info["CFBundleDisplayName"] == "OpenFactory"
        binary = archive.read(contents + "MacOS/" + info["CFBundleExecutable"])
        assert binary[:4] == b"\xcf\xfa\xed\xfe", "Expected a 64-bit Mach-O executable"
        assert struct.unpack_from("<I", binary, 4)[0] == cpu, f"Wrong architecture: {arch}"
        icon = archive.read(contents + "Resources/" + info["CFBundleIconFile"])
        assert icon[:4] == b"icns", "Missing Mac icon"
        assert icon[16:] == (project / "build/mac-icon-white.png").read_bytes(), "Stale Mac icon"
        resources = contents + "Resources/app/"
        for source, expected_digest in manifest["files"].items():
            packaged = archive.read(resources + source)
            if source in manifest.get("packageMetadata", {}):
                expected = dict(manifest["packageMetadata"][source])
                actual = json.loads(packaged)
                # electron-builder removes npm discovery metadata from dependency manifests.
                for key in ("keywords", "bugs"):
                    expected.pop(key, None)
                    actual.pop(key, None)
                assert actual == expected, f"Changed dependency manifest in {arch}: {source}"
            else:
                assert hashlib.sha256(packaged).hexdigest() == expected_digest, f"Stale source in {arch}: {source}"
        assert resources + "node_modules/zod/package.json" in archive.namelist()
        assert resources + "node_modules/qrcode/package.json" in archive.namelist()
        assert any(stat.S_ISLNK(entry.external_attr >> 16) for entry in archive.infolist()), "Framework symlinks were lost"
        print(f"{archive_path.name}: ZIP integrity, {arch} Mach-O, bundle identity, icon, current sources, dependencies, and framework links verified (macOS {info['LSMinimumSystemVersion']}+).")
