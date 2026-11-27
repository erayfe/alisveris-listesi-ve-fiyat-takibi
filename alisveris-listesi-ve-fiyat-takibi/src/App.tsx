import React, { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/database';
import { ensureInitialSeed } from './db/seed';
import { useStoragePersist } from './hooks/useStoragePersist';
import { AppLayout, type MainTab } from './components/layout/AppLayout';
import { PriceEntrySheet, type PriceSheetContext } from './components/price/PriceEntrySheet';
import { ListsPage } from './pages/ListsPage';
import { ListDetailPage } from './pages/ListDetailPage';
import { ProductsPage } from './pages/ProductsPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { PricesPage } from './pages/PricesPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  const [ready, setReady] = useState(false);
  const [activeTab, setActiveTab] = useState<MainTab>('lists');
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [priceSheetCtx, setPriceSheetCtx] = useState<PriceSheetContext | null>(null);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );

  const storageStatus = useStoragePersist();

  const lastBackupMeta = useLiveQuery(() => db.app_meta.get('lastBackupAt'), []);
  const priceCount = useLiveQuery(() => db.price_records.count(), []);

  const needsBackupReminder = (() => {
    if (!priceCount || priceCount < 5) return false;
    if (typeof lastBackupMeta?.value !== 'string') return true;
    const diffDays = (Date.now() - new Date(lastBackupMeta.value).getTime()) / 86400000;
    return diffDays > 14;
  })();

  useEffect(() => {
    ensureInitialSeed().finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  function handleSelectTab(tab: MainTab) {
    setActiveTab(tab);
    setActiveListId(null);
    setActiveProductId(null);
  }

  function handleOpenProduct(productId: string) {
    setActiveTab('products');
    setActiveListId(null);
    setActiveProductId(productId);
  }

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-sm font-medium text-slate-500">
        Yerel veritabanı hazırlanıyor...
      </div>
    );
  }

  return (
    <>
      <AppLayout
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onOpenQuickPrice={() => setPriceSheetCtx({ source: 'observation' })}
        isOffline={isOffline}
        needsBackupReminder={needsBackupReminder}
      >
        {activeTab === 'lists' &&
          (activeListId ? (
            <ListDetailPage
              listId={activeListId}
              onBack={() => setActiveListId(null)}
              onOpenList={(id) => setActiveListId(id)}
              onOpenProduct={handleOpenProduct}
              onOpenPriceSheet={(ctx) => setPriceSheetCtx(ctx)}
            />
          ) : (
            <ListsPage onOpenList={(id) => setActiveListId(id)} />
          ))}

        {activeTab === 'products' &&
          (activeProductId ? (
            <ProductDetailPage
              productId={activeProductId}
              onBack={() => setActiveProductId(null)}
              onOpenPriceSheet={(ctx) => setPriceSheetCtx(ctx)}
            />
          ) : (
            <ProductsPage onOpenProduct={(id) => setActiveProductId(id)} />
          ))}

        {activeTab === 'prices' && <PricesPage onOpenProduct={handleOpenProduct} />}

        {activeTab === 'settings' && <SettingsPage storageStatus={storageStatus} />}
      </AppLayout>

      <PriceEntrySheet
        open={Boolean(priceSheetCtx)}
        context={priceSheetCtx}
        onClose={() => setPriceSheetCtx(null)}
      />
    </>
  );
}
