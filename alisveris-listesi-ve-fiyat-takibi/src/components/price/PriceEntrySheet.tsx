import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle,
  Check,
  Plus,
  Repeat,
  Search,
  Tag,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import { db, createId, nowIso } from '../../db/database';
import type { BaseUnit, InputUnit, PriceRecord, PriceSource, Product } from '../../types/models';
import {
  BASE_UNITS,
  INPUT_UNITS,
  calculatePriceMetrics,
  formatBaseUnitLabel,
  formatCurrency,
  formatUnitPrice,
  normalizeTurkish,
  toLocalDateTimeInput
} from '../../services/unitConverter';
import { computePriceDeltaPercent, recordPrice } from '../../services/priceService';
import { Modal } from '../common/Modal';

export interface PriceSheetContext {
  source: PriceSource;
  productId?: string;
  listId?: string | null;
  listItemId?: string | null;
  defaultStoreId?: string | null;
  initialQuantity?: number;
  initialUnit?: InputUnit;
  existingRecord?: PriceRecord | null;
}

interface PriceEntrySheetProps {
  open: boolean;
  context: PriceSheetContext | null;
  onClose: () => void;
  onSaved?: (record: PriceRecord) => void;
}

export const PriceEntrySheet: React.FC<PriceEntrySheetProps> = ({
  open,
  context,
  onClose,
  onSaved
}) => {
  const products = useLiveQuery(
    () => db.products.where('isArchived').equals(0).sortBy('name'),
    []
  );
  const stores = useLiveQuery(
    () => db.stores.where('isArchived').equals(0).sortBy('name'),
    []
  );
  const categories = useLiveQuery(
    () => db.categories.where('isArchived').equals(0).toArray(),
    []
  );

  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [productQuery, setProductQuery] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);

  // Inline quick product creation
  const [showNewProductBox, setShowNewProductBox] = useState(false);
  const [newProdCategoryId, setNewProdCategoryId] = useState('');
  const [newProdSubCategoryId, setNewProdSubCategoryId] = useState('');
  const [newProdBaseUnit, setNewProdBaseUnit] = useState<BaseUnit>('kg');

  // Inline quick store creation
  const [showNewStoreBox, setShowNewStoreBox] = useState(false);
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreBranch, setNewStoreBranch] = useState('');

  // Form values
  const [mode, setMode] = useState<'total' | 'unit'>('total');
  const [amountStr, setAmountStr] = useState('');
  const [qtyStr, setQtyStr] = useState('1');
  const [unit, setUnit] = useState<InputUnit>('kg');
  const [storeId, setStoreId] = useState<string>('');
  const [brand, setBrand] = useState('');
  const [isPromo, setIsPromo] = useState(false);
  const [promoNote, setPromoNote] = useState('');
  const [recordedAtLocal, setRecordedAtLocal] = useState(toLocalDateTimeInput());
  const [saving, setSaving] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mainCategories = useMemo(
    () =>
      (categories ?? [])
        .filter((c) => c.parentId === null)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [categories]
  );

  const subCategories = useMemo(
    () =>
      (categories ?? [])
        .filter((c) => c.parentId === newProdCategoryId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [categories, newProdCategoryId]
  );

  const selectedProduct: Product | undefined = useMemo(
    () => (products ?? []).find((p) => p.id === selectedProductId),
    [products, selectedProductId]
  );

  const productRecords = useLiveQuery(
    () =>
      selectedProductId
        ? db.price_records.where('productId').equals(selectedProductId).toArray()
        : Promise.resolve([] as PriceRecord[]),
    [selectedProductId]
  );

  // Initialize when sheet opens
  useEffect(() => {
    if (!open || !context) return;
    setErrorMsg(null);
    setToastMsg(null);
    setShowNewProductBox(false);
    setShowNewStoreBox(false);

    if (context.existingRecord) {
      const r = context.existingRecord;
      setSelectedProductId(r.productId);
      setMode('total');
      setAmountStr(String(r.totalPrice));
      setQtyStr(String(r.packageQuantity));
      setUnit(r.packageUnit);
      setStoreId(r.storeId ?? '');
      setBrand(r.brand ?? '');
      setIsPromo(r.isPromo === 1);
      setPromoNote(r.promoNote ?? '');
      setRecordedAtLocal(toLocalDateTimeInput(r.recordedAt));
    } else {
      setSelectedProductId(context.productId ?? '');
      setProductQuery('');
      setMode('total');
      setAmountStr('');
      setQtyStr(String(context.initialQuantity ?? 1));
      setUnit(context.initialUnit ?? 'kg');
      setStoreId(context.defaultStoreId ?? '');
      setBrand('');
      setIsPromo(false);
      setPromoNote('');
      setRecordedAtLocal(toLocalDateTimeInput());
    }
  }, [open, context]);

  // Sync default product unit/brand when product is selected in observation mode
  useEffect(() => {
    if (!selectedProduct || context?.existingRecord) return;
    setProductQuery(selectedProduct.name);
    if (!context?.initialUnit) {
      setUnit(selectedProduct.defaultInputUnit);
    }
    if (!brand && selectedProduct.defaultBrand) {
      setBrand(selectedProduct.defaultBrand);
    }
  }, [selectedProduct?.id]);

  // Default main category for quick add
  useEffect(() => {
    if (!newProdCategoryId && mainCategories.length > 0) {
      setNewProdCategoryId(mainCategories[0].id);
    }
  }, [mainCategories, newProdCategoryId]);

  const filteredProducts = useMemo(() => {
    const list = products ?? [];
    const q = normalizeTurkish(productQuery);
    if (!q) return list.slice(0, 8);
    return list.filter((p) => normalizeTurkish(p.name).includes(q)).slice(0, 8);
  }, [products, productQuery]);

  const exactProductMatch = useMemo(() => {
    const q = normalizeTurkish(productQuery);
    if (!q) return true;
    return (products ?? []).some((p) => normalizeTurkish(p.name) === q);
  }, [products, productQuery]);

  const parsedAmount = parseFloat(amountStr.replace(',', '.'));
  const parsedQty = parseFloat(qtyStr.replace(',', '.'));

  const liveCalc = useMemo(() => {
    if (!selectedProduct || isNaN(parsedAmount) || parsedAmount <= 0 || isNaN(parsedQty) || parsedQty <= 0) {
      return null;
    }
    return calculatePriceMetrics({
      mode,
      amount: parsedAmount,
      quantity: parsedQty,
      inputUnit: unit,
      baseUnit: selectedProduct.baseUnit
    });
  }, [selectedProduct, mode, parsedAmount, parsedQty, unit]);

  const deltaInfo = useMemo(() => {
    if (!liveCalc || liveCalc.normalizedUnitPrice === null || !productRecords) return null;
    return computePriceDeltaPercent(
      productRecords,
      liveCalc.normalizedUnitPrice,
      storeId || null,
      context?.existingRecord?.id
    );
  }, [liveCalc, productRecords, storeId, context?.existingRecord?.id]);

  async function handleQuickCreateProduct() {
    const cleanName = productQuery.trim();
    if (!cleanName || !newProdCategoryId) return;
    const ts = nowIso();
    const defaultInputUnit: InputUnit =
      newProdBaseUnit === 'kg' ? 'kg' : newProdBaseUnit === 'l' ? 'l' : 'adet';
    const created: Product = {
      id: createId(),
      name: cleanName,
      categoryId: newProdCategoryId,
      subCategoryId: newProdSubCategoryId || null,
      baseUnit: newProdBaseUnit,
      defaultInputUnit,
      defaultBrand: null,
      barcode: null,
      notes: null,
      isArchived: 0,
      createdAt: ts,
      updatedAt: ts
    };
    await db.products.add(created);
    setSelectedProductId(created.id);
    setUnit(defaultInputUnit);
    setShowNewProductBox(false);
    setShowProductDropdown(false);
  }

  async function handleQuickCreateStore() {
    const clean = newStoreName.trim();
    if (!clean) return;
    const ts = nowIso();
    const id = createId();
    await db.stores.add({
      id,
      name: clean,
      branch: newStoreBranch.trim() || null,
      isArchived: 0,
      createdAt: ts,
      updatedAt: ts
    });
    setStoreId(id);
    setNewStoreName('');
    setNewStoreBranch('');
    setShowNewStoreBox(false);
  }

  async function handleSave(continueSameStore: boolean) {
    if (!context) return;
    if (!selectedProductId) {
      setErrorMsg('Lütfen bir ürün seçin veya oluşturun.');
      return;
    }
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg('Geçerli bir fiyat tutarı girin.');
      return;
    }
    if (isNaN(parsedQty) || parsedQty <= 0) {
      setErrorMsg('Geçerli bir miktar girin.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      const saved = await recordPrice({
        existingRecordId: context.existingRecord?.id ?? null,
        productId: selectedProductId,
        storeId: storeId || null,
        source: context.source,
        listId: context.listId ?? null,
        listItemId: context.listItemId ?? null,
        brand: brand.trim() || null,
        mode,
        amount: parsedAmount,
        packageQuantity: parsedQty,
        packageUnit: unit,
        isPromo,
        promoNote: promoNote.trim() || null,
        recordedAt: recordedAtLocal ? new Date(recordedAtLocal).toISOString() : undefined,
        autoCheckListItem: context.source === 'purchase'
      });

      onSaved?.(saved);

      if (continueSameStore && context.source === 'observation') {
        const savedName = selectedProduct?.name ?? 'Ürün';
        setToastMsg(`"${savedName}" kaydedildi. Aynı markette devam edebilirsiniz.`);
        setSelectedProductId('');
        setProductQuery('');
        setAmountStr('');
        setQtyStr('1');
        setBrand('');
        setIsPromo(false);
        setPromoNote('');
      } else {
        onClose();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Kayıt sırasında hata oluştu.');
    } finally {
      setSaving(false);
    }
  }

  const isLockedProduct = Boolean(context?.source === 'purchase' || context?.existingRecord);
  const sheetTitle = context?.existingRecord
    ? 'Fiyat Kaydını Düzenle'
    : context?.source === 'purchase'
      ? `Fiyat Gir · ${selectedProduct?.name ?? ''}`
      : 'Hızlı Fiyat Gözlemi Ekle';

  const sheetSubtitle =
    context?.source === 'observation'
      ? 'Alışveriş listesine eklemeden raf fiyatı kaydedin (harcama toplamına eklenmez)'
      : 'Bu tutar sepet toplamına ve ürün fiyat geçmişine işlenir';

  return (
    <Modal open={open} onClose={onClose} title={sheetTitle} subtitle={sheetSubtitle} variant="sheet">
      <div className="space-y-4">
        {toastMsg && (
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{toastMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
            {errorMsg}
          </div>
        )}

        {/* Product Selector (only when not locked to a list item) */}
        {!isLockedProduct && (
          <div className="relative">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Ürün</label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={productQuery}
                onFocus={() => setShowProductDropdown(true)}
                onChange={(e) => {
                  setProductQuery(e.target.value);
                  setSelectedProductId('');
                  setShowProductDropdown(true);
                  setShowNewProductBox(false);
                }}
                placeholder="Ürün ara veya yeni isim yaz..."
                className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {showProductDropdown && !selectedProductId && (
              <div className="mt-1 rounded-xl border border-slate-200 bg-white shadow-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                {filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedProductId(p.id);
                      setProductQuery(p.name);
                      setUnit(p.defaultInputUnit);
                      setBrand(p.defaultBrand ?? '');
                      setShowProductDropdown(false);
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-emerald-50 flex items-center justify-between"
                  >
                    <span className="font-medium text-slate-800">{p.name}</span>
                    <span className="text-xs text-slate-400">Baz: {formatBaseUnitLabel(p.baseUnit)}</span>
                  </button>
                ))}
                {productQuery.trim() && !exactProductMatch && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowNewProductBox(true);
                      setShowProductDropdown(false);
                    }}
                    className="w-full px-3 py-2.5 text-left text-sm text-emerald-700 font-semibold bg-emerald-50/70 hover:bg-emerald-100 flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Yeni ürün oluştur: "{productQuery.trim()}"
                  </button>
                )}
              </div>
            )}

            {showNewProductBox && (
              <div className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
                <p className="text-xs font-semibold text-slate-700">
                  Yeni Ürün: <span className="text-emerald-700">{productQuery.trim()}</span>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-0.5">Ana Tür</label>
                    <select
                      value={newProdCategoryId}
                      onChange={(e) => {
                        setNewProdCategoryId(e.target.value);
                        setNewProdSubCategoryId('');
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                    >
                      {mainCategories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-0.5">Alt Tür (Opsiyonel)</label>
                    <select
                      value={newProdSubCategoryId}
                      onChange={(e) => setNewProdSubCategoryId(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                    >
                      <option value="">Seçilmedi</option>
                      {subCategories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex items-end gap-2">
                  <div className="flex-1">
                    <label className="block text-[11px] text-slate-500 mb-0.5">Temel Kıyas Birimi</label>
                    <select
                      value={newProdBaseUnit}
                      onChange={(e) => setNewProdBaseUnit(e.target.value as BaseUnit)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
                    >
                      {BASE_UNITS.map((u) => (
                        <option key={u.value} value={u.value}>{u.label}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={handleQuickCreateProduct}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700"
                  >
                    Oluştur
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Mode Toggle: Total Price vs Unit Price */}
        <div>
          <div className="grid grid-cols-2 p-1 rounded-xl bg-slate-100 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setMode('total')}
              className={`py-2 rounded-lg transition-all ${
                mode === 'total' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Toplam Paket Fiyatı
            </button>
            <button
              type="button"
              onClick={() => setMode('unit')}
              className={`py-2 rounded-lg transition-all ${
                mode === 'unit' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              Birim Fiyat ({selectedProduct ? `₺/${formatBaseUnitLabel(selectedProduct.baseUnit)}` : '₺'})
            </button>
          </div>
        </div>

        {/* Amount + Quantity + Unit */}
        <div className="grid grid-cols-12 gap-2.5">
          <div className="col-span-5">
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {mode === 'total' ? 'Toplam Tutar (₺)' : 'Birim Fiyat (₺)'}
            </label>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-base font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="col-span-3">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Miktar</label>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={qtyStr}
              onChange={(e) => setQtyStr(e.target.value)}
              placeholder="1"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="col-span-4">
            <label className="block text-xs font-semibold text-slate-700 mb-1">Birim</label>
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value as InputUnit)}
              className="w-full px-2.5 py-2.5 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {INPUT_UNITS.map((u) => (
                <option key={u.value} value={u.value}>{u.short}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Live Normalization & Delta Banner */}
        {liveCalc && selectedProduct && (
          <div
            className={`p-3 rounded-xl border text-xs ${
              liveCalc.canNormalize
                ? 'bg-emerald-50/70 border-emerald-200 text-slate-800'
                : 'bg-amber-50 border-amber-200 text-amber-900'
            }`}
          >
            {liveCalc.canNormalize ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-slate-500">Standart Birim: </span>
                  <span className="font-bold text-emerald-800 text-sm">
                    {formatUnitPrice(liveCalc.normalizedUnitPrice, selectedProduct.baseUnit)}
                  </span>
                  {mode === 'unit' && (
                    <span className="ml-2 text-slate-600">
                      (Toplam: <strong>{formatCurrency(liveCalc.totalPrice)}</strong>)
                    </span>
                  )}
                </div>
                {deltaInfo && deltaInfo.deltaPercent !== null && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold ${
                      deltaInfo.deltaPercent > 0
                        ? 'bg-rose-100 text-rose-700'
                        : deltaInfo.deltaPercent < 0
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {deltaInfo.deltaPercent > 0 ? (
                      <TrendingUp className="w-3.5 h-3.5" />
                    ) : deltaInfo.deltaPercent < 0 ? (
                      <TrendingDown className="w-3.5 h-3.5" />
                    ) : null}
                    {deltaInfo.deltaPercent > 0 ? `+${deltaInfo.deltaPercent}%` : `${deltaInfo.deltaPercent}%`}
                    <span className="font-normal opacity-80">
                      {deltaInfo.comparedWithStore ? ' (aynı market)' : ' (son kayıt)'}
                    </span>
                  </span>
                )}
              </div>
            ) : (
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                <span>{liveCalc.warningMessage}</span>
              </div>
            )}
          </div>
        )}

        {/* Store Selection + Quick Add */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-slate-700">Market / Satıcı</label>
            <button
              type="button"
              onClick={() => setShowNewStoreBox((v) => !v)}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
            >
              {showNewStoreBox ? 'İptal' : '+ Yeni Market'}
            </button>
          </div>
          {showNewStoreBox ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={newStoreName}
                onChange={(e) => setNewStoreName(e.target.value)}
                placeholder="Market adı (örn. File)"
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
              <input
                type="text"
                value={newStoreBranch}
                onChange={(e) => setNewStoreBranch(e.target.value)}
                placeholder="Şube (opsiyonel)"
                className="w-28 px-2.5 py-2 rounded-xl border border-slate-300 text-sm"
              />
              <button
                type="button"
                onClick={handleQuickCreateStore}
                className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
              >
                Ekle
              </button>
            </div>
          ) : (
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">Market Belirtilmedi</option>
              {(stores ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.branch ? `${s.name} (${s.branch})` : s.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Brand & Date */}
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Marka (Opsiyonel)</label>
            <input
              type="text"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="Örn. Sütaş"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Tarih / Saat</label>
            <input
              type="datetime-local"
              value={recordedAtLocal}
              onChange={(e) => setRecordedAtLocal(e.target.value)}
              className="w-full px-2.5 py-2 rounded-xl border border-slate-300 text-xs"
            />
          </div>
        </div>

        {/* Promo Toggle & Note */}
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <Tag className="w-4 h-4 text-amber-500" />
              Kampanya / İndirim Fiyatı
            </span>
            <input
              type="checkbox"
              checked={isPromo}
              onChange={(e) => setIsPromo(e.target.checked)}
              className="w-4 h-4 accent-emerald-600 rounded"
            />
          </label>
          {isPromo && (
            <input
              type="text"
              value={promoNote}
              onChange={(e) => setPromoNote(e.target.value)}
              placeholder="Kısa not (örn. Hafta sonu indirimi, 2'li alımda)"
              className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-xs bg-white"
            />
          )}
        </div>

        {/* Action Buttons */}
        <div className="pt-1 flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => handleSave(false)}
            className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-sm shadow-sm transition-colors"
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>

          {context?.source === 'observation' && !context.existingRecord && (
            <button
              type="button"
              disabled={saving}
              onClick={() => handleSave(true)}
              className="sm:flex-1 py-3 px-4 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold text-xs sm:text-sm flex items-center justify-center gap-1.5 transition-colors"
            >
              <Repeat className="w-4 h-4" />
              Kaydet & Aynı Markette Devam Et
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
};
