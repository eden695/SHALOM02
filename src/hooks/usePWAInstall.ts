// PWA Installation & Service Worker Registration Hook for SHALOM
import { useEffect, useState } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Detect standalone mode (installed PWA or WebView shell)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    // Detect iOS devices
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Register Service Worker on HTTP/HTTPS origins (GitHub Pages, web browsers, WebView)
    const isHttpOrigin =
      typeof window !== 'undefined' &&
      (window.location.protocol === 'https:' || window.location.protocol === 'http:');

    if ('serviceWorker' in navigator && isHttpOrigin) {
      if (import.meta.env.PROD) {
        const expectedSwUrl = new URL('./sw.js', window.location.href).href;
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) => {
            regs.forEach((reg) => {
              const scriptUrl =
                reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL;
              if (scriptUrl && scriptUrl !== expectedSwUrl) {
                reg.unregister().catch(() => {});
              }
            });
          })
          .catch(() => {});

        // Activate updated service worker gracefully on next open/manual refresh without forced mid-session reload
        navigator.serviceWorker
          .register('./sw.js', { updateViaCache: 'none' })
          .then((reg) => {
            if (navigator.onLine) {
              reg.update().catch(() => {});
            }
          })
          .catch(() => {});
      } else {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((reg) => reg.unregister());
        });
        if ('caches' in window) {
          caches.keys().then((names) => {
            names.forEach((name) => caches.delete(name));
          });
        }
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
      return true;
    }
    return false;
  };

  return {
    isInstallable: !!deferredPrompt,
    isInstalled,
    isIOS,
    install,
  };
}
