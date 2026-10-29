import desktop from '../../desktop/package.json';

export type DesktopPlatform = 'mac' | 'windows' | 'linux';
type DesktopBuild = {
  label: string;
  architecture: string;
  file: string;
  format: string;
  platform: DesktopPlatform;
};

export const desktopVersion = desktop.version;
export const desktopPlatforms: DesktopPlatform[] = ['mac', 'windows', 'linux'];
export const primaryDesktopBuilds = {
  mac: {
    label: 'Mac',
    architecture: 'Apple Silicon · M1 or newer',
    file: `OpenFactory-${desktopVersion}-arm64.zip`,
    format: '.zip',
    platform: 'mac',
  },
  windows: {
    label: 'Windows',
    architecture: 'x86-64 · Windows 10 or newer',
    file: `OpenFactory-${desktopVersion}-x64.exe`,
    format: '.exe',
    platform: 'windows',
  },
  linux: {
    label: 'Linux',
    architecture: 'x86-64 · Debian & Ubuntu',
    file: `OpenFactory-${desktopVersion}-amd64.deb`,
    format: '.deb',
    platform: 'linux',
  },
} satisfies Record<DesktopPlatform, DesktopBuild>;

export const desktopBuilds = [
  primaryDesktopBuilds.mac,
  primaryDesktopBuilds.linux,
  primaryDesktopBuilds.windows,
  {
    label: 'Mac',
    architecture: 'Intel · x86-64',
    file: `OpenFactory-${desktopVersion}-x64.zip`,
    format: '.zip',
    platform: 'mac',
  },
] satisfies DesktopBuild[];

export function desktopDownloadUrl(file: string) {
  const repository =
    import.meta.env.VITE_OPENFACTORY_RELEASES_REPOSITORY ??
    'the-agentic-company/openfactory-releases';
  return import.meta.env.PUBLIC_SITE
    ? `https://github.com/${repository}/releases/download/desktop-v${desktopVersion}/${file}`
    : `/downloads/${file}`;
}

export function detectDesktopPlatform({
  userAgent,
  platform,
  maxTouchPoints = 0,
}: {
  userAgent: string;
  platform: string;
  maxTouchPoints?: number;
}): DesktopPlatform | null {
  const device = `${userAgent} ${platform}`;
  if (/Android|iPhone|iPad|iPod|CrOS/i.test(device)) {
    return null;
  }
  if (/Mac/i.test(device) && maxTouchPoints > 1) {
    return null;
  }
  if (/Windows|Win32|Win64/i.test(device)) {
    return 'windows';
  }
  if (/Mac/i.test(device)) {
    return 'mac';
  }
  if (/Linux|X11/i.test(device)) {
    return 'linux';
  }
  return null;
}
