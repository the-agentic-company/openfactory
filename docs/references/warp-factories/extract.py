#!/usr/bin/env python3
"""Re-extract the curated video frames. Requires Python 3 and ffmpeg."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("video", type=Path, help="Local copy of the source video")
    args = parser.parse_args()
    video = args.video.resolve(strict=True)
    root = Path(__file__).resolve().parent
    manifest = json.loads((root / "manifest.json").read_text())

    def extract(screen):
        output = root / screen["image"]
        output.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error",
                "-threads", "2", "-ss", str(screen["seconds"]),
                "-i", str(video), "-frames:v", "1", "-threads", "1",
                "-y", str(output),
            ],
            check=True,
        )
        return output.name

    with ThreadPoolExecutor(max_workers=4) as pool:
        for name in pool.map(extract, manifest["screens"]):
            print(name)


if __name__ == "__main__":
    main()
