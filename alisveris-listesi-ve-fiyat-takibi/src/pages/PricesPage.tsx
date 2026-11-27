import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Eye, ShoppingCart, Tag, TrendingUp, Wallet } from 'lucide-react';
import { db } from '../db/database';
import {
  formatCurrency,
  formatDateTimeShort,
  formatUnitPrice
} from '../services/unitConverter';

interface PricesPageProps {
  onOpenProduct: (productId: string) => void;
}

export const PricesPage: React.FC<PricesPageProps> = ({ onOpenProduct }) => {
  const [view, setView] = useState<'feed' | 'spending'>('feed');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'purchase' | 'observation'>('all');
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const records = useLiveQuery(
    () => db.price_records.orderBy('recordedAt').reverse().toArray(),
    []
  );
  const products = useLiveQuery(() => db.products.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const stores = useLiveQuery(() => db.stores.toArray(), []);

  const productMap = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);
  const categoryMap = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);
  const storeMap = useMemo(() => new Map((stores ?? []).map((s) => [s.id, s])), [stores]);

  const filteredFeed = useMemo(() => {
    return (records ?? []).filter((r) => {
      if (sourceFilter !== 'all' && r.source !== sourceFilter) return false;
      if (storeFilter !== 'all' && (r.storeId ?? '__NONE__') !== storeFilter) return false;
      return true;
    });
  }, [records, sourceFilter, storeFilter]);

  // Spending summary only counts source === 'purchase'
  const spendingSummary = useMemo(() => {
    const purchases = (records ?? []).filter(
      (r) => r.source === 'purchase' && r.recordedAt.slice(0, 7) === selectedMonth
    );

    let total = 0;
    const byCategory = new Map<string, { name: string; color: string; amount: number }>();
    const byStore = new Map<string, { name: string; amount: number }>();

    for (const r of purchases) {
      total += r.totalPrice;

      const prod = productMap.get(r.productId);
      const cat = prod ? categoryMap.get(prod.categoryId) : undefined;
      const catKey = cat?.id ?? '__OTHER__';
      const cEntry = byCategory.get(catKey) ?? {
        name: cat?.name ?? 'Diğer',
        color: cat?.color ?? '#64748b',
        amount: 0
      };
      cEntry.amount += r.totalPrice;
      byCategory.set(catKey, cEntry);

      const st = r.storeId ? storeMap.get(r.storeId) : undefined;
      const stKey = st?.id ?? '__NONE__';
      const sEntry = byStore.get(stKey) ?? {
        name: st?.name ?? 'Market Belirtilmedi',
        amount: 0
      };
      sEntry.amount += r.totalPrice;
      byStore.set(stKey, sEntry);
    }

    return {
      total,
      count: purchases.length,
      categories: Array.from(byCategory.values()).sort((a, b) => b.amount - a.amount),
      stores: Array.from(byStore.values()).sort((a, b) => b.amount - a.amount)
    };
  }, [records, selectedMonth, productMap, categoryMap, storeMap]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Piyasa & Harcama Analizi</h1>
        <p className="text-xs text-slate-500">
          Tüm fiyat gözlemleri ve yalnızca satın almalardan oluşan aylık harcama özeti
        </p>
      </div>

      {/* View Toggle */}
      <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-200/70 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setView('feed')}
          className={`py-2 rounded-lg flex items-center justify-center gap-1.5 ${
            view === 'feed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Son Fiyat Akışı
        </button>
        <button
          type="button"
          onClick={() => setView('spending')}
          className={`py-2 rounded-lg flex items-center justify-center gap-1.5 ${
            view === 'spending' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
          }`}
        >
          <Wallet className="w-4 h-4" />
          Aylık Harcama
        </button>
      </div>

      {view === 'feed' ? (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as 'all' | 'purchase' | 'observation')}
              className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700"
            >
              <option value="all">Tümü (Satın Alma + Gözlem)</option>
              <option value="observation">Sadece Fiyat Gözlemleri</option>
              <option value="purchase">Sadece Satın Almalar</option>
            </select>

            <select
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700"
            >
              <option value="all">Tüm Marketler</option>
              {(stores ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {filteredFeed.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-500">
              Henüz fiyat kaydı bulunmuyor. Sağ alttaki "+ Fiyat Gir" butonu ile market raf fiyatlarını anında kaydedebilirsiniz.
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
              {filteredFeed.slice(0, 100).map((rec) => {
                const prod = productMap.get(rec.productId);
                const store = rec.storeId ? storeMap.get(rec.storeId) : null;
                return (
                  <button
                    key={rec.id}
                    type="button"
                    onClick={() => prod && onOpenProduct(prod.id)}
                    className="w-full px-4 py-3 text-left hover:bg-slate-50 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-sm text-slate-900 truncate">
                          {prod?.name ?? 'Ürün'}
                        </span>
                        {rec.isPromo === 1 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                            <Tag className="w-2.5 h-2.5" /> Kampanya
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          {rec.source === 'purchase' ? (
                            <ShoppingCart className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Eye className="w-3 h-3 text-blue-600" />
                          )}
                          {rec.source === 'purchase' ? 'Satın Alma' : 'Gözlem'}
                        </span>
                        <span>· {store ? store.name : 'Market Yok'}</span>
                        <span>· {formatDateTimeShort(rec.recordedAt)}</span>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-slate-900">{formatCurrency(rec.totalPrice)}</p>
                      <p className="text-[11px] font-semibold text-emerald-700">
                        {rec.normalizedUnitPrice !== null
                          ? formatUnitPrice(rec.normalizedUnitPrice, rec.normalizedBaseUnit)
                          : `${rec.packageQuantity} ${rec.packageUnit}`}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 p-4">
            <div>
              <p className="text-xs text-slate-500 font-medium">Seçili Ay Gerçek Harcama</p>
              <p className="text-2xl font-bold text-slate-900 mt-0.5">
                {formatCurrency(spendingSummary.total)}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {spendingSummary.count} satın alma kalemi (gözlemler hariç)
              </p>
            </div>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-slate-50"
            />
          </div>

          {/* By Category */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <h2 className="text-sm font-bold text-slate-900">Ana Tür Bazlı Dağılım</h2>
            {spendingSummary.categories.length === 0 ? (
              <p className="text-xs text-slate-400">Bu ay için satın alma kaydı yok.</p>
            ) : (
              <div className="space-y-2.5">
                {spendingSummary.categories.map((c) => {
                  const pct = spendingSummary.total > 0 ? Math.round((c.amount / spendingSummary.total) * 100) : 0;
                  return (
                    <div key={c.name}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-slate-700">{c.name}</span>
                        <span className="font-bold text-slate-900">
                          {formatCurrency(c.amount)} <span className="text-slate-400 font-normal">(%{pct})</span>
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: c.color }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* By Store */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2.5">
            <h2 className="text-sm font-bold text-slate-900">Market Bazlı Harcama</h2>
            {spendingSummary.stores.length === 0 ? (
              <p className="text-xs text-slate-400">Bu ay için satın alma kaydı yok.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {spendingSummary.stores.map((s) => (
                  <div key={s.name} className="py-2 flex justify-between text-xs">
                    <span className="font-medium text-slate-700">{s.name}</span>
                    <span className="font-bold text-slate-900">{formatCurrency(s.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
