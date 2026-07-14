'use client';
import { useEffect } from 'react';

export function RegisterServiceWorker(): null {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Registration failures are non-fatal (e.g. insecure context on plain-HTTP LAN).
      });
    }
  }, []);
  return null;
}
