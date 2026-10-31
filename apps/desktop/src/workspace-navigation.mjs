export function configureWorkspaceNavigation(contents, { origin, openExternal }) {
  function openInBrowser(url) {
    if (!URL.canParse(url)) {
      return;
    }
    const target = new URL(url);
    if (target.origin !== origin && ['https:', 'http:'].includes(target.protocol)) {
      openExternal(url);
    }
  }
  contents.setWindowOpenHandler(({ url }) => {
    openInBrowser(url);
    return { action: 'deny' };
  });
  for (const eventName of ['will-navigate', 'will-redirect']) {
    contents.on(eventName, (event, url) => {
      if (!URL.canParse(url) || new URL(url).origin !== origin) {
        event.preventDefault();
        openInBrowser(url);
      }
    });
  }
}
