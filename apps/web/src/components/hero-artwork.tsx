import { useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { PlatformIcon } from './platform-icon';

export function HeroArtwork() {
  const scene = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const element = scene.current;
    if (!element) {
      return;
    }
    let visible = false;
    const update = () => {
      element.dataset.motion = !paused && visible && !document.hidden ? 'running' : 'paused';
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
  }, [paused]);

  return (
    <>
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
            <img src="/brands/claude.svg" width={46} height={46} alt="" />
          </span>
        </div>
        <div className="hero-orbit hero-orbit-openai">
          <span className="hero-logo-tile">
            <img src="/brands/openai.svg" width={44} height={44} alt="" />
          </span>
        </div>
      </div>
      <button
        className="hero-motion-toggle"
        type="button"
        onClick={() => setPaused(!paused)}
        aria-pressed={paused}
      >
        {paused ? <Play size={12} /> : <Pause size={12} />}
        {paused ? 'Play animation' : 'Pause animation'}
      </button>
    </>
  );
}
