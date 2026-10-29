import { useSyncExternalStore } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowDown, ArrowRight, ArrowUpRight } from 'lucide-react';
import {
  detectDesktopPlatform,
  desktopDownloadUrl,
  desktopPlatforms,
  primaryDesktopBuilds,
} from '../download-builds';
import { PlatformIcon } from './platform-icon';

const subscribe = () => () => {};
const serverPlatform = () => null;
const browserPlatform = () => detectDesktopPlatform(navigator);

export function useDesktopPlatform() {
  return useSyncExternalStore(subscribe, browserPlatform, serverPlatform);
}

export function DesktopDownload({ showPlatforms = false }: { showPlatforms?: boolean }) {
  const platform = useDesktopPlatform();
  const build = platform ? primaryDesktopBuilds[platform] : null;
  return (
    <div className="landing-download-actions">
      {build ? (
        <a
          className="landing-primary"
          href={desktopDownloadUrl(build.file)}
          download={!import.meta.env.PUBLIC_SITE}
        >
          <PlatformIcon platform={build.platform} size={19} />
          Download for {build.label}
          <ArrowDown size={17} />
        </a>
      ) : (
        <Link className="landing-primary" to="/download">
          Download OpenFactory <ArrowDown size={18} />
        </Link>
      )}
      <Link className="landing-other-downloads" to="/download">
        Other download options <ArrowRight size={14} />
      </Link>
      {showPlatforms && (
        <nav className="landing-platforms" aria-label="Available platforms">
          {desktopPlatforms.map((platform) => (
            <Link to="/download" hash={platform} key={platform}>
              <PlatformIcon platform={platform} size={17} />
              {primaryDesktopBuilds[platform].label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

export function MarketingHeader() {
  return (
    <header className="landing-nav">
      <Link to="/" className="landing-brand">
        <img src="/openfactory.png" width={34} height={34} alt="" />
        OpenFactory
      </Link>
      <nav aria-label="Main navigation">
        <Link to="/" hash="features">
          Features
        </Link>
        <Link to="/download">Download</Link>
        <Link to="/docs/$" params={{ _splat: '' }}>
          Docs
        </Link>
        <Link to="/download" className="landing-open">
          Get OpenFactory <ArrowUpRight size={15} />
        </Link>
      </nav>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="landing-footer">
      <Link to="/" className="landing-brand">
        <img src="/openfactory.png" width={28} height={28} alt="" />
        OpenFactory
      </Link>
      <span>Built for the computers you already own.</span>
      <div>
        <Link to="/download">Download</Link>
        <Link to="/docs/$" params={{ _splat: '' }}>
          Docs <ArrowUpRight size={14} />
        </Link>
      </div>
    </footer>
  );
}
