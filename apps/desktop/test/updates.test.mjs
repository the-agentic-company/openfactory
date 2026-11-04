import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vite-plus/test';
import { createDesktopUpdates } from '../src/updates.mjs';

function setup(options = {}) {
  const updater = Object.assign(new EventEmitter(), {
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn(async () => updater.emit('update-available', { version: '0.1.3' })),
    downloadUpdate: vi.fn(async () => {
      updater.emit('download-progress', { percent: 42 });
      updater.emit('update-downloaded', { version: '0.1.3', downloadedFile: '/tmp/update.zip' });
    }),
    quitAndInstall: vi.fn(),
  });
  const updates = createDesktopUpdates({ updater, version: '0.1.2', enabled: true, ...options });
  return { updates, updater };
}

describe('desktop updates', () => {
  it('requires an explicit download and explicit restart, reports progress, and never installs on ordinary quit', async () => {
    const { updates, updater } = setup();
    const states = [];
    const unsubscribe = updates.subscribe((state) => states.push(state));
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.allowDowngrade).toBe(false);
    expect((await updates.check()).status).toBe('available');
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    expect((await updates.download()).status).toBe('downloaded');
    expect(states).toContainEqual(expect.objectContaining({ status: 'downloading', percent: 42 }));
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    await updates.check();
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(1);
    await updates.install();
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
    unsubscribe();
    updates.dispose();
    expect(updater.listenerCount('update-downloaded')).toBe(0);
  });
  it('retries failed downloads and keeps downloaded updates available after installation failure', async () => {
    const { updates, updater } = setup();
    await updates.check();
    updater.downloadUpdate.mockRejectedValueOnce(new Error('Offline. Try again.'));
    expect(await updates.download()).toMatchObject({
      status: 'available',
      message: 'Offline. Try again.',
    });
    await updates.download();
    updater.quitAndInstall.mockImplementationOnce(() => {
      throw new Error('Installer unavailable');
    });
    expect(await updates.install()).toMatchObject({
      status: 'downloaded',
      message: 'Installer unavailable',
    });
    await updates.install();
    expect(updater.quitAndInstall).toHaveBeenCalledTimes(2);
    updates.dispose();
  });
  it('handles offline checks and ignores concurrent requests', async () => {
    const { updates, updater } = setup();
    updater.checkForUpdates.mockRejectedValueOnce(new Error('Offline'));
    expect(await updates.check()).toMatchObject({ status: 'error', message: 'Offline' });
    await Promise.all([updates.check(), updates.check(), updates.download()]);
    expect(updater.checkForUpdates).toHaveBeenCalledTimes(2);
    expect(updater.downloadUpdate).not.toHaveBeenCalled();
    updates.dispose();
  });
  it('opens the verified download on unsigned Macs without attempting native installation', async () => {
    const openInstaller = vi.fn(async () => '');
    const { updates, updater } = setup({ openInstaller });
    await updates.check();
    await updates.download();
    expect(await updates.install()).toMatchObject({ status: 'downloaded', installation: 'manual' });
    expect(openInstaller).toHaveBeenCalledWith('/tmp/update.zip');
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    updates.dispose();
  });
  it('does not check or install updates in unsupported development builds', async () => {
    const { updates, updater } = setup({ enabled: false });
    await updates.check();
    await updates.download();
    await updates.install();
    expect(updates.getState().status).toBe('disabled');
    expect(updater.checkForUpdates).not.toHaveBeenCalled();
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
    updates.dispose();
  });
});
