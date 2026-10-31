const siteOrigin = import.meta.env.VITE_OPENFACTORY_SITE_URL ?? 'https://open-factory.app';

export function siteUrl(path: string) {
  return new URL(path, siteOrigin).href;
}
