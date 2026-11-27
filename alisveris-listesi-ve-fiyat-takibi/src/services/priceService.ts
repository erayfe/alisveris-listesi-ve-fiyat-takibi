import { db, createId, nowIso } from '../db/database';
import type {
  BinaryFlag,
  InputUnit,
  PriceRecord,
  PriceSource,
  StoreComparisonRow
} from '../types/models';
import { calculatePriceMetrics } from './unitConverter';

export interface RecordPriceInput {
  existingRecordId?: string | null;
  productId: string;
  storeId: string | null;
  source: PriceSource;
  listId?: string | null;
  listItemId?: string | null;
  brand?: string | null;
  mode: 'total' | 'unit';
  amount: number;
  packageQuantity: number;
  packageUnit: InputUnit;
  isPromo?: boolean;
  promoNote?: string | null;
  recordedAt?: string;
  autoCheckListItem?: boolean;
}

export async function recordPrice(input: RecordPriceInput): Promise<PriceRecord> {
  const product = await db.products.get(input.productId);
  if (!product) {
    throw new Error('Ürün bulunamadı.');
  }

  const calc = calculatePriceMetrics({
    mode: input.mode,
    amount: input.amount,
    quantity: input.packageQuantity,
    inputUnit: input.packageUnit,
    baseUnit: product.baseUnit
  });

  const ts = nowIso();
  const recordedAt = input.recordedAt ? new Date(input.recordedAt).toISOString() : ts;

  // Check if editing existing record (e.g. updating price on a list item or history)
  let targetId = input.existingRecordId || null;
  if (!targetId && input.source === 'purchase' && input.listItemId) {
    const item = await db.list_items.get(input.listItemId);
    if (item?.priceRecordId) {
      targetId = item.priceRecordId;
    }
  }

  if (targetId) {
    const existing = await db.price_records.get(targetId);
    if (existing) {
      const updated: PriceRecord = {
        ...existing,
        productId: input.productId,
        storeId: input.storeId,
        brand: input.brand?.trim() || null,
        packageQuantity: input.packageQuantity,
        packageUnit: input.packageUnit,
        totalPrice: calc.totalPrice,
        unitPrice: calc.unitPrice,
        normalizedBaseUnit: product.baseUnit,
        normalizedUnitPrice: calc.normalizedUnitPrice,
        isPromo: (input.isPromo ? 1 : 0) as BinaryFlag,
        promoNote: input.isPromo ? input.promoNote?.trim() || null : null,
        recordedAt,
        updatedAt: ts
      };

      await db.transaction('rw', db.price_records, db.list_items, async () => {
        await db.price_records.put(updated);
        if (input.listItemId) {
          await db.list_items.update(input.listItemId, {
            quantity: input.packageQuantity,
            unit: input.packageUnit,
            priceRecordId: updated.id,
            ...(input.autoCheckListItem ? { isChecked: 1 as BinaryFlag, checkedAt: ts } : {}),
            updatedAt: ts
          });
        }
      });

      return updated;
    }
  }

  const newRecord: PriceRecord = {
    id: createId(),
    productId: input.productId,
    storeId: input.storeId,
    source: input.source,
    listId: input.listId || null,
    listItemId: input.listItemId || null,
    brand: input.brand?.trim() || null,
    packageQuantity: input.packageQuantity,
    packageUnit: input.packageUnit,
    totalPrice: calc.totalPrice,
    unitPrice: calc.unitPrice,
    normalizedBaseUnit: product.baseUnit,
    normalizedUnitPrice: calc.normalizedUnitPrice,
    isPromo: (input.isPromo ? 1 : 0) as BinaryFlag,
    promoNote: input.isPromo ? input.promoNote?.trim() || null : null,
    currency: 'TRY',
    recordedAt,
    createdAt: ts,
    updatedAt: ts
  };

  await db.transaction('rw', db.price_records, db.list_items, async () => {
    await db.price_records.add(newRecord);
    if (input.listItemId) {
      await db.list_items.update(input.listItemId, {
        quantity: input.packageQuantity,
        unit: input.packageUnit,
        priceRecordId: newRecord.id,
        ...(input.autoCheckListItem !== false ? { isChecked: 1 as BinaryFlag, checkedAt: ts } : {}),
        updatedAt: ts
      });
    }
  });

  return newRecord;
}

export async function deletePriceRecord(recordId: string): Promise<void> {
  const record = await db.price_records.get(recordId);
  if (!record) return;

  await db.transaction('rw', db.price_records, db.list_items, async () => {
    if (record.listItemId) {
      await db.list_items.update(record.listItemId, {
        priceRecordId: null,
        updatedAt: nowIso()
      });
    }
    await db.price_records.delete(recordId);
  });
}

export function buildStoreComparison(
  records: PriceRecord[],
  storesMap: Map<string, { name: string; branch: string | null }>
): StoreComparisonRow[] {
  const latestByStore = new Map<string, PriceRecord>();

  const sorted = [...records].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));

  for (const rec of sorted) {
    const key = rec.storeId ?? '__NONE__';
    if (!latestByStore.has(key)) {
      latestByStore.set(key, rec);
    }
  }

  const rows: StoreComparisonRow[] = [];
  latestByStore.forEach((record, key) => {
    const storeInfo = key === '__NONE__' ? null : storesMap.get(key);
    rows.push({
      storeId: record.storeId,
      storeName: storeInfo ? storeInfo.name : 'Market Belirtilmedi',
      branch: storeInfo?.branch ?? null,
      record
    });
  });

  rows.sort((a, b) => {
    const pa = a.record.normalizedUnitPrice ?? Number.MAX_SAFE_INTEGER;
    const pb = b.record.normalizedUnitPrice ?? Number.MAX_SAFE_INTEGER;
    if (pa !== pb) return pa - pb;
    return b.record.recordedAt.localeCompare(a.record.recordedAt);
  });

  return rows;
}

export function computePriceDeltaPercent(
  records: PriceRecord[],
  currentNormalizedPrice: number | null,
  storeId: string | null,
  excludeRecordId?: string | null
): { deltaPercent: number | null; comparedWithStore: boolean; previousPrice: number | null } {
  if (currentNormalizedPrice === null || currentNormalizedPrice <= 0) {
    return { deltaPercent: null, comparedWithStore: false, previousPrice: null };
  }

  const valid = records
    .filter((r) => r.normalizedUnitPrice !== null && r.id !== excludeRecordId)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));

  if (valid.length === 0) {
    return { deltaPercent: null, comparedWithStore: false, previousPrice: null };
  }

  // Prefer same store comparison if storeId is provided
  const sameStore = storeId ? valid.find((r) => r.storeId === storeId) : undefined;
  const reference = sameStore ?? valid[0];
  const prev = reference.normalizedUnitPrice!;
  if (prev <= 0) {
    return { deltaPercent: null, comparedWithStore: false, previousPrice: null };
  }

  const delta = ((currentNormalizedPrice - prev) / prev) * 100;
  return {
    deltaPercent: Math.round(delta * 10) / 10,
    comparedWithStore: Boolean(sameStore),
    previousPrice: prev
  };
}
