const { build } = require('../package.json');

for (const name of [
  'CSC_LINK',
  'CSC_KEY_PASSWORD',
  'APPLE_API_KEY',
  'APPLE_API_KEY_ID',
  'APPLE_API_ISSUER',
]) {
  if (!process.env[name]?.trim()) {
    throw new Error(`Mac release signing requires ${name}. Configure the GitHub Actions secret.`);
  }
}

const { identity: _identity, ...mac } = build.mac;
module.exports = {
  ...build,
  forceCodeSigning: true,
  mac: {
    ...mac,
    type: 'distribution',
    hardenedRuntime: true,
    notarize: true,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
  },
  dmg: { sign: true },
};
