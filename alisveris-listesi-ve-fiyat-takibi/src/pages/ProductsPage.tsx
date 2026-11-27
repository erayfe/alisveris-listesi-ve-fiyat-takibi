import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Package, Plus, Search } from 'lucide-react';
import { db, createId, nowIso } from '../db/database';
import type { BaseUnit, InputUnit, PriceRecord, Product } from '../types/models';
import {
  BASE_UNITS,
  INPUT_UNITS,
  formatBaseUnitLabel,
  formatRelativeDate,
  formatUnitPrice,
  normalizeTurkish
} from '../services/unitConverter';
import { buildStoreComparison } from '../services/priceService';
import { Modal } from '../components/common/Modal';

interface ProductsPageProps {
  onOpenProduct: (productId: string) => void;
}

export const ProductsPage: React.FC<ProductsPageProps> = ({ onOpenProduct }) => {
  const [search, setSearch] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New Product form
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subCategoryId, setSubCategoryId] = useState('');
  const [baseUnit, setBaseUnit] = useState<BaseUnit>('kg');
  const [defaultInputUnit, setDefaultInputUnit] = useState<InputUnit>('kg');
  const [defaultBrand, setDefaultBrand] = useState('');
  const [notes, setNotes] = useState('');
  const [dupWarning, setDupWarning] = useState<string | null>(null);

  const products = useLiveQuery(() => db.products.where('isArchived').equals(0).sortBy('name'), []);
  const categories = useLiveQuery(() => db.categories.where('isArchived').equals(0).toArray(), []);
  const stores = useLiveQuery(() => db.stores.toArray(), []);
  const prices = useLiveQuery(() => db.price_records.toArray(), []);

  const mainCategories = useMemo(
    () => (categories ?? []).filter((c) => c.parentId === null).sort((a, b) => a.sortOrder - b.sortOrder),
    [categories]
  );

  const subCategories = useMemo(
    () => (categories ?? []).filter((c) => c.parentId === categoryId).sort((a, b) => a.sortOrder - b.sortOrder),
    [categories, categoryId]
  );

  const categoryMap = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);
  const storeMap = useMemo(
    () => new Map((stores ?? []).map((s) => [s.id, { name: s.name, branch: s.branch }])),
    [stores]
  );

  const pricesByProduct = useMemo(() => {
    const map = new Map<string, PriceRecord[]>();
    for (const r of prices ?? []) {
      const arr = map.get(r.productId) ?? [];
      arr.push(r);
      map.set(r.productId, arr);
    }
    return map;
  }, [prices]);

  useEffect(() => {
    if (!categoryId && mainCategories.length > 0) {
      setCategoryId(mainCategories[0].id);
    }
  }, [mainCategories, categoryId]);

  const filteredProducts = useMemo(() => {
    const q = normalizeTurkish(search);
    return (products ?? []).filter((p) => {
      if (selectedCategoryId !== 'all' && p.categoryId !== selectedCategoryId) return false;
      if (q && !normalizeTurkish(p.name).includes(q)) return false;
      return true;
    });
  }, [products, search, selectedCategoryId]);

  async function handleCreateProduct(e: React.FormEvent) {
    e.preventDefault();
    const clean = name.trim();
    if (!clean || !categoryId) return;

    const duplicate = (products ?? []).find((p) => normalizeTurkish(p.name) === normalizeTurkish(clean));
    if (duplicate) {
      setDupWarning(`"${duplicate.name}" adında bir ürün zaten kayıtlı.`);
      return;
    }

    const ts = nowIso();
    const created: Product = {
      id: createId(),
      name: clean,
      categoryId,
      subCategoryId: subCategoryId || null,
      baseUnit,
      defaultInputUnit,
      defaultBrand: defaultBrand.trim() || null,
      barcode: null,
      notes: notes.trim() || null,
      isArchived: 0,
      createdAt: ts,
      updatedAt: ts
    };
    await db.products.add(created);
    setName('');
    setDefaultBrand('');
    setNotes('');
    setDupWarning(null);
    setShowCreateModal(false);
    onOpenProduct(created.id);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Ürün Kataloğu</h1>
          <p className="text-xs text-slate-500">
            {(products ?? []).length} tanımlı ürün · fiyat grafiği ve market kıyaslaması için ürüne tıklayın
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setDupWarning(null);
            setShowCreateModal(true);
          }}
          className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Yeni Ürün
        </button>
      </div>

      {/* Search & Category Filter */}
      <div className="space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Ürün adı ile ara..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedCategoryId('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-colors ${
              selectedCategoryId === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            Tümü
          </button>
          {mainCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategoryId(cat.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-colors ${
                selectedCategoryId === cat.id
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white border border-slate-200 text-slate-600'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Product List */}
      {filteredProducts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2">
          <Package className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="font-semibold text-slate-700">Ürün bulunamadı</p>
          <p className="text-xs text-slate-500">
            Yeni bir ürün ekleyebilir veya alışveriş listesinden hızlıca oluşturabilirsiniz.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {filteredProducts.map((prod) => {
            const cat = categoryMap.get(prod.categoryId);
            const subCat = prod.subCategoryId ? categoryMap.get(prod.subCategoryId) : null;
            const recs = pricesByProduct.get(prod.id) ?? [];
            const comparison = buildStoreComparison(recs, storeMap);
            const best = comparison.find((c) => c.record.normalizedUnitPrice !== null);

            return (
              <button
                key={prod.id}
                type="button"
                onClick={() => onOpenProduct(prod.id)}
                className="w-full px-4 py-3.5 text-left hover:bg-slate-50 flex items-center justify-between gap-3 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: cat?.color ?? '#64748b' }}
                    />
                    <p className="font-semibold text-sm text-slate-900 truncate">{prod.name}</p>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {cat?.name ?? 'Genel'}
                    {subCat ? ` › ${subCat.name}` : ''} · Baz: {formatBaseUnitLabel(prod.baseUnit)}
                    {recs.length > 0 ? ` · ${recs.length} fiyat kaydı` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {best ? (
                    <div className="text-right">
                      <p className="text-xs font-bold text-emerald-700">
                        {formatUnitPrice(best.record.normalizedUnitPrice, prod.baseUnit)}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {best.storeName} · {formatRelativeDate(best.record.recordedAt)}
                      </p>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Fiyat yok</span>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-300" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Create Product Modal */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Yeni Ürün Tanımla">
        <form onSubmit={handleCreateProduct} className="space-y-3.5">
          {dupWarning && (
            <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
              {dupWarning}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Ürün Adı</label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDupWarning(null);
              }}
              placeholder="Örn. Süzme Peynir, Tavuk Göğsü"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Ana Tür</label>
              <select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setSubCategoryId('');
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
                value={subCategoryId}
                onChange={(e) => setSubCategoryId(e.target.value)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-sm bg-white"
              >
                <option value="">Seçilmedi</option>
                {subCategories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Temel Kıyas Birimi</label>
              <select
                value={baseUnit}
                onChange={(e) => {
                  const bu = e.target.value as BaseUnit;
                  setBaseUnit(bu);
                  setDefaultInputUnit(bu === 'kg' ? 'kg' : bu === 'l' ? 'l' : 'adet');
                }}
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
                value={defaultInputUnit}
                onChange={(e) => setDefaultInputUnit(e.target.value as InputUnit)}
                className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-sm bg-white"
              >
                {INPUT_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Varsayılan Marka (Opsiyonel)</label>
            <input
              type="text"
              value={defaultBrand}
              onChange={(e) => setDefaultBrand(e.target.value)}
              placeholder="Örn. Pınar"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Not (Opsiyonel)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Örn. Yağsız / Tam buğday"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm"
          >
            Ürünü Kaydet
          </button>
        </form>
      </Modal>
    </div>
  );
};
