import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CheckCircle2,
  ClipboardList,
  Copy,
  Plus,
  Store as StoreIcon,
  Trash2,
  ChevronRight,
  Bookmark
} from 'lucide-react';
import { db } from '../db/database';
import {
  createListFromTemplate,
  createShoppingList,
  deleteShoppingList
} from '../services/listService';
import { formatCurrency, formatRelativeDate } from '../services/unitConverter';
import { Modal } from '../components/common/Modal';

interface ListsPageProps {
  onOpenList: (listId: string) => void;
}

export const ListsPage: React.FC<ListsPageProps> = ({ onOpenList }) => {
  const [subTab, setSubTab] = useState<'active' | 'templates' | 'completed'>('active');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [newStoreId, setNewStoreId] = useState('');
  const [newBudget, setNewBudget] = useState('');
  const [newIsTemplate, setNewIsTemplate] = useState(false);

  const lists = useLiveQuery(() => db.shopping_lists.orderBy('createdAt').reverse().toArray(), []);
  const allItems = useLiveQuery(() => db.list_items.toArray(), []);
  const allPrices = useLiveQuery(() => db.price_records.toArray(), []);
  const stores = useLiveQuery(() => db.stores.where('isArchived').equals(0).sortBy('name'), []);

  const storeMap = useMemo(() => new Map((stores ?? []).map((s) => [s.id, s])), [stores]);
  const priceMap = useMemo(() => new Map((allPrices ?? []).map((p) => [p.id, p])), [allPrices]);

  const listStatsMap = useMemo(() => {
    const map = new Map<string, { total: number; checked: number; spent: number }>();
    for (const item of allItems ?? []) {
      const curr = map.get(item.listId) ?? { total: 0, checked: 0, spent: 0 };
      curr.total += 1;
      if (item.isChecked === 1) curr.checked += 1;
      if (item.priceRecordId) {
        const pr = priceMap.get(item.priceRecordId);
        if (pr) curr.spent += pr.totalPrice;
      }
      map.set(item.listId, curr);
    }
    return map;
  }, [allItems, priceMap]);

  const filteredLists = useMemo(() => {
    const arr = lists ?? [];
    if (subTab === 'templates') return arr.filter((l) => l.isTemplate === 1);
    if (subTab === 'completed') return arr.filter((l) => l.isTemplate === 0 && l.status === 'completed');
    return arr.filter((l) => l.isTemplate === 0 && l.status === 'active');
  }, [lists, subTab]);

  async function handleCreateList(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const created = await createShoppingList({
      title: newTitle,
      defaultStoreId: newStoreId || null,
      budgetLimit: newBudget ? parseFloat(newBudget.replace(',', '.')) : null,
      isTemplate: newIsTemplate
    });
    setNewTitle('');
    setNewStoreId('');
    setNewBudget('');
    setNewIsTemplate(false);
    setShowCreateModal(false);
    onOpenList(created.id);
  }

  async function handleStartFromTemplate(templateId: string) {
    const created = await createListFromTemplate(templateId);
    if (created) {
      onOpenList(created.id);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Alışveriş Listeleri</h1>
          <p className="text-xs text-slate-500">Aktif sepetler, tekrar eden şablonlar ve geçmiş</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setNewIsTemplate(subTab === 'templates');
            setShowCreateModal(true);
          }}
          className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold flex items-center gap-1.5 shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Yeni Liste
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="grid grid-cols-3 p-1 rounded-xl bg-slate-200/70 text-xs font-semibold">
        {(
          [
            { id: 'active', label: 'Aktif' },
            { id: 'templates', label: 'Şablonlar' },
            { id: 'completed', label: 'Tamamlanan' }
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`py-2 rounded-lg transition-all ${
              subTab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* List Cards */}
      {filteredLists.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
            {subTab === 'templates' ? <Bookmark className="w-6 h-6" /> : <ClipboardList className="w-6 h-6" />}
          </div>
          <div>
            <p className="font-semibold text-slate-800">
              {subTab === 'active'
                ? 'Henüz aktif alışveriş listeniz yok'
                : subTab === 'templates'
                  ? 'Henüz şablon liste kaydedilmedi'
                  : 'Tamamlanan alışveriş bulunmuyor'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              {subTab === 'active'
                ? 'Yeni bir liste oluşturup ürünlerinizi reyon sırasıyla takip etmeye başlayın.'
                : subTab === 'templates'
                  ? 'Her hafta aldığınız ürünleri şablon yaparak tek tıkla yeni liste başlatabilirsiniz.'
                  : 'Bitirdiğiniz alışverişler burada tarih ve toplam harcama ile arşivlenir.'}
            </p>
          </div>
          {subTab !== 'completed' && (
            <button
              type="button"
              onClick={() => {
                setNewIsTemplate(subTab === 'templates');
                setShowCreateModal(true);
              }}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
            >
              {subTab === 'templates' ? 'Şablon Oluştur' : 'İlk Listeyi Oluştur'}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredLists.map((list) => {
            const st = listStatsMap.get(list.id) ?? { total: 0, checked: 0, spent: 0 };
            const pct = st.total > 0 ? Math.round((st.checked / st.total) * 100) : 0;
            const store = list.defaultStoreId ? storeMap.get(list.defaultStoreId) : null;

            return (
              <div
                key={list.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 hover:border-emerald-300 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => onOpenList(list.id)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900 truncate">{list.title}</h3>
                      {list.status === 'completed' && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-500">
                      <span>{st.total} ürün</span>
                      {store && (
                        <span className="inline-flex items-center gap-1">
                          <StoreIcon className="w-3.5 h-3.5" />
                          {store.name}
                        </span>
                      )}
                      <span>{formatRelativeDate(list.completedAt ?? list.updatedAt)}</span>
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {list.isTemplate === 1 && (
                      <button
                        type="button"
                        onClick={() => handleStartFromTemplate(list.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold flex items-center gap-1"
                        title="Bu şablondan aktif liste başlat"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        Başlat
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm(`"${list.title}" listesini silmek istiyor musunuz?`)) {
                          deleteShoppingList(list.id);
                        }
                      }}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                      title="Listeyi sil"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenList(list.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* Progress & Total */}
                {list.isTemplate === 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                        <span>Alınan: {st.checked}/{st.total}</span>
                        <span>%{pct}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    {st.spent > 0 && (
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-slate-400 uppercase font-semibold">Sepet</p>
                        <p className="text-sm font-bold text-slate-900">{formatCurrency(st.spent)}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={newIsTemplate ? 'Yeni Şablon Liste' : 'Yeni Alışveriş Listesi'}
      >
        <form onSubmit={handleCreateList} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Liste Adı</label>
            <input
              type="text"
              required
              autoFocus
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={newIsTemplate ? 'Örn. Haftalık Temel İhtiyaçlar' : 'Örn. Hafta Sonu Market'}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Varsayılan Market (Opsiyonel)
            </label>
            <select
              value={newStoreId}
              onChange={(e) => setNewStoreId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm bg-white"
            >
              <option value="">Karışık / Belirtilmedi</option>
              {(stores ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.branch ? `${s.name} (${s.branch})` : s.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Hedef Bütçe Limiti (₺, Opsiyonel)
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={newBudget}
              onChange={(e) => setNewBudget(e.target.value)}
              placeholder="Örn. 1500"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm"
            />
          </div>

          <label className="flex items-center gap-2.5 text-xs font-medium text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={newIsTemplate}
              onChange={(e) => setNewIsTemplate(e.target.checked)}
              className="w-4 h-4 accent-emerald-600 rounded"
            />
            Tekrar kullanılabilir şablon olarak kaydet
          </label>

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm"
          >
            Oluştur ve Aç
          </button>
        </form>
      </Modal>
    </div>
  );
};
