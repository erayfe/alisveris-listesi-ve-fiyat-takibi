import { db, createId, nowIso, SCHEMA_VERSION } from './database';
import type { Category, Store } from '../types/models';

interface SeedCategoryDef {
  name: string;
  color: string;
  subs: string[];
}

const DEFAULT_CATEGORIES: SeedCategoryDef[] = [
  { name: 'Manav', color: '#16a34a', subs: ['Sebze', 'Meyve', 'Yeşillik'] },
  { name: 'Süt & Kahvaltılık', color: '#2563eb', subs: ['Peynir', 'Süt & Yoğurt', 'Yumurta', 'Zeytin & Reçel'] },
  { name: 'Et, Tavuk & Balık', color: '#dc2626', subs: ['Tavuk', 'Kırmızı Et', 'Şarküteri', 'Balık'] },
  { name: 'Temel Gıda', color: '#d97706', subs: ['Bakliyat & Pirinç', 'Makarna & Un', 'Yağ & Sos', 'Ekmek & Fırın'] },
  { name: 'İçecek', color: '#0891b2', subs: ['Su & Maden Suyu', 'Çay & Kahve', 'Soğuk İçecek'] },
  { name: 'Atıştırmalık', color: '#9333ea', subs: ['Kuruyemiş', 'Bisküvi & Çikolata'] },
  { name: 'Temizlik & Kişisel Bakım', color: '#0d9488', subs: ['Ev Temizliği', 'Kağıt Ürünleri', 'Kişisel Bakım'] }
];

const DEFAULT_STORES = ['BİM', 'A101', 'ŞOK', 'Migros', 'Yerel Market / Manav'];

export async function ensureInitialSeed(): Promise<void> {
  const seeded = await db.app_meta.get('initialSeeded');
  if (seeded?.value === true) return;

  const existingCats = await db.categories.count();
  if (existingCats === 0) {
    const ts = nowIso();
    const categoriesToAdd: Category[] = [];

    DEFAULT_CATEGORIES.forEach((cat, idx) => {
      const parentId = createId();
      categoriesToAdd.push({
        id: parentId,
        parentId: null,
        name: cat.name,
        sortOrder: idx,
        color: cat.color,
        icon: null,
        isArchived: 0,
        createdAt: ts,
        updatedAt: ts
      });

      cat.subs.forEach((subName, subIdx) => {
        categoriesToAdd.push({
          id: createId(),
          parentId,
          name: subName,
          sortOrder: subIdx,
          color: cat.color,
          icon: null,
          isArchived: 0,
          createdAt: ts,
          updatedAt: ts
        });
      });
    });

    await db.categories.bulkAdd(categoriesToAdd);
  }

  const existingStores = await db.stores.count();
  if (existingStores === 0) {
    const ts = nowIso();
    const storesToAdd: Store[] = DEFAULT_STORES.map((name) => ({
      id: createId(),
      name,
      branch: null,
      isArchived: 0,
      createdAt: ts,
      updatedAt: ts
    }));
    await db.stores.bulkAdd(storesToAdd);
  }

  await db.app_meta.bulkPut([
    { key: 'initialSeeded', value: true },
    { key: 'schemaVersion', value: SCHEMA_VERSION },
    { key: 'defaultCurrency', value: 'TRY' }
  ]);
}
