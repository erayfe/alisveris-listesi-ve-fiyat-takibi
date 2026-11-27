export type BaseUnit = 'kg' | 'l' | 'adet';
export type InputUnit = 'kg' | 'g' | 'l' | 'ml' | 'adet' | 'paket';
export type ListStatus = 'active' | 'completed' | 'archived';
export type PriceSource = 'purchase' | 'observation';
export type BinaryFlag = 0 | 1;

export interface Category {
  id: string;
  parentId: string | null;
  name: string;
  sortOrder: number;
  color: string | null;
  icon: string | null;
  isArchived: BinaryFlag;
  createdAt: string;
  updatedAt: string;
}

export interface Store {
  id: string;
  name: string;
  branch: string | null;
  isArchived: BinaryFlag;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  categoryId: string;
  subCategoryId: string | null;
  baseUnit: BaseUnit;
  defaultInputUnit: InputUnit;
  defaultBrand: string | null;
  barcode: string | null;
  notes: string | null;
  isArchived: BinaryFlag;
  createdAt: string;
  updatedAt: string;
}

export interface ShoppingList {
  id: string;
  title: string;
  status: ListStatus;
  isTemplate: BinaryFlag;
  defaultStoreId: string | null;
  budgetLimit: number | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListItem {
  id: string;
  listId: string;
  productId: string;
  quantity: number;
  unit: InputUnit;
  isChecked: BinaryFlag;
  checkedAt: string | null;
  priceRecordId: string | null;
  note: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface PriceRecord {
  id: string;
  productId: string;
  storeId: string | null;
  source: PriceSource;
  listId: string | null;
  listItemId: string | null;
  brand: string | null;
  packageQuantity: number;
  packageUnit: InputUnit;
  totalPrice: number;
  unitPrice: number;
  normalizedBaseUnit: BaseUnit;
  normalizedUnitPrice: number | null;
  isPromo: BinaryFlag;
  promoNote: string | null;
  currency: string;
  recordedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppMeta {
  key: string;
  value: unknown;
}

export interface StoreComparisonRow {
  storeId: string | null;
  storeName: string;
  branch: string | null;
  record: PriceRecord;
}

export interface BackupEnvelope {
  app: 'market-tracker';
  schemaVersion: number;
  exportedAt: string;
  data: {
    categories: Category[];
    stores: Store[];
    products: Product[];
    shopping_lists: ShoppingList[];
    list_items: ListItem[];
    price_records: PriceRecord[];
    app_meta: AppMeta[];
  };
}
