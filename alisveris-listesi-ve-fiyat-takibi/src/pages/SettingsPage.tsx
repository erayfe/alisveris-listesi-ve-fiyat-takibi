import React, { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Database,
  Download,
  FileSpreadsheet,
  FolderTree,
  Plus,
  RotateCcw,
  ShieldCheck,
  Store as StoreIcon,
  Upload
} from 'lucide-react';
import { db, createId, nowIso } from '../db/database';
import type { BinaryFlag, Category } from '../types/models';
import {
  exportBackupJSON,
  exportPricesCSV,
  importBackupJSON
} from '../services/backupService';
import { formatDateTimeShort } from '../services/unitConverter';
import { Modal } from '../components/common/Modal';

interface SettingsPageProps {
  storageStatus: 'unknown' | 'persisted' | 'standard';
}

const COLOR_PALETTE = [
  '#16a34a',
  '#2563eb',
  '#dc2626',
  '#d97706',
  '#0891b2',
  '#9333ea',
  '#0d9488',
  '#e11d48',
  '#475569'
];

export const SettingsPage: React.FC<SettingsPageProps> = ({ storageStatus }) => {
  const [section, setSection] = useState<'categories' | 'stores' | 'backup'>('categories');
  const [showArchived, setShowArchived] = useState(false);

  // Category creation state
  const [newMainCatName, setNewMainCatName] = useState('');
  const [newMainCatColor, setNewMainCatColor] = useState(COLOR_PALETTE[0]);
  const [subInputs, setSubInputs] = useState<Record<string, string>>({});

  // Store creation state
  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreBranch, setNewStoreBranch] = useState('');

  // Backup import state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingImportText, setPendingImportText] = useState<string | null>(null);
  const [backupMessage, setBackupMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const stores = useLiveQuery(() => db.stores.orderBy('name').toArray(), []);
  const lastBackupMeta = useLiveQuery(() => db.app_meta.get('lastBackupAt'), []);

  const mainCategories = useMemo(() => {
    return (categories ?? [])
      .filter((c) => c.parentId === null && (showArchived || c.isArchived === 0))
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }, [categories, showArchived]);

  const subsByParent = useMemo(() => {
    const map = new Map<string, Category[]>();
    for (const c of categories ?? []) {
      if (!c.parentId) continue;
      if (!showArchived && c.isArchived === 1) continue;
      const arr = map.get(c.parentId) ?? [];
      arr.push(c);
      map.set(c.parentId, arr);
    }
    map.forEach((arr) => arr.sort((a, b) => a.sortOrder - b.sortOrder));
    return map;
  }, [categories, showArchived]);

  const visibleStores = useMemo(
    () => (stores ?? []).filter((s) => showArchived || s.isArchived === 0),
    [stores, showArchived]
  );

  async function handleAddMainCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newMainCatName.trim()) return;
    const ts = nowIso();
    const maxOrder = mainCategories.reduce((m, c) => Math.max(m, c.sortOrder), -1);
    await db.categories.add({
      id: createId(),
      parentId: null,
      name: newMainCatName.trim(),
      sortOrder: maxOrder + 1,
      color: newMainCatColor,
      icon: null,
      isArchived: 0,
      createdAt: ts,
      updatedAt: ts
    });
    setNewMainCatName('');
  }

  async function handleAddSubCategory(parent: Category) {
    const text = (subInputs[parent.id] ?? '').trim();
    if (!text) return;
    const ts = nowIso();
    const subs = subsByParent.get(parent.id) ?? [];
    await db.categories.add({
      id: createId(),
      parentId: parent.id,
      name: text,
      sortOrder: subs.length,
      color: parent.color,
      icon: null,
      isArchived: 0,
      createdAt: ts,
      updatedAt: ts
    });
    setSubInputs((prev) => ({ ...prev, [parent.id]: '' }));
  }

  async function handleMoveMainCategory(index: number, direction: -1 | 1) {
    const targetIdx = index + direction;
    if (targetIdx < 0 || targetIdx >= mainCategories.length) return;
    const a = mainCategories[index];
    const b = mainCategories[targetIdx];
    const ts = nowIso();
    await db.transaction('rw', db.categories, async () => {
      await db.categories.update(a.id, { sortOrder: b.sortOrder, updatedAt: ts });
      await db.categories.update(b.id, { sortOrder: a.sortOrder, updatedAt: ts });
    });
  }

  async function toggleArchiveCategory(cat: Category) {
    await db.categories.update(cat.id, {
      isArchived: (cat.isArchived === 1 ? 0 : 1) as BinaryFlag,
      updatedAt: nowIso()
    });
  }

  async function handleAddStore(e: React.FormEvent) {
    e.preventDefault();
    if (!newStoreName.trim()) return;
    const ts = nowIso();
    await db.stores.add({
      id: createId(),
      name: newStoreName.trim(),
      branch: newStoreBranch.trim() || null,
      isArchived: 0,
      createdAt: ts,
      updatedAt: ts
    });
    setNewStoreName('');
    setNewStoreBranch('');
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setPendingImportText(text);
    e.target.value = '';
  }

  async function executeImport(mode: 'replace' | 'merge') {
    if (!pendingImportText) return;
    try {
      const res = await importBackupJSON(pendingImportText, mode);
      setBackupMessage({
        type: 'ok',
        text: `Yedek başarıyla yüklendi (${res.counts.products} ürün, ${res.counts.prices} fiyat kaydı).`
      });
    } catch (err) {
      setBackupMessage({
        type: 'err',
        text: err instanceof Error ? err.message : 'Yedek yüklenemedi.'
      });
    } finally {
      setPendingImportText(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Yönetim & Veri Güvenliği</h1>
        <p className="text-xs text-slate-500">Tür/Alt Tür reyon sırası, market listesi ve yerel yedekleme</p>
      </div>

      {/* Section Switcher */}
      <div className="grid grid-cols-3 p-1 rounded-xl bg-slate-200/70 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setSection('categories')}
          className={`py-2 rounded-lg flex items-center justify-center gap-1 ${
            section === 'categories' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
          }`}
        >
          <FolderTree className="w-3.5 h-3.5" />
          Türler
        </button>
        <button
          type="button"
          onClick={() => setSection('stores')}
          className={`py-2 rounded-lg flex items-center justify-center gap-1 ${
            section === 'stores' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
          }`}
        >
          <StoreIcon className="w-3.5 h-3.5" />
          Marketler
        </button>
        <button
          type="button"
          onClick={() => setSection('backup')}
          className={`py-2 rounded-lg flex items-center justify-center gap-1 ${
            section === 'backup' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          Yedekleme
        </button>
      </div>

      {section !== 'backup' && (
        <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="w-3.5 h-3.5 accent-emerald-600 rounded"
          />
          Arşivlenenleri göster
        </label>
      )}

      {/* CATEGORIES SECTION */}
      {section === 'categories' && (
        <div className="space-y-3">
          <form
            onSubmit={handleAddMainCategory}
            className="bg-white rounded-2xl border border-slate-200 p-3.5 space-y-2.5"
          >
            <p className="text-xs font-bold text-slate-700">Yeni Ana Tür Ekle</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={newMainCatName}
                onChange={(e) => setNewMainCatName(e.target.value)}
                placeholder="Örn. Dondurulmuş Gıda"
                className="flex-1 px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Ekle
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              {COLOR_PALETTE.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setNewMainCatColor(col)}
                  className={`w-6 h-6 rounded-full transition-transform ${
                    newMainCatColor === col ? 'ring-2 ring-offset-2 ring-slate-900 scale-110' : ''
                  }`}
                  style={{ backgroundColor: col }}
                  aria-label="Renk seç"
                />
              ))}
            </div>
          </form>

          <p className="text-[11px] text-slate-500">
            Ana türlerin sırası, alışveriş listelerindeki reyon gruplama sırasını belirler.
          </p>

          <div className="space-y-2.5">
            {mainCategories.map((cat, idx) => {
              const subs = subsByParent.get(cat.id) ?? [];
              return (
                <div
                  key={cat.id}
                  className={`bg-white rounded-2xl border border-slate-200 p-3.5 space-y-2.5 ${
                    cat.isArchived === 1 ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: cat.color ?? '#64748b' }}
                      />
                      <span className="font-bold text-sm text-slate-900 truncate">{cat.name}</span>
                      {cat.isArchived === 1 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                          Arşivli
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveMainCategory(idx, -1)}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                        title="Yukarı taşı"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === mainCategories.length - 1}
                        onClick={() => handleMoveMainCategory(idx, 1)}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30"
                        title="Aşağı taşı"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleArchiveCategory(cat)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                        title={cat.isArchived === 1 ? 'Geri Al' : 'Arşivle'}
                      >
                        {cat.isArchived === 1 ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Subcategories */}
                  <div className="flex flex-wrap gap-1.5">
                    {subs.map((sub) => (
                      <span
                        key={sub.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-xs text-slate-700"
                      >
                        {sub.name}
                        <button
                          type="button"
                          onClick={() => toggleArchiveCategory(sub)}
                          className="text-slate-400 hover:text-rose-600 ml-0.5"
                          title={sub.isArchived === 1 ? 'Geri Al' : 'Arşivle'}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>

                  {cat.isArchived === 0 && (
                    <div className="flex gap-1.5 pt-1">
                      <input
                        type="text"
                        value={subInputs[cat.id] ?? ''}
                        onChange={(e) =>
                          setSubInputs((prev) => ({ ...prev, [cat.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddSubCategory(cat);
                          }
                        }}
                        placeholder="Alt tür ekle..."
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddSubCategory(cat)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-xs font-semibold text-slate-600"
                      >
                        + Ekle
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* STORES SECTION */}
      {section === 'stores' && (
        <div className="space-y-3">
          <form
            onSubmit={handleAddStore}
            className="bg-white rounded-2xl border border-slate-200 p-3.5 space-y-2.5"
          >
            <p className="text-xs font-bold text-slate-700">Yeni Market / Satıcı Ekle</p>
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <input
                type="text"
                required
                value={newStoreName}
                onChange={(e) => setNewStoreName(e.target.value)}
                placeholder="Market adı (örn. File, Kasap)"
                className="sm:col-span-6 px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
              <input
                type="text"
                value={newStoreBranch}
                onChange={(e) => setNewStoreBranch(e.target.value)}
                placeholder="Şube / Semt (opsiyonel)"
                className="sm:col-span-4 px-3 py-2 rounded-xl border border-slate-300 text-sm"
              />
              <button
                type="submit"
                className="sm:col-span-2 py-2 px-3 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
              >
                Ekle
              </button>
            </div>
          </form>

          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {visibleStores.map((st) => (
              <div
                key={st.id}
                className={`px-4 py-3 flex items-center justify-between gap-2 ${
                  st.isArchived === 1 ? 'opacity-60' : ''
                }`}
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{st.name}</p>
                  {st.branch && <p className="text-xs text-slate-500">{st.branch}</p>}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    db.stores.update(st.id, {
                      isArchived: (st.isArchived === 1 ? 0 : 1) as BinaryFlag,
                      updatedAt: nowIso()
                    })
                  }
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                  title={st.isArchived === 1 ? 'Geri Al' : 'Arşivle'}
                >
                  {st.isArchived === 1 ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BACKUP CENTER SECTION */}
      {section === 'backup' && (
        <div className="space-y-3">
          {backupMessage && (
            <div
              className={`p-3 rounded-xl border text-xs font-medium ${
                backupMessage.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-rose-50 border-rose-200 text-rose-700'
              }`}
            >
              {backupMessage.text}
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Yerel Depolama Durumu</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Son Yedekleme:{' '}
                  <strong>
                    {typeof lastBackupMeta?.value === 'string'
                      ? formatDateTimeShort(lastBackupMeta.value)
                      : 'Henüz yedek alınmadı'}
                  </strong>
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                  storageStatus === 'persisted'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                {storageStatus === 'persisted' ? 'Kalıcı Depolama Aktif' : 'Standart Depolama'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              <button
                type="button"
                onClick={async () => {
                  await exportBackupJSON();
                  setBackupMessage({ type: 'ok', text: 'JSON yedeği cihazınıza indirildi.' });
                }}
                className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                JSON Yedek İndir
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                JSON Yedek Yükle
              </button>

              <button
                type="button"
                onClick={exportPricesCSV}
                className="py-3 px-4 rounded-xl bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 text-xs font-semibold flex items-center justify-center gap-2"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                CSV Dışa Aktar (Excel)
              </button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleFileSelected}
              className="hidden"
            />
          </div>
        </div>
      )}

      {/* Import Mode Confirmation Modal */}
      <Modal
        open={Boolean(pendingImportText)}
        onClose={() => setPendingImportText(null)}
        title="Yedek Yükleme Yöntemi"
        subtitle="Yedek dosyası doğrulandıktan sonra yerel veritabanına işlenecektir."
      >
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => executeImport('merge')}
            className="w-full p-3.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-left"
          >
            <p className="text-sm font-bold text-emerald-900">UUID Bazlı Birleştir (Önerilen)</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              Mevcut kayıtlarınızı korur, yedekteki yeni veya güncellenmiş kayıtları ekler.
            </p>
          </button>

          <button
            type="button"
            onClick={() => executeImport('replace')}
            className="w-full p-3.5 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-left"
          >
            <p className="text-sm font-bold text-rose-900">Mevcut Verilerin Üzerine Yaz</p>
            <p className="text-xs text-rose-700 mt-0.5">
              Cihazdaki tüm mevcut kayıtları siler ve yalnızca yedekteki verileri yükler.
            </p>
          </button>
        </div>
      </Modal>
    </div>
  );
};
