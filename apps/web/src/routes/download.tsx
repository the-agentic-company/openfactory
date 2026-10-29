import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowUpRight } from 'lucide-react';
import { createServerFn } from '@tanstack/react-start';
import { getRequestUrl } from '@tanstack/react-start/server';
import { TerminalInstall } from '../components/terminal-install';
import {
  desktopBuilds,
  desktopDownloadUrl,
  desktopPlatforms,
  desktopReleasesUrl,
  desktopReleaseUrl,
  desktopVersion,
  primaryDesktopBuilds,
} from '../download-builds';
import { MarketingFooter, MarketingHeader } from '../components/desktop-download';
import { PlatformIcon } from '../components/platform-icon';
import '../landing.css';
import '../download.css';

const installerOrigin = createServerFn({ method: 'GET' }).handler(() => getRequestUrl().origin);

export const Route = createFileRoute('/download')({
  loader: () => installerOrigin(),
  head: () => ({
    meta: [
      { title: 'Download OpenFactory — Mac, Windows & Linux' },
      {
        name: 'description',
        content:
          'Download OpenFactory for Mac, Windows, or Linux. Choose your installer and start running coding agents on your own computers.',
      },
    ],
  }),
  component: DownloadPage,
});

const platformCopy = {
  mac: {
    name: 'macOS',
    architecture: 'Apple Silicon (arm64)',
    note: 'Requires macOS 13 or newer.',
  },
  windows: { name: 'Windows', architecture: 'Windows 10, 11', note: '64-bit (x86-64).' },
  linux: { name: 'Linux', architecture: 'Debian, Ubuntu', note: '64-bit (x86-64).' },
};

function DownloadPage() {
  const origin = Route.useLoaderData();
  return (
    <div className="landing download-page">
      <MarketingHeader />
      <main>
        <header className="download-page-heading">
          <div className="download-heading-inner">
            <img src="/openfactory.png" width={64} height={64} alt="" />
            <h1>Download OpenFactory</h1>
          </div>
          <span className="download-channel">Desktop preview</span>
          <a className="download-version" href={desktopReleaseUrl}>
            v{desktopVersion} <ArrowUpRight size={13} />
          </a>
        </header>
        <div className="download-platform-list">
          {desktopPlatforms.map((platform) => {
            const build = primaryDesktopBuilds[platform];
            const copy = platformCopy[platform];
            return (
              <section
                className="download-platform-section"
                id={platform}
                key={platform}
                aria-labelledby={`download-${platform}`}
              >
                <h2 id={`download-${platform}`}>
                  <PlatformIcon platform={platform} size={19} />
                  {copy.name}
                </h2>
                <div className="download-cards">
                  <a
                    className="download-installer"
                    href={desktopDownloadUrl(build.file)}
                    download={!import.meta.env.PUBLIC_SITE}
                    aria-label={`Download OpenFactory for ${copy.name}, ${copy.architecture}, ${build.format}`}
                  >
                    <img src="/openfactory.png" width={28} height={28} alt="" />
                    <span className="download-installer-text">
                      <strong>{copy.architecture}</strong>
                      <span>{build.format}</span>
                    </span>
                  </a>
                  {platform === 'linux' &&
                    desktopBuilds
                      .filter(
                        (alternative) =>
                          alternative.platform === 'linux' && alternative.file !== build.file,
                      )
                      .map((alternative) => (
                        <a
                          className="download-installer"
                          href={desktopDownloadUrl(alternative.file)}
                          download={!import.meta.env.PUBLIC_SITE}
                          key={alternative.file}
                          aria-label={`Download OpenFactory for Linux, x86-64, ${alternative.format}`}
                        >
                          <img src="/openfactory.png" width={28} height={28} alt="" />
                          <span className="download-installer-text">
                            <strong>Linux x86-64</strong>
                            <span>{alternative.format}</span>
                          </span>
                        </a>
                      ))}
                </div>
                {platform === 'mac' && (
                  <p className="download-platform-note">
                    On an Intel Mac?{' '}
                    {desktopBuilds
                      .filter(
                        (alternative) =>
                          alternative.platform === 'mac' && alternative.file !== build.file,
                      )
                      .map((alternative) => (
                        <a
                          key={alternative.file}
                          href={desktopDownloadUrl(alternative.file)}
                          download={!import.meta.env.PUBLIC_SITE}
                        >
                          Download the x64 build
                        </a>
                      ))}
                    .
                  </p>
                )}
                <p className="download-platform-note">
                  {copy.note}{' '}
                  {platform === 'mac' &&
                    'Unsigned preview: approve in System Settings → Privacy & Security if prompted.'}
                  {platform === 'linux' &&
                    'For AppImage, mark the downloaded file as executable before opening it.'}
                  {platform === 'windows' &&
                    'Unsigned preview: Windows SmartScreen may ask you to approve the installer.'}
                </p>
              </section>
            );
          })}
          <TerminalInstall origin={origin} />
          <p className="download-releases">
            All builds are on the{' '}
            <a href={desktopReleasesUrl}>
              GitHub releases page <ArrowUpRight size={13} />
            </a>
          </p>
          <p className="download-setup">
            Ready to get started?{' '}
            <Link to="/docs/$" params={{ _splat: 'quickstart' }}>
              Read the setup guide <ArrowUpRight size={13} />
            </Link>
          </p>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
