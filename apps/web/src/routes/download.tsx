import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowDown, ArrowUpRight, Check, ChevronDown } from 'lucide-react';
import {
  desktopBuilds,
  desktopDownloadUrl,
  desktopPlatforms,
  desktopVersion,
  primaryDesktopBuilds,
} from '../download-builds';
import {
  MarketingFooter,
  MarketingHeader,
  useDesktopPlatform,
} from '../components/desktop-download';
import { PlatformIcon } from '../components/platform-icon';
import '../landing.css';
import '../download.css';

export const Route = createFileRoute('/download')({
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

function DownloadPage() {
  const detected = useDesktopPlatform();
  return (
    <div className="landing download-page">
      <MarketingHeader />
      <main>
        <header className="download-page-heading">
          <img src="/openfactory.png" width={72} height={72} alt="" />
          <h1>Download OpenFactory.</h1>
          <p>Your agents. Your computers. Make yourself at home.</p>
          <span>
            Version {desktopVersion} <span aria-hidden="true">·</span> Desktop preview
          </span>
        </header>
        <div className="download-platform-list">
          {desktopPlatforms.map((platform) => {
            const build = primaryDesktopBuilds[platform];
            return (
              <section
                className="download-platform-section"
                id={platform}
                key={platform}
                aria-labelledby={`download-${platform}`}
              >
                <div className="download-platform-heading">
                  <h2 id={`download-${platform}`}>
                    <PlatformIcon platform={platform} size={25} />
                    {build.label}
                  </h2>
                  {detected === platform && (
                    <span className="download-recommended">
                      <Check size={13} />
                      For your computer
                    </span>
                  )}
                </div>
                <a
                  className="download-installer"
                  href={desktopDownloadUrl(build.file)}
                  download={!import.meta.env.PUBLIC_SITE}
                >
                  <span className="download-installer-icon">
                    <ArrowDown size={20} />
                  </span>
                  <span>
                    <strong>Download for {build.label}</strong>
                    <span>{build.architecture}</span>
                  </span>
                  <span className="download-format">
                    {build.format}
                    <ArrowUpRight size={15} />
                  </span>
                </a>
                {platform === 'mac' && (
                  <>
                    <p className="download-platform-note">
                      Requires macOS 13 or newer. Unsigned preview: approve the app in System
                      Settings → Privacy &amp; Security if prompted.
                    </p>
                    <details className="download-alternative">
                      <summary>
                        Other Mac builds <ChevronDown size={14} />
                      </summary>
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
                            Mac with Intel processor{' '}
                            <span>
                              {alternative.format}
                              <ArrowDown size={14} />
                            </span>
                          </a>
                        ))}
                    </details>
                  </>
                )}
                {platform === 'windows' && (
                  <p className="download-platform-note">
                    Windows 10 or newer, 64-bit. Unsigned preview: Windows SmartScreen may ask you
                    to approve the installer.
                  </p>
                )}
                {platform === 'linux' && (
                  <p className="download-platform-note">
                    For Debian and Ubuntu on x86-64. Download the .deb package and open it with your
                    software installer.
                  </p>
                )}
              </section>
            );
          })}
          <aside className="download-next">
            <h2>Installed? Give your agents a home.</h2>
            <p>
              Install and sign in to Codex CLI or Claude Code CLI on each computer that runs work.
              Then choose a project folder and create your first agent.
            </p>
            <Link to="/docs/$" params={{ _splat: 'quickstart' }}>
              Read the setup guide <ArrowUpRight size={15} />
            </Link>
          </aside>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}
