import { useCallback, useEffect, useRef, useState } from 'react';

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: string, listener: () => void) => void;
}

export function useWakeLock() {
  const isSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [isActive, setIsActive] = useState(false);
  const desiredRef = useRef(false);
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);

  const requestLock = useCallback(async () => {
    if (!isSupported) return;
    try {
      const nav = navigator as unknown as {
        wakeLock: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
      };
      const sentinel = await nav.wakeLock.request('screen');
      sentinelRef.current = sentinel;
      setIsActive(true);
      sentinel.addEventListener('release', () => {
        setIsActive(false);
      });
    } catch {
      setIsActive(false);
    }
  }, [isSupported]);

  const toggle = useCallback(async () => {
    if (!isSupported) return;
    if (desiredRef.current) {
      desiredRef.current = false;
      if (sentinelRef.current && !sentinelRef.current.released) {
        await sentinelRef.current.release();
      }
      sentinelRef.current = null;
      setIsActive(false);
    } else {
      desiredRef.current = true;
      await requestLock();
    }
  }, [isSupported, requestLock]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && desiredRef.current) {
        requestLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      if (sentinelRef.current && !sentinelRef.current.released) {
        sentinelRef.current.release().catch(() => {});
      }
    };
  }, [requestLock]);

  return { isSupported, isActive, toggle };
}
