import React, { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft,
  Bookmark,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Plus,
  Search,
  Sun,
  Trash2,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import { db, createId, nowIso } from '../db/database';
import type { BaseUnit, InputUnit, ListItem, PriceRecord, Product } from '../types/models';
import {
  BASE_UNITS,
  INPUT_UNITS,
  estimateItemCost,
  formatBaseUnitLabel,
  formatCurrency,
  formatRelativeDate,
  formatUnitPrice,
  normalizeTurkish
} from '../services/unitConverter';
import {
  addListItem,
  completeShoppingList,
  removeListItem,
  saveListAsTemplate,
  toggleListItemChecked
} from '../services/listService';
import { buildStoreComparison, computePriceDeltaPercent } from '../services/priceService';
import { useWakeLock } from '../hooks/useWakeLock';
import type { PriceSheetContext } from '../components/price/PriceEntrySheet';
import { Modal } from '../components/common/Modal';

interface ListDetailPageProps {
  listId: string;
  onBack: () => void;
  onOpenList: (listId: string) => void;
  onOpenProduct: (productId: string) => void;
  onOpenPriceSheet: (ctx: PriceSheetContext) => void;
}

export const ListDetailPage: React.FC<ListDetailPageProps> = ({
  listId,
  onBack,
  onOpenList,
  onOpenProduct,
  onOpenPriceSheet
}) => {
  const wakeLock = useWakeLock();

  const list = useLiveQuery(() => db.shopping_lists.get(listId), [listId]);
  const items = useLiveQuery(() => db.list_items.where('listId').equals(listId).toArray(), [listId]);
  const products = useLiveQuery(() => db.products.toArray(), []);
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const stores = useLiveQuery(() => db.stores.where('isArchived').equals(0).sortBy('name'), []);
  const allPrices = useLiveQuery(() => db.price_records.toArray(), []);

  // Quick Add Bar state
  const [searchQuery, setSearchQuery] = useState('');
  const [addQty, setAddQty] = useState('1');
  const [addUnit, setAddUnit] = useState<InputUnit>('adet');
  const [showDropdown, setShowDropdown] = useState(false);

  // Inline Quick Product Modal
  const [showInlineCreate, setShowInlineCreate] = useState(false);
  const [newCategoryId, setNewCategoryId] = useState('');
  const [newSubCategoryId, setNewSubCategoryId] = useState('');
  const [newBaseUnit, setNewBaseUnit] = useState<BaseUnit>('kg');

  // UI state
  const [showCheckedSection, setShowCheckedSection] = useState(true);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [templateToast, setTemplateToast] = useState<string | null>(null);

  const productMap = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);
  const categoryMap = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories]);
  const storeMap = useMemo(
    () => new Map((stores ?? []).map((s) => [s.id, { name: s.name, branch: s.branch }])),
    [stores]
  );
  const priceMap = useMemo(() => new Map((allPrices ?? []).map((r) => [r.id, r])), [allPrices]);

  // Group all price records by productId for fast lookup
  const pricesByProduct = useMemo(() => {
    const map = new Map<string, PriceRecord[]>();
    for (const r of allPrices ?? []) {
      const arr = map.get(r.productId) ?? [];
      arr.push(r);
      map.set(r.productId, arr);
    }
    return map;
  }, [allPrices]);

  const activeMainCategories = useMemo(
    () =>
      (categories ?? [])
        .filter((c) => c.parentId === null && c.isArchived === 0)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [categories]
  );

  const activeSubCategories = useMemo(
    () =>
      (categories ?? [])
        .filter((c) => c.parentId === newCategoryId && c.isArchived === 0)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [categories, newCategoryId]
  );

  useEffect(() => {
    if (!newCategoryId && activeMainCategories.length > 0) {
      setNewCategoryId(activeMainCategories[0].id);
    }
  }, [activeMainCategories, newCategoryId]);

  const activeProducts = useMemo(
    () => (products ?? []).filter((p) => p.isArchived === 0).sort((a, b) => a.name.localeCompare(b.name, 'tr')),
    [products]
  );

  const searchMatches = useMemo(() => {
    const q = normalizeTurkish(searchQuery);
    if (!q) return activeProducts.slice(0, 6);
    return activeProducts.filter((p) => normalizeTurkish(p.name).includes(q)).slice(0, 8);
  }, [activeProducts, searchQuery]);

  const hasExactMatch = useMemo(() => {
    const q = normalizeTurkish(searchQuery);
    if (!q) return true;
    return activeProducts.some((p) => normalizeTurkish(p.name) === q);
  }, [activeProducts, searchQuery]);

  // Split unchecked vs checked and compute Estimated vs Actual Totals
  const { groupedUnchecked, checkedItems, actualTotal, estimatedTotal } = useMemo(() => {
    const unchecked: ListItem[] = [];
    const checked: ListItem[] = [];
    let actual = 0;
    let estimated = 0;

    for (const item of items ?? []) {
      const prod = productMap.get(item.productId);
      const linkedPrice = item.priceRecordId ? priceMap.get(item.priceRecordId) : undefined;

      if (linkedPrice) {
        actual += linkedPrice.totalPrice;
        estimated += linkedPrice.totalPrice;
      } else if (prod) {
        const prodPrices = pricesByProduct.get(prod.id) ?? [];
        const latest = [...prodPrices].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))[0];
        if (latest) {
          estimated += estimateItemCost(
            item.quantity,
            item.unit,
            prod.baseUnit,
            latest.normalizedUnitPrice,
            latest.totalPrice
          );
        }
      }

      if (item.isChecked === 1) {
        checked.push(item);
      } else {
        unchecked.push(item);
      }
    }

    // Group unchecked by Main Category sortOrder
    const groups = new Map<string, { catName: string; color: string; sortOrder: number; items: ListItem[] }>();
    for (const item of unchecked) {
      const prod = productMap.get(item.productId);
      const cat = prod ? categoryMap.get(prod.categoryId) : undefined;
      const key = cat?.id ?? '__OTHER__';
      const existing = groups.get(key) ?? {
        catName: cat?.name ?? 'Diğer',
        color: cat?.color ?? '#64748b',
        sortOrder: cat?.sortOrder ?? 9999,
        items: []
      };
      existing.items.push(item);
      groups.set(key, existing);
    }

    const sortedGroups = Array.from(groups.values()).sort((a, b) => a.sortOrder - b.sortOrder);

    return {
      groupedUnchecked: sortedGroups,
      checkedItems: checked,
      actualTotal: Math.round(actual * 100) / 100,
      estimatedTotal: Math.round(estimated * 100) / 100
    };
  }, [items, productMap, categoryMap, priceMap, pricesByProduct]);

  async function handleAddExistingProduct(prod: Product) {
    const qty = parseFloat(addQty.replace(',', '.'));
    await addListItem({
      listId,
      productId: prod.id,
      quantity: !isNaN(qty) && qty > 0 ? qty : 1,
      unit: prod.defaultInputUnit
    });
    setSearchQuery('');
    setAddQty('1');
    setShowDropdown(false);
  }

  async function handleCreateAndAddProduct(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = searchQuery.trim();
    if (!cleanName || !newCategoryId) return;
    const ts = nowIso();
    const defaultInputUnit: InputUnit =
      newBaseUnit === 'kg' ? 'kg' : newBaseUnit === 'l' ? 'l' : 'adet';

    const newProd: Product = {
      id: createId(),
      name: cleanName,
      categoryId: newCategoryId,
      subCategoryId: newSubCategoryId || null,
      baseUnit: newBaseUnit,
      defaultInputUnit,
      defaultBrand: null,
      barcode: null,
      notes: null,
      isArchived: 0,
      createdAt: ts,
      updatedAt: ts
    };
    await db.products.add(newProd);

    const qty = parseFloat(addQty.replace(',', '.'));
    await addListItem({
      listId,
      productId: newProd.id,
      quantity: !isNaN(qty) && qty > 0 ? qty : 1,
      unit: addUnit || defaultInputUnit
    });

    setSearchQuery('');
    setAddQty('1');
    setShowInlineCreate(false);
    setShowDropdown(false);
  }

  async function handleComplete(carryOver: boolean) {
    const nextList = await completeShoppingList(listId, carryOver);
    setShowCompleteModal(false);
    if (nextList) {
      onOpenList(nextList.id);
    } else {
      onBack();
    }
  }

  async function handleSaveTemplate() {
    await saveListAsTemplate(listId);
    setTemplateToast('Liste şablon olarak kaydedildi.');
    setTimeout(() => setTemplateToast(null), 2500);
  }

  if (!list) {
    return (
      <div className="p-8 text-center text-slate-500">
        Liste yükleniyor...
      </div>
    );
  }

  const isCompleted = list.status === 'completed';
  const uncheckedCount = (items ?? []).filter((i) => i.isChecked === 0).length;

  function renderItemRow(item: ListItem) {
    const prod = productMap.get(item.productId);
    if (!prod) return null;

    const linkedPrice = item.priceRecordId ? priceMap.get(item.priceRecordId) : undefined;
    const prodPrices = pricesByProduct.get(prod.id) ?? [];

    // Best recent store hint
    const storeRows = buildStoreComparison(prodPrices, storeMap);
    const bestRow = storeRows.find((r) => r.record.normalizedUnitPrice !== null);

    // Delta badge if price entered
    const delta = linkedPrice
      ? computePriceDeltaPercent(
          prodPrices,
          linkedPrice.normalizedUnitPrice,
          linkedPrice.storeId,
          linkedPrice.id
        )
      : null;

    const isChecked = item.isChecked === 1;

    return (
      <div
        key={item.id}
        className={`flex items-center gap-3 px-3.5 py-3 transition-colors ${
          isChecked ? 'bg-slate-50/70' : 'bg-white'
        }`}
      >
        {/* Big touch-friendly checkbox */}
        <button
          type="button"
          disabled={isCompleted}
          onClick={() => toggleListItemChecked(item.id)}
          className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all ${
            isChecked
              ? 'bg-emerald-600 border-emerald-600 text-white'
              : 'border-slate-300 hover:border-emerald-500 bg-white'
          }`}
          aria-label="Alındı işaretle"
        >
          {isChecked && <Check className="w-4 h-4 stroke-[3]" />}
        </button>

        {/* Product Info & Smart Hint */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => onOpenProduct(prod.id)}
              className={`font-semibold text-sm text-left hover:text-emerald-700 truncate ${
                isChecked ? 'line-through text-slate-400' : 'text-slate-900'
              }`}
            >
              {prod.name}
            </button>
            <span className="text-xs font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
              {item.quantity} {item.unit}
            </span>
          </div>

          {!isChecked && bestRow && (
            <p className="text-[11px] text-slate-500 mt-0.5 truncate">
              En uygun: <span className="font-medium text-slate-700">{bestRow.storeName}</span> ·{' '}
              <span className="text-emerald-700 font-semibold">
                {formatUnitPrice(bestRow.record.normalizedUnitPrice, prod.baseUnit)}
              </span>{' '}
              ({formatRelativeDate(bestRow.record.recordedAt)})
            </p>
          )}
        </div>

        {/* Price Action Button */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            disabled={isCompleted}
            onClick={() =>
              onOpenPriceSheet({
                source: 'purchase',
                productId: prod.id,
                listId: list.id,
                listItemId: item.id,
                defaultStoreId: list.defaultStoreId,
                initialQuantity: item.quantity,
                initialUnit: item.unit,
                existingRecord: linkedPrice ?? null
              })
            }
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold flex flex-col items-end transition-colors ${
              linkedPrice
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                : 'bg-slate-100 text-slate-600 hover:bg-emerald-50 hover:text-emerald-700'
            }`}
          >
            <span>{linkedPrice ? formatCurrency(linkedPrice.totalPrice) : '₺ Ekle'}</span>
            {delta && delta.deltaPercent !== null && (
              <span
                className={`text-[10px] inline-flex items-center gap-0.5 ${
                  delta.deltaPercent > 0
                    ? 'text-rose-600'
                    : delta.deltaPercent < 0
                      ? 'text-emerald-600'
                      : 'text-slate-500'
                }`}
              >
                {delta.deltaPercent > 0 ? (
                  <TrendingUp className="w-2.5 h-2.5" />
                ) : delta.deltaPercent < 0 ? (
                  <TrendingDown className="w-2.5 h-2.5" />
                ) : null}
                {delta.deltaPercent > 0 ? `+${delta.deltaPercent}%` : `${delta.deltaPercent}%`}
              </span>
            )}
          </button>

          {!isCompleted && (
            <button
              type="button"
              onClick={() => removeListItem(item.id)}
              className="p-1.5 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50"
              aria-label="Satırı sil"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Sticky Top Header & Budget Bar */}
      <div className="sticky top-0 z-20 -mx-3.5 sm:-mx-6 px-3.5 sm:px-6 py-3 bg-slate-50/95 backdrop-blur border-b border-slate-200 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onBack}
              className="p-2 -ml-1 rounded-xl hover:bg-slate-200/70 text-slate-700"
              aria-label="Geri"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-bold text-slate-900 truncate">{list.title}</h1>
              <p className="text-[11px] text-slate-500">
                {list.isTemplate === 1
                  ? 'Şablon Liste'
                  : isCompleted
                    ? 'Tamamlanmış Alışveriş'
                    : `${(items ?? []).length} ürün · ${checkedItems.length} alındı`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {wakeLock.isSupported && !isCompleted && (
              <button
                type="button"
                onClick={wakeLock.toggle}
                className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-colors ${
                  wakeLock.isActive
                    ? 'bg-amber-50 border-amber-300 text-amber-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
                title="Alışveriş sırasında ekranı açık tut"
              >
                <Sun className="w-4 h-4" />
                <span className="hidden sm:inline">{wakeLock.isActive ? 'Ekran Açık' : 'Ekran Kilidi'}</span>
              </button>
            )}

            {list.isTemplate === 0 && (
              <button
                type="button"
                onClick={handleSaveTemplate}
                className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                title="Şablon olarak kaydet"
              >
                <Bookmark className="w-4 h-4" />
              </button>
            )}

            {list.isTemplate === 0 && !isCompleted && (
              <button
                type="button"
                onClick={() => setShowCompleteModal(true)}
                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1"
              >
                <CheckCircle2 className="w-4 h-4" />
                Bitir
              </button>
            )}
          </div>
        </div>

        {/* Store Selector + Live Totals */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-white rounded-xl p-2.5 border border-slate-200">
          <div className="flex items-center gap-3 sm:gap-5">
            <div>
              <p className="text-[10px] uppercase font-semibold text-slate-400">Tahmini</p>
              <p className="text-sm font-bold text-slate-600">{formatCurrency(estimatedTotal)}</p>
            </div>
            <div className="h-7 w-px bg-slate-200" />
            <div>
              <p className="text-[10px] uppercase font-semibold text-emerald-600">Sepet Tutarı</p>
              <p
                className={`text-sm font-bold ${
                  list.budgetLimit && actualTotal > list.budgetLimit ? 'text-rose-600' : 'text-slate-900'
                }`}
              >
                {formatCurrency(actualTotal)}
                {list.budgetLimit && (
                  <span className="text-[11px] font-normal text-slate-400 ml-1">
                    / {formatCurrency(list.budgetLimit)}
                  </span>
                )}
              </p>
            </div>
          </div>

          {!isCompleted && (
            <select
              value={list.defaultStoreId ?? ''}
              onChange={(e) =>
                db.shopping_lists.update(list.id, {
                  defaultStoreId: e.target.value || null,
                  updatedAt: nowIso()
                })
              }
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 text-slate-700 max-w-[160px]"
              aria-label="Varsayılan market"
            >
              <option value="">Market: Karışık</option>
              {(stores ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {templateToast && (
        <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium text-center">
          {templateToast}
        </div>
      )}

      {/* Quick Product Add Bar */}
      {!isCompleted && (
        <div className="relative bg-white rounded-2xl border border-slate-200 p-3 shadow-sm">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onFocus={() => setShowDropdown(true)}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowDropdown(true);
                }}
                placeholder="Listeye ürün ekle veya ara..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <input
              type="number"
              inputMode="decimal"
              step="any"
              value={addQty}
              onChange={(e) => setAddQty(e.target.value)}
              className="w-16 px-2.5 py-2 rounded-xl border border-slate-200 text-sm text-center font-medium"
              aria-label="Miktar"
            />
          </div>

          {showDropdown && (searchQuery.trim().length > 0 || activeProducts.length > 0) && (
            <div className="mt-2 rounded-xl border border-slate-200 bg-white max-h-56 overflow-y-auto divide-y divide-slate-100">
              {searchMatches.map((p) => {
                const cat = categoryMap.get(p.categoryId);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleAddExistingProduct(p)}
                    className="w-full px-3 py-2.5 text-left hover:bg-emerald-50 flex items-center justify-between gap-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-800">{p.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {cat?.name ?? 'Genel'} · Varsayılan: {p.defaultInputUnit}
                      </p>
                    </div>
                    <Plus className="w-4 h-4 text-emerald-600 shrink-0" />
                  </button>
                );
              })}

              {searchQuery.trim() && !hasExactMatch && (
                <button
                  type="button"
                  onClick={() => {
                    setAddUnit('kg');
                    setShowInlineCreate(true);
                    setShowDropdown(false);
                  }}
                  className="w-full px-3 py-2.5 text-left text-sm font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Yeni ürün olarak ekle: "{searchQuery.trim()}"
                </button>
              )}

              <button
                type="button"
                onClick={() => setShowDropdown(false)}
                className="w-full py-1.5 text-center text-[11px] text-slate-400 hover:bg-slate-50"
              >
                Kapat
              </button>
            </div>
          )}
        </div>
      )}

      {/* Unchecked Items Grouped by Main Category (Aisle Order) */}
      {groupedUnchecked.length === 0 && checkedItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
          Liste henüz boş. Yukarıdaki kutudan mevcut ürünlerinizi seçebilir veya anında yeni ürün oluşturabilirsiniz.
        </div>
      ) : (
        <div className="space-y-3">
          {groupedUnchecked.map((group) => (
            <div key={group.catName} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: group.color }}
                />
                <h2 className="text-xs font-bold uppercase tracking-wide text-slate-600">
                  {group.catName}
                </h2>
                <span className="text-[11px] text-slate-400">({group.items.length})</span>
              </div>
              <div className="divide-y divide-slate-100">
                {group.items.map((item) => renderItemRow(item))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Collapsible Checked Section */}
      {checkedItems.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowCheckedSection((v) => !v)}
            className="w-full px-4 py-3 bg-slate-50 flex items-center justify-between text-xs font-bold text-slate-600"
          >
            <span>Alınanlar ({checkedItems.length})</span>
            {showCheckedSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showCheckedSection && (
            <div className="divide-y divide-slate-100">
              {checkedItems.map((item) => renderItemRow(item))}
            </div>
          )}
        </div>
      )}

      {/* Inline Create Product Modal */}
      <Modal
        open={showInlineCreate}
        onClose={() => setShowInlineCreate(false)}
        title={`Yeni Ürün: ${searchQuery.trim()}`}
        subtitle="Ürün hem kataloğunuza hem de bu listeye eklenecek"
      >
        <form onSubmit={handleCreateAndAddProduct} className="space-y-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Ana Tür</label>
            <select
              value={newCategoryId}
              onChange={(e) => {
                setNewCategoryId(e.target.value);
                setNewSubCategoryId('');
              }}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
            >
              {activeMainCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Alt Tür (Opsiyonel)</label>
            <select
              value={newSubCategoryId}
              onChange={(e) => setNewSubCategoryId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
            >
              <option value="">Seçilmedi</option>
              {activeSubCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Kıyas Temel Birimi</label>
              <select
                value={newBaseUnit}
                onChange={(e) => {
                  const bu = e.target.value as BaseUnit;
                  setNewBaseUnit(bu);
                  setAddUnit(bu === 'kg' ? 'kg' : bu === 'l' ? 'l' : 'adet');
                }}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
              >
                {BASE_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Listeye Eklenecek Birim</label>
              <select
                value={addUnit}
                onChange={(e) => setAddUnit(e.target.value as InputUnit)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
              >
                {INPUT_UNITS.map((u) => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm"
          >
            Ürünü Oluştur ve Listeye Ekle
          </button>
        </form>
      </Modal>

      {/* Complete Shopping Modal */}
      <Modal
        open={showCompleteModal}
        onClose={() => setShowCompleteModal(false)}
        title="Alışverişi Tamamla"
      >
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex justify-between items-center">
            <span className="text-xs text-slate-600">Gerçekleşen Sepet Tutarı</span>
            <span className="text-lg font-bold text-emerald-700">{formatCurrency(actualTotal)}</span>
          </div>

          {uncheckedCount > 0 ? (
            <p className="text-sm text-slate-700">
              Listede henüz alınmamış (üstü çizilmemiş) <strong>{uncheckedCount} ürün</strong> var. Bu ürünleri yeni bir aktif listeye devretmek ister misiniz?
            </p>
          ) : (
            <p className="text-sm text-slate-700">
              Tüm ürünler alındı olarak işaretlendi. Liste geçmiş alışverişler arşivine kaldırılacak.
            </p>
          )}

          <div className="flex flex-col gap-2">
            {uncheckedCount > 0 && (
              <button
                type="button"
                onClick={() => handleComplete(true)}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm"
              >
                Tamamla & Kalan {uncheckedCount} Ürünü Yeni Listeye Aktar
              </button>
            )}
            <button
              type="button"
              onClick={() => handleComplete(false)}
              className={`w-full py-2.5 rounded-xl font-semibold text-sm ${
                uncheckedCount > 0
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              Sadece Alışverişi Tamamla
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
