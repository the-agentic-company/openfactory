const siteOrigin =
  import.meta.env.VITE_OPENFACTORY_SITE_URL ??
  (import.meta.env.DEV ? 'http://localhost:8020' : 'https://open-factory.app');

export function siteUrl(path: string) {
  return new URL(path, siteOrigin).href;
}
