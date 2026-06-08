import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DISMISS_KEY = 'pwa-dismissed';

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function isIosSafari() {
  if (!isIos()) return false;
  const ua = window.navigator.userAgent;
  const isOtherBrowser = /crios|fxios|edgios|opios/i.test(ua);
  return !isOtherBrowser;
}

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

function writeDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // private mode / quota
  }
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    if (isStandalone()) {
      setDismissed(true);
      return undefined;
    }
    if (dismissed) return undefined;

    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setShowIosHint(false);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    if (isIosSafari() && !deferredPrompt) {
      setShowIosHint(true);
    }

    const onPageShow = (event) => {
      if (isStandalone()) {
        setDismissed(true);
        return;
      }
      if (event.persisted && readDismissed()) {
        setDismissed(true);
      }
    };
    window.addEventListener('pageshow', onPageShow);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [dismissed, deferredPrompt]);

  const dismiss = () => {
    writeDismissed();
    setDismissed(true);
    setDeferredPrompt(null);
    setShowIosHint(false);
  };

  const onInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  };

  if (dismissed || isStandalone()) return null;
  if (!deferredPrompt && !showIosHint) return null;

  return (
    <div
      className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-lg rounded-xl border border-border bg-card p-4 shadow-lg md:left-auto"
      role="region"
      aria-label="Install app"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-sm">Add MindFlip to your home screen</p>
          <p className="text-xs text-muted-foreground mt-1">
            {showIosHint && !deferredPrompt
              ? 'In Safari: tap Share, then “Add to Home Screen”. Offline study works in the installed app.'
              : 'Install for offline study and faster access.'}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="text-muted-foreground hover:text-foreground p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {deferredPrompt ? (
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="min-h-[44px]" onClick={onInstall}>
            Install
          </Button>
          <Button size="sm" variant="outline" className="min-h-[44px]" onClick={dismiss}>
            Dismiss
          </Button>
        </div>
      ) : (
        showIosHint && (
          <div className="mt-3">
            <Button size="sm" variant="outline" className="min-h-[44px]" onClick={dismiss}>
              Got it
            </Button>
          </div>
        )
      )}
    </div>
  );
}
