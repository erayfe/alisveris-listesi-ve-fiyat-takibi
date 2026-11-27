import { useEffect, useState } from 'react';

export function useStoragePersist() {
  const [status, setStatus] = useState<'unknown' | 'persisted' | 'standard'>('unknown');

  useEffect(() => {
    let mounted = true;
    async function checkAndRequest() {
      if (typeof navigator === 'undefined' || !navigator.storage?.persisted) {
        if (mounted) setStatus('standard');
        return;
      }
      try {
        let persisted = await navigator.storage.persisted();
        if (!persisted && navigator.storage.persist) {
          persisted = await navigator.storage.persist();
        }
        if (mounted) setStatus(persisted ? 'persisted' : 'standard');
      } catch {
        if (mounted) setStatus('standard');
      }
    }
    checkAndRequest();
    return () => {
      mounted = false;
    };
  }, []);

  return status;
}
