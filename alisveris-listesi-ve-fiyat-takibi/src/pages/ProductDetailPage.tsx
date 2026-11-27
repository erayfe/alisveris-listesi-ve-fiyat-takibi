import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  Archive,
  Edit3,
  Plus,
  ShoppingCart,
  Tag,
  Trash2,
  Eye
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { db, nowIso } from '../db/database';
import type { BaseUnit, InputUnit } from '../types/models';
import {
  BASE_UNITS,
  INPUT_UNITS,
  formatBaseUnitLabel,
  formatCurrency,
  formatDateTimeShort,
  formatRelativeDate,
  formatUnitPrice
} from '../services/unitConverter';
import { buildStoreComparison, deletePriceRecord } from '../services/priceService';
import type { PriceSheetContext } from '../components/price/PriceEntrySheet';
import { Modal } from '../components/common/Modal';

const CHART_COLORS = ['#059669', '#2563eb', '#d97706', '#dc2626', '#9333ea', '#0891b2', '#db2777'];

interface ProductDetailPageProps {
  productId: string;
  onBack: () => void;
  onOpenPriceSheet: (ctx: PriceSheetContext) => void;
}

export const ProductDetailPage: React.FC<ProductDetailPageProps> = ({
  productId,
  onBack,
  onOpenPriceSheet
}) => {
  const product = useLiveQuery(() => db.products.get(productId), [productId]);
  const records = useLiveQuery(
    () => db.price_records.where('productId').equals(productId).sortBy('recordedAt'),
    [productId]
  );
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const stores = useLiveQuery(() => db.stores.toArray(), []);

  const [rangeDays, setRangeDays] = useState<'30' | '180' | 'all'>('all');
  const [chartStoreFilter, setChartStoreFilter] = useState<string>('all');
  const [excludePromos, setExcludePromos] = useState(false);

  // Edit product modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editSubCategoryId, setEditSubCategoryId] = useState('');
  const [editBaseUnit, setEditBaseUnit] = useState<BaseUnit>('kg');
  const [editDefaultInputUnit, setEditDefaultInputUnit] = useState<InputUnit>('kg');
  const [editDefaultBrand, setEditDefaultBrand] = useState('');

  const categoryMap = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);
  const storeMap = useMemo(
    () => new Map((stores ?? []).map((s) => [s.id, { name: s.name, branch: s.branch }])),
    [stores]
  );

  const mainCategories = useMemo(
    () =>
      (categories ?? [])
        .filter((c) => c.parentId === null && c.isArchived === 0)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [categories]
  );

  const editSubCategories = useMemo(
    () =>
      (categories ?? [])
        .filter((c) => c.parentId === editCategoryId && c.isArchived === 0)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [categories, editCategoryId]
  );

  const filteredRecords = useMemo(() => {
    const arr = records ?? [];
    const cutoff =
      rangeDays === 'all'
        ? 0
        : Date.now() - Number(rangeDays) * 24 * 60 * 60 * 1000;

    return arr.filter((r) => {
      if (cutoff > 0 && new Date(r.recordedAt).getTime() < cutoff) return false;
      if (excludePromos && r.isPromo === 1) return false;
      return true;
    });
  }, [records, rangeDays, excludePromos]);

  const stats = useMemo(() => {
    const normalized = filteredRecords
      .map((r) => r.normalizedUnitPrice)
      .filter((v): v is number => v !== null);
    if (normalized.length === 0) {
      return { min: null, avg: null, latest: null };
    }
    const min = Math.min(...normalized);
    const avg = normalized.reduce((s, v) => s + v, 0) / normalized.length;
    const latest = normalized[normalized.length - 1];
    return { min, avg, latest };
  }, [filteredRecords]);

  // Store comparison always uses all records (respecting promo filter if desired)
  const storeComparison = useMemo(
    () => buildStoreComparison(records ?? [], storeMap),
    [records, storeMap]
  );

  // Stores present in this product's records for chart filter
  const presentStores = useMemo(() => {
    const keys = new Set<string>();
    (records ?? []).forEach((r) => keys.add(r.storeId ?? '__NONE__'));
    return Array.from(keys).map((k) => ({
      id: k,
      name: k === '__NONE__' ? 'Market Belirtilmedi' : storeMap.get(k)?.name ?? 'Market'
    }));
  }, [records, storeMap]);

  // Build Recharts dataset: each timestamp is a point, columns are store keys
  const { chartData, chartSeries } = useMemo(() => {
    const usable = filteredRecords.filter((r) => {
      if (r.normalizedUnitPrice === null) return false;
      if (chartStoreFilter !== 'all') {
        const key = r.storeId ?? '__NONE__';
        if (key !== chartStoreFilter) return false;
      }
      return true;
    });

    const activeStoreKeys = new Set<string>();
    const points = usable.map((r) => {
      const storeKey = r.storeId ?? '__NONE__';
      activeStoreKeys.add(storeKey);
      const d = new Date(r.recordedAt);
      const label = d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' });
      return {
        ts: r.recordedAt,
        label,
        [storeKey]: r.normalizedUnitPrice
      };
    });

    const series = Array.from(activeStoreKeys).map((key, idx) => ({
      key,
      name: key === '__NONE__' ? 'Market Belirtilmedi' : storeMap.get(key)?.name ?? 'Market',
      color: CHART_COLORS[idx % CHART_COLORS.length]
    }));

    return { chartData: points, chartSeries: series };
  }, [filteredRecords, chartStoreFilter, storeMap]);

  function openEdit() {
    if (!product) return;
    setEditName(product.name);
    setEditCategoryId(product.categoryId);
    setEditSubCategoryId(product.subCategoryId ?? '');
    setEditBaseUnit(product.baseUnit);
    setEditDefaultInputUnit(product.defaultInputUnit);
    setEditDefaultBrand(product.defaultBrand ?? '');
    setShowEditModal(true);
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!product || !editName.trim()) return;
    await db.products.update(product.id, {
      name: editName.trim(),
      categoryId: editCategoryId,
      subCategoryId: editSubCategoryId || null,
      baseUnit: editBaseUnit,
      defaultInputUnit: editDefaultInputUnit,
      defaultBrand: editDefaultBrand.trim() || null,
      updatedAt: nowIso()
    });
    setShowEditModal(false);
  }

  async function handleArchiveProduct() {
    if (!product) return;
    if (
      window.confirm(
        `"${product.name}" ürününü arşivlemek istiyor musunuz? Geçmiş fiyat kayıtlarınız silinmez.`
      )
    ) {
      await db.products.update(product.id, { isArchived: 1, updatedAt: nowIso() });
      onBack();
    }
  }

  if (!product) {
    return <div className="p-8 text-center text-slate-500">Ürün yükleniyor...</div>;
  }

  const mainCat = categoryMap.get(product.categoryId);
  const subCat = product.subCategoryId ? categoryMap.get(product.subCategoryId) : null;

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="p-2 -ml-1 rounded-xl hover:bg-slate-200/70 text-slate-700"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 truncate">{product.name}</h1>
            <p className="text-xs text-slate-500">
              {mainCat?.name ?? 'Genel'}
              {subCat ? ` › ${subCat.name}` : ''} · Kıyas Birimi: <strong>{formatBaseUnitLabel(product.baseUnit)}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() =>
              onOpenPriceSheet({
                source: 'observation',
                productId: product.id,
                initialUnit: product.defaultInputUnit
              })
            }
            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            Fiyat Ekle
          </button>
          <button
            type="button"
            onClick={openEdit}
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
            title="Ürünü Düzenle"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleArchiveProduct}
            className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-rose-600 hover:bg-rose-50"
            title="Ürünü Arşivle"
          >
            <Archive className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Time Range + Summary Cards */}
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex p-0.5 rounded-lg bg-slate-200/70 text-xs font-semibold">
          {(
            [
              { id: '30', label: '30 Gün' },
              { id: '180', label: '6 Ay' },
              { id: 'all', label: 'Tümü' }
            ] as const
          ).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRangeDays(r.id)}
              className={`px-2.5 py-1 rounded-md ${
                rangeDays === r.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={excludePromos}
            onChange={(e) => setExcludePromos(e.target.checked)}
            className="w-3.5 h-3.5 accent-emerald-600 rounded"
          />
          Kampanyaları hariç tut
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-white rounded-2xl border border-slate-200 p-3">
          <p className="text-[11px] text-slate-500 font-medium">En Düşük</p>
          <p className="text-sm sm:text-base font-bold text-emerald-700 mt-0.5">
            {formatUnitPrice(stats.min, product.baseUnit)}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-3">
          <p className="text-[11px] text-slate-500 font-medium">Ortalama</p>
          <p className="text-sm sm:text-base font-bold text-slate-900 mt-0.5">
            {formatUnitPrice(stats.avg, product.baseUnit)}
          </p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-3">
          <p className="text-[11px] text-slate-500 font-medium">Son Kayıt</p>
          <p className="text-sm sm:text-base font-bold text-slate-900 mt-0.5">
            {formatUnitPrice(stats.latest, product.baseUnit)}
          </p>
        </div>
      </div>

      {/* Store Comparison Card */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900">Market Karşılaştırması (En Güncel)</h2>
          <span className="text-xs text-slate-400">{storeComparison.length} market</span>
        </div>

        {storeComparison.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            Bu ürün için henüz fiyat kaydı girilmemiş.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-semibold">
                <tr>
                  <th className="px-4 py-2.5">Market</th>
                  <th className="px-3 py-2.5">Birim Fiyat</th>
                  <th className="px-3 py-2.5">Paket / Tutar</th>
                  <th className="px-3 py-2.5">Tarih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {storeComparison.map((row, idx) => {
                  const isCheapest = idx === 0 && row.record.normalizedUnitPrice !== null;
                  return (
                    <tr key={row.storeId ?? 'none'} className={isCheapest ? 'bg-emerald-50/40' : ''}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-semibold text-slate-900">{row.storeName}</span>
                          {isCheapest && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                              En Uygun
                            </span>
                          )}
                          {row.record.isPromo === 1 && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold">
                              Kampanya
                            </span>
                          )}
                        </div>
                        {row.record.brand && (
                          <p className="text-[11px] text-slate-400">{row.record.brand}</p>
                        )}
                      </td>
                      <td className="px-3 py-3 font-bold text-slate-900 whitespace-nowrap">
                        {formatUnitPrice(row.record.normalizedUnitPrice, product.baseUnit)}
                      </td>
                      <td className="px-3 py-3 text-slate-600 whitespace-nowrap">
                        {row.record.packageQuantity} {row.record.packageUnit} ·{' '}
                        {formatCurrency(row.record.totalPrice)}
                      </td>
                      <td className="px-3 py-3 text-slate-500 whitespace-nowrap">
                        {formatRelativeDate(row.record.recordedAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Price Trend Chart */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900">
            Fiyat Değişim Grafiği (₺/{formatBaseUnitLabel(product.baseUnit)})
          </h2>
          {presentStores.length > 1 && (
            <select
              value={chartStoreFilter}
              onChange={(e) => setChartStoreFilter(e.target.value)}
              className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50"
            >
              <option value="all">Tüm Marketler</option>
              {presentStores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          )}
        </div>

        {chartData.length < 1 ? (
          <div className="h-44 flex items-center justify-center text-xs text-slate-400">
            Grafik için normalize edilebilir fiyat kaydı bekleniyor.
          </div>
        ) : (
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" domain={['auto', 'auto']} />
                <Tooltip
                  formatter={(value) => [
                    formatUnitPrice(Number(value), product.baseUnit),
                    'Birim Fiyat'
                  ]}
                  contentStyle={{ borderRadius: 12, borderColor: '#e2e8f0', fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {chartSeries.map((s) => (
                  <Line
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.name}
                    stroke={s.color}
                    strokeWidth={2.5}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Full Price Record History */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">
            Tüm Fiyat Geçmişi ({(records ?? []).length})
          </h2>
        </div>

        {(records ?? []).length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">Kayıt bulunmuyor.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {[...(records ?? [])].reverse().map((rec) => {
              const st = rec.storeId ? storeMap.get(rec.storeId) : null;
              return (
                <div key={rec.id} className="px-4 py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-sm text-slate-900">
                        {formatCurrency(rec.totalPrice)}
                      </span>
                      <span className="text-xs text-slate-500">
                        ({rec.packageQuantity} {rec.packageUnit})
                      </span>
                      {rec.normalizedUnitPrice !== null && (
                        <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                          {formatUnitPrice(rec.normalizedUnitPrice, rec.normalizedBaseUnit)}
                        </span>
                      )}
                      {rec.isPromo === 1 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                          <Tag className="w-2.5 h-2.5" />
                          {rec.promoNote || 'Kampanya'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-1 flex-wrap">
                      <span className="inline-flex items-center gap-1 font-medium text-slate-700">
                        {rec.source === 'purchase' ? (
                          <ShoppingCart className="w-3 h-3 text-emerald-600" />
                        ) : (
                          <Eye className="w-3 h-3 text-blue-600" />
                        )}
                        {rec.source === 'purchase' ? 'Satın Alma' : 'Gözlem'}
                      </span>
                      <span>· {st ? st.name : 'Market Yok'}</span>
                      {rec.brand && <span>· {rec.brand}</span>}
                      <span>· {formatDateTimeShort(rec.recordedAt)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        onOpenPriceSheet({
                          source: rec.source,
                          productId: rec.productId,
                          listId: rec.listId,
                          listItemId: rec.listItemId,
                          existingRecord: rec
                        })
                      }
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                      title="Düzenle"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Bu fiyat kaydını silmek istiyor musunuz?')) {
                          deletePriceRecord(rec.id);
                        }
                      }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      title="Sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Product Modal */}
      <Modal open={showEditModal} onClose={() => setShowEditModal(false)} title="Ürünü Düzenle">
        <form onSubmit={handleSaveEdit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Ürün Adı</label>
            <input
              type="text"
              required
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Ana Tür</label>
              <select
                value={editCategoryId}
                onChange={(e) => {
                  setEditCategoryId(e.target.value);
                  setEditSubCategoryId('');
                }}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-sm bg-white"
              >
                {mainCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Alt Tür</label>
              <select
                value={editSubCategoryId}
                onChange={(e) => setEditSubCategoryId(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-sm bg-white"
              >
                <option value="">Seçilmedi</option>
                {editSubCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Temel Kıyas Birimi</label>
              <select
                value={editBaseUnit}
                onChange={(e) => setEditBaseUnit(e.target.value as BaseUnit)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-sm bg-white"
              >
                {BASE_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Varsayılan Giriş Birimi</label>
              <select
                value={editDefaultInputUnit}
                onChange={(e) => setEditDefaultInputUnit(e.target.value as InputUnit)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-sm bg-white"
              >
                {INPUT_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Varsayılan Marka</label>
            <input
              type="text"
              value={editDefaultBrand}
              onChange={(e) => setEditDefaultBrand(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
            />
          </div>
          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm"
          >
            Değişiklikleri Kaydet
          </button>
        </form>
      </Modal>
    </div>
  );
};
