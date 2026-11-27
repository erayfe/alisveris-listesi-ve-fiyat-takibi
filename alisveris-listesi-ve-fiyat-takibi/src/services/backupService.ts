import { z } from 'zod';
import { db, nowIso, SCHEMA_VERSION } from '../db/database';
import type { BackupEnvelope } from '../types/models';

const BinaryFlagSchema = z.union([z.literal(0), z.literal(1)]);
const BaseUnitSchema = z.enum(['kg', 'l', 'adet']);
const InputUnitSchema = z.enum(['kg', 'g', 'l', 'ml', 'adet', 'paket']);

const BackupSchema = z.object({
  app: z.literal('market-tracker'),
  schemaVersion: z.number().int().min(1),
  exportedAt: z.string(),
  data: z.object({
    categories: z.array(
      z.object({
        id: z.string(),
        parentId: z.string().nullable(),
        name: z.string(),
        sortOrder: z.number(),
        color: z.string().nullable(),
        icon: z.string().nullable(),
        isArchived: BinaryFlagSchema,
        createdAt: z.string(),
        updatedAt: z.string()
      })
    ),
    stores: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        branch: z.string().nullable(),
        isArchived: BinaryFlagSchema,
        createdAt: z.string(),
        updatedAt: z.string()
      })
    ),
    products: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        categoryId: z.string(),
        subCategoryId: z.string().nullable(),
        baseUnit: BaseUnitSchema,
        defaultInputUnit: InputUnitSchema,
        defaultBrand: z.string().nullable(),
        barcode: z.string().nullable(),
        notes: z.string().nullable(),
        isArchived: BinaryFlagSchema,
        createdAt: z.string(),
        updatedAt: z.string()
      })
    ),
    shopping_lists: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        status: z.enum(['active', 'completed', 'archived']),
        isTemplate: BinaryFlagSchema,
        defaultStoreId: z.string().nullable(),
        budgetLimit: z.number().nullable(),
        completedAt: z.string().nullable(),
        createdAt: z.string(),
        updatedAt: z.string()
      })
    ),
    list_items: z.array(
      z.object({
        id: z.string(),
        listId: z.string(),
        productId: z.string(),
        quantity: z.number(),
        unit: InputUnitSchema,
        isChecked: BinaryFlagSchema,
        checkedAt: z.string().nullable(),
        priceRecordId: z.string().nullable(),
        note: z.string().nullable(),
        sortOrder: z.number(),
        createdAt: z.string(),
        updatedAt: z.string()
      })
    ),
    price_records: z.array(
      z.object({
        id: z.string(),
        productId: z.string(),
        storeId: z.string().nullable(),
        source: z.enum(['purchase', 'observation']),
        listId: z.string().nullable(),
        listItemId: z.string().nullable(),
        brand: z.string().nullable(),
        packageQuantity: z.number(),
        packageUnit: InputUnitSchema,
        totalPrice: z.number(),
        unitPrice: z.number(),
        normalizedBaseUnit: BaseUnitSchema,
        normalizedUnitPrice: z.number().nullable(),
        isPromo: BinaryFlagSchema,
        promoNote: z.string().nullable(),
        currency: z.string(),
        recordedAt: z.string(),
        createdAt: z.string(),
        updatedAt: z.string()
      })
    ),
    app_meta: z.array(
      z.object({
        key: z.string(),
        value: z.unknown()
      })
    )
  })
});

export async function exportBackupJSON(): Promise<void> {
  const ts = nowIso();
  const [categories, stores, products, shopping_lists, list_items, price_records, app_meta] =
    await Promise.all([
      db.categories.toArray(),
      db.stores.toArray(),
      db.products.toArray(),
      db.shopping_lists.toArray(),
      db.list_items.toArray(),
      db.price_records.toArray(),
      db.app_meta.toArray()
    ]);

  const envelope: BackupEnvelope = {
    app: 'market-tracker',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: ts,
    data: {
      categories,
      stores,
      products,
      shopping_lists,
      list_items,
      price_records,
      app_meta
    }
  };

  await db.app_meta.put({ key: 'lastBackupAt', value: ts });

  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json;charset=utf-8' });
  const datePart = ts.slice(0, 10);
  triggerDownload(blob, `sepet-fiyat-yedek-${datePart}.json`);
}

export async function importBackupJSON(
  jsonText: string,
  mode: 'replace' | 'merge'
): Promise<{ counts: Record<string, number> }> {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new Error('Geçersiz JSON dosyası.');
  }

  const parsed = BackupSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error('Yedek dosya şeması bu uygulama ile uyumlu değil veya bozulmuş.');
  }

  const d = parsed.data.data;

  await db.transaction(
    'rw',
    [db.categories, db.stores, db.products, db.shopping_lists, db.list_items, db.price_records, db.app_meta],
    async () => {
      if (mode === 'replace') {
        await Promise.all([
          db.categories.clear(),
          db.stores.clear(),
          db.products.clear(),
          db.shopping_lists.clear(),
          db.list_items.clear(),
          db.price_records.clear(),
          db.app_meta.clear()
        ]);
      }

      if (d.categories.length) await db.categories.bulkPut(d.categories);
      if (d.stores.length) await db.stores.bulkPut(d.stores);
      if (d.products.length) await db.products.bulkPut(d.products);
      if (d.shopping_lists.length) await db.shopping_lists.bulkPut(d.shopping_lists);
      if (d.list_items.length) await db.list_items.bulkPut(d.list_items);
      if (d.price_records.length) await db.price_records.bulkPut(d.price_records);
      if (d.app_meta.length) await db.app_meta.bulkPut(d.app_meta.map((m) => ({ key: m.key, value: m.value ?? null })));

      await db.app_meta.put({ key: 'initialSeeded', value: true });
      await db.app_meta.put({ key: 'lastBackupAt', value: nowIso() });
    }
  );

  return {
    counts: {
      categories: d.categories.length,
      stores: d.stores.length,
      products: d.products.length,
      lists: d.shopping_lists.length,
      prices: d.price_records.length
    }
  };
}

export async function exportPricesCSV(): Promise<void> {
  const [records, products, categories, stores] = await Promise.all([
    db.price_records.orderBy('recordedAt').reverse().toArray(),
    db.products.toArray(),
    db.categories.toArray(),
    db.stores.toArray()
  ]);

  const productMap = new Map(products.map((p) => [p.id, p]));
  const catMap = new Map(categories.map((c) => [c.id, c]));
  const storeMap = new Map(stores.map((s) => [s.id, s]));

  const headers = [
    'Tarih',
    'Kayıt Türü',
    'Ana Tür',
    'Alt Tür',
    'Ürün',
    'Marka',
    'Market',
    'Miktar',
    'Birim',
    'Toplam Tutar (TL)',
    'Normalize Birim Fiyat',
    'Temel Birim',
    'Kampanya',
    'Kampanya Notu'
  ];

  const escapeCsv = (val: unknown): string => {
    const str = val === null || val === undefined ? '' : String(val);
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines: string[] = [headers.join(';')];

  for (const r of records) {
    const prod = productMap.get(r.productId);
    const mainCat = prod ? catMap.get(prod.categoryId) : undefined;
    const subCat = prod?.subCategoryId ? catMap.get(prod.subCategoryId) : undefined;
    const store = r.storeId ? storeMap.get(r.storeId) : undefined;

    lines.push(
      [
        new Date(r.recordedAt).toLocaleString('tr-TR'),
        r.source === 'purchase' ? 'Satın Alma' : 'Fiyat Gözlemi',
        mainCat?.name ?? '',
        subCat?.name ?? '',
        prod?.name ?? 'Silinmiş Ürün',
        r.brand ?? '',
        store ? (store.branch ? `${store.name} (${store.branch})` : store.name) : '',
        r.packageQuantity.toString().replace('.', ','),
        r.packageUnit,
        r.totalPrice.toFixed(2).replace('.', ','),
        r.normalizedUnitPrice !== null ? r.normalizedUnitPrice.toFixed(2).replace('.', ',') : '',
        r.normalizedBaseUnit,
        r.isPromo === 1 ? 'Evet' : 'Hayır',
        r.promoNote ?? ''
      ]
        .map(escapeCsv)
        .join(';')
    );
  }

  // UTF-8 BOM for proper Turkish characters in Microsoft Excel
  const bom = '\uFEFF';
  const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, `fiyat-gecmisi-${nowIso().slice(0, 10)}.csv`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
