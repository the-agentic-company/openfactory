import { useEffect } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import { z } from 'zod';
import '../connection-settings.css';

export function DesktopChrome() {
  const router = useRouter();
  useEffect(() => {
    const api = window.openfactory;
    if (!api) {
      return;
    }
    document.documentElement.classList.add('desktop');
    if (api.platform === 'darwin') {
      document.documentElement.classList.add('desktop-mac');
    }
    const incoming = (link: string) => {
      sessionStorage.setItem('openfactory-pairing-link', link);
      void router.navigate({ to: '/app/settings' });
    };
    void api.invoke('boot').then((raw) => {
      const result = z.object({ pairingLink: z.string().nullable().optional() }).parse(raw);
      if (result.pairingLink) {
        incoming(result.pairingLink);
      }
    });
    api.onPairingLink?.(incoming);
  }, [router]);
  return (
    <header className="desktop-title-bar" aria-label="Application title bar">
      <Link to="/app" className="desktop-title" aria-label="OpenFactory">
        <img src="/openfactory.png" width={28} height={28} alt="" />
      </Link>
    </header>
  );
}
