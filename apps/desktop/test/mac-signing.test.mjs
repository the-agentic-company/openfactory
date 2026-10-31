import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

const require = createRequire(import.meta.url);
const configPath = require.resolve('../build/mac-release.cjs');
const builderRequire = createRequire(require.resolve('electron-builder'));
const { getConfig, validateConfiguration } = builderRequire(
  'app-builder-lib/out/util/config/config.js',
);
const credentials = {
  CSC_LINK: 'test-certificate.p12',
  CSC_KEY_PASSWORD: 'test-password',
  APPLE_API_KEY: '/tmp/test-notary.p8',
  APPLE_API_KEY_ID: 'TESTKEY',
  APPLE_API_ISSUER: 'test-issuer',
};

afterEach(() => {
  vi.unstubAllEnvs();
  delete require.cache[configPath];
});

describe('Mac release signing', () => {
  it.each(Object.keys(credentials))('rejects a release missing %s before packaging', (missing) => {
    for (const [name, value] of Object.entries(credentials)) {
      vi.stubEnv(name, name === missing ? '' : value);
    }
    expect(() => require(configPath)).toThrow(`Mac release signing requires ${missing}`);
  });

  it('loads a valid electron-builder config requiring Developer ID signing and notarization', async () => {
    for (const [name, value] of Object.entries(credentials)) {
      vi.stubEnv(name, value);
    }
    const config = await getConfig(fileURLToPath(new URL('..', import.meta.url)), configPath);
    await validateConfiguration(config, { isEnabled: false });
    expect(config.forceCodeSigning).toBe(true);
    expect(config.mac.identity).toBeUndefined();
    expect(config.mac.type).toBe('distribution');
    expect(config.mac.hardenedRuntime).toBe(true);
    expect(config.mac.notarize).toBe(true);
    expect(config.dmg.sign).toBe(true);
    expect(config.mac.entitlements).toBe('build/entitlements.mac.plist');
  });
});
