import React from 'react';
import {
  ClipboardList,
  Package,
  TrendingUp,
  Settings,
  Plus,
  WifiOff,
  ShoppingBag
} from 'lucide-react';

export type MainTab = 'lists' | 'products' | 'prices' | 'settings';

interface AppLayoutProps {
  activeTab: MainTab;
  onSelectTab: (tab: MainTab) => void;
  onOpenQuickPrice: () => void;
  isOffline: boolean;
  needsBackupReminder: boolean;
  children: React.ReactNode;
}

const NAV_ITEMS: { id: MainTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'lists', label: 'Listeler', icon: ClipboardList },
  { id: 'products', label: 'Ürünler', icon: Package },
  { id: 'prices', label: 'Fiyatlar', icon: TrendingUp },
  { id: 'settings', label: 'Yönetim', icon: Settings }
];

export const AppLayout: React.FC<AppLayoutProps> = ({
  activeTab,
  onSelectTab,
  onOpenQuickPrice,
  isOffline,
  needsBackupReminder,
  children
}) => {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-64 bg-white border-r border-slate-200 sticky top-0 h-screen shrink-0">
        <div className="px-5 py-5 border-b border-slate-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-sm">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 leading-tight">Fiyat Hafızası</h1>
            <p className="text-xs text-slate-500">Yerel Sepet & Piyasa</p>
          </div>
        </div>

        <div className="p-4">
          <button
            type="button"
            onClick={onOpenQuickPrice}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Hızlı Fiyat Gir
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="w-5 h-5" />
                  {item.label}
                </span>
                {item.id === 'settings' && needsBackupReminder && (
                  <span className="w-2 h-2 rounded-full bg-amber-500" title="Yedekleme önerilir" />
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100 text-xs text-slate-500 flex items-center justify-between">
          <span>IndexedDB · Yerel</span>
          {isOffline ? (
            <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
              <WifiOff className="w-3.5 h-3.5" /> Çevrimdışı
            </span>
          ) : (
            <span className="text-emerald-600 font-medium">Hazır</span>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {isOffline && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-xs text-amber-800 flex items-center justify-center gap-1.5">
            <WifiOff className="w-3.5 h-3.5" />
            Çevrimdışı modda çalışıyorsunuz — tüm değişiklikler cihazınıza kaydedilir.
          </div>
        )}

        <main className="flex-1 w-full max-w-4xl mx-auto px-3.5 sm:px-6 pt-4 pb-28 md:pb-10">
          {children}
        </main>
      </div>

      {/* Mobile Floating Quick Price Button */}
      <button
        type="button"
        onClick={onOpenQuickPrice}
        className="md:hidden fixed right-4 bottom-20 z-30 h-12 px-4 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white shadow-lg shadow-emerald-600/30 flex items-center gap-2 font-semibold text-sm transition-all"
        aria-label="Hızlı Fiyat Gir"
      >
        <Plus className="w-5 h-5" />
        <span>Fiyat Gir</span>
      </button>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 safe-pb">
        <div className="grid grid-cols-4 h-16">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                  active ? 'text-emerald-600' : 'text-slate-500'
                }`}
              >
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  {item.id === 'settings' && needsBackupReminder && (
                    <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-amber-500" />
                  )}
                </div>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};
