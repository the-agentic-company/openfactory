import { EventEmitter } from 'node:events';
import { expect, it, vi } from 'vite-plus/test';
import { configureWorkspaceNavigation } from '../src/workspace-navigation.mjs';

function setup() {
  const contents = Object.assign(new EventEmitter(), { setWindowOpenHandler: vi.fn() });
  const openExternal = vi.fn();
  configureWorkspaceNavigation(contents, { origin: 'http://127.0.0.1:8018', openExternal });
  return { contents, openExternal };
}

it('opens public documentation and marketplace in the browser without creating Electron windows', () => {
  const { contents, openExternal } = setup();
  const handleOpen = contents.setWindowOpenHandler.mock.calls[0][0];
  for (const url of [
    'https://open-factory.app/docs',
    'https://open-factory.app/marketplace',
    'http://localhost:8020/docs',
  ]) {
    expect(handleOpen({ url })).toEqual({ action: 'deny' });
    expect(openExternal).toHaveBeenLastCalledWith(url);
  }
});

it.each(['will-navigate', 'will-redirect'])(
  'opens external %s destinations in the browser',
  (eventName) => {
    const { contents, openExternal } = setup();
    const event = { preventDefault: vi.fn() };
    contents.emit(eventName, event, 'https://open-factory.app/marketplace/agent');
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledWith('https://open-factory.app/marketplace/agent');
  },
);

it('keeps workspace navigation inside Electron and refuses other protocols', () => {
  const { contents, openExternal } = setup();
  const local = { preventDefault: vi.fn() };
  contents.emit('will-navigate', local, 'http://127.0.0.1:8018/app/settings');
  expect(local.preventDefault).not.toHaveBeenCalled();
  const handleOpen = contents.setWindowOpenHandler.mock.calls[0][0];
  for (const url of [
    'file:///etc/passwd',
    'javascript:alert(1)',
    'openfactory://pair',
    'invalid url',
    'http://127.0.0.1:8018/app',
  ]) {
    expect(handleOpen({ url })).toEqual({ action: 'deny' });
  }
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'invalid url']) {
    const event = { preventDefault: vi.fn() };
    contents.emit('will-navigate', event, url);
    expect(event.preventDefault).toHaveBeenCalledOnce();
  }
  expect(openExternal).not.toHaveBeenCalled();
});
