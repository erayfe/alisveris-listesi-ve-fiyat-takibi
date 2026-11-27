import Dexie, { type Table } from 'dexie';
import type {
  AppMeta,
  Category,
  ListItem,
  PriceRecord,
  Product,
  ShoppingList,
  Store
} from '../types/models';

export const SCHEMA_VERSION = 1;

export class MarketFiyatDB extends Dexie {
  categories!: Table<Category, string>;
  stores!: Table<Store, string>;
  products!: Table<Product, string>;
  shopping_lists!: Table<ShoppingList, string>;
  list_items!: Table<ListItem, string>;
  price_records!: Table<PriceRecord, string>;
  app_meta!: Table<AppMeta, string>;

  constructor() {
    super('MarketFiyatDB');
    this.version(SCHEMA_VERSION).stores({
      categories: 'id, parentId, isArchived, [parentId+sortOrder]',
      stores: 'id, name, isArchived',
      products: 'id, name, categoryId, subCategoryId, barcode, isArchived, [categoryId+isArchived]',
      shopping_lists: 'id, status, isTemplate, createdAt, [status+isTemplate]',
      list_items: 'id, listId, productId, priceRecordId, [listId+isChecked]',
      price_records: [
        'id',
        'productId',
        'storeId',
        'source',
        'listId',
        'listItemId',
        'recordedAt',
        '[productId+recordedAt]',
        '[productId+storeId+recordedAt]',
        '[source+recordedAt]'
      ].join(', '),
      app_meta: 'key'
    });
  }
}

export const db = new MarketFiyatDB();

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function nowIso(): string {
  return new Date().toISOString();
}
