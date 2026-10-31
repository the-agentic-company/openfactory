import { useEffect, useRef } from 'react';
import { PlatformIcon } from './platform-icon';

export function HeroArtwork() {
  const scene = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = scene.current;
    if (!element) {
      return;
    }
    let visible = false;
    const update = () => {
      element.dataset.motion = visible && !document.hidden ? 'running' : 'paused';
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      update();
    });
    observer.observe(element);
    document.addEventListener('visibilitychange', update);
    return () => {
      observer.disconnect();
      document.removeEventListener('visibilitychange', update);
    };
  }, []);

  return (
    <div ref={scene} className="hero-scene" data-motion="paused" aria-hidden="true">
      <div className="hero-orbit hero-orbit-mac">
        <span className="hero-logo-tile">
          <PlatformIcon platform="mac" size={35} />
        </span>
      </div>
      <div className="hero-orbit hero-orbit-windows">
        <span className="hero-logo-tile">
          <PlatformIcon platform="windows" size={31} />
        </span>
      </div>
      <div className="hero-orbit hero-orbit-linux">
        <span className="hero-logo-tile">
          <PlatformIcon platform="linux" size={37} />
        </span>
      </div>
      <div className="hero-orbit hero-orbit-claude">
        <span className="hero-logo-tile">
          <img src="/brands/claude-code.svg" width={46} height={46} alt="" />
        </span>
      </div>
      <div className="hero-orbit hero-orbit-openai">
        <span className="hero-logo-tile">
          <img src="/brands/codex.svg" width={44} height={44} alt="" />
        </span>
      </div>
    </div>
  );
}
