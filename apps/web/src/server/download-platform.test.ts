import { expect, it } from 'vite-plus/test';
import {
  detectDesktopPlatform,
  desktopDownloadUrl,
  primaryDesktopBuilds,
} from '../download-builds';

it.each([
  {
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
    platform: 'MacIntel',
    expected: 'mac',
  },
  {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0',
    platform: 'Win32',
    expected: 'windows',
  },
  {
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0',
    platform: 'Linux x86_64',
    expected: 'linux',
  },
  {
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
    platform: 'iPhone',
    expected: null,
  },
  {
    userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9)',
    platform: 'Linux aarch64',
    expected: null,
  },
  {
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Safari/605.1.15',
    platform: 'MacIntel',
    maxTouchPoints: 5,
    expected: null,
  },
  {
    userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 16093.0.0)',
    platform: 'Linux x86_64',
    expected: null,
  },
  { userAgent: '', platform: '', expected: null },
])('offers the right desktop download for $platform ($expected)', ({ expected, ...device }) => {
  const platform = detectDesktopPlatform(device);
  expect(platform).toBe(expected);
  if (platform) {
    expect(desktopDownloadUrl(primaryDesktopBuilds[platform].file)).toBe(
      `/downloads/${primaryDesktopBuilds[platform].file}`,
    );
  }
});
