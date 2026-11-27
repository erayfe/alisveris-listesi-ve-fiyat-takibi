import { db, createId, nowIso } from '../db/database';
import type { BinaryFlag, InputUnit, ListItem, ShoppingList } from '../types/models';

export async function createShoppingList(params: {
  title: string;
  defaultStoreId?: string | null;
  budgetLimit?: number | null;
  isTemplate?: boolean;
}): Promise<ShoppingList> {
  const ts = nowIso();
  const list: ShoppingList = {
    id: createId(),
    title: params.title.trim(),
    status: 'active',
    isTemplate: (params.isTemplate ? 1 : 0) as BinaryFlag,
    defaultStoreId: params.defaultStoreId || null,
    budgetLimit: params.budgetLimit && params.budgetLimit > 0 ? params.budgetLimit : null,
    completedAt: null,
    createdAt: ts,
    updatedAt: ts
  };
  await db.shopping_lists.add(list);
  return list;
}

export async function addListItem(params: {
  listId: string;
  productId: string;
  quantity: number;
  unit: InputUnit;
  note?: string | null;
}): Promise<ListItem> {
  const ts = nowIso();
  const existingCount = await db.list_items.where('listId').equals(params.listId).count();
  const item: ListItem = {
    id: createId(),
    listId: params.listId,
    productId: params.productId,
    quantity: params.quantity > 0 ? params.quantity : 1,
    unit: params.unit,
    isChecked: 0,
    checkedAt: null,
    priceRecordId: null,
    note: params.note?.trim() || null,
    sortOrder: existingCount,
    createdAt: ts,
    updatedAt: ts
  };
  await db.list_items.add(item);
  await db.shopping_lists.update(params.listId, { updatedAt: ts });
  return item;
}

export async function toggleListItemChecked(itemId: string): Promise<void> {
  const item = await db.list_items.get(itemId);
  if (!item) return;
  const ts = nowIso();
  const nextChecked: BinaryFlag = item.isChecked === 1 ? 0 : 1;
  await db.list_items.update(itemId, {
    isChecked: nextChecked,
    checkedAt: nextChecked === 1 ? ts : null,
    updatedAt: ts
  });
}

export async function updateListItemDetails(
  itemId: string,
  changes: Partial<Pick<ListItem, 'quantity' | 'unit' | 'note'>>
): Promise<void> {
  await db.list_items.update(itemId, {
    ...changes,
    updatedAt: nowIso()
  });
}

export async function removeListItem(itemId: string): Promise<void> {
  await db.list_items.delete(itemId);
}

export async function completeShoppingList(
  listId: string,
  carryOverUnchecked: boolean
): Promise<ShoppingList | null> {
  const list = await db.shopping_lists.get(listId);
  if (!list) return null;

  const ts = nowIso();
  let newList: ShoppingList | null = null;

  await db.transaction('rw', db.shopping_lists, db.list_items, async () => {
    await db.shopping_lists.update(listId, {
      status: 'completed',
      completedAt: ts,
      updatedAt: ts
    });

    if (carryOverUnchecked) {
      const unchecked = await db.list_items
        .where('[listId+isChecked]')
        .equals([listId, 0])
        .toArray();

      if (unchecked.length > 0) {
        newList = {
          id: createId(),
          title: `${list.title} (Kalanlar)`,
          status: 'active',
          isTemplate: 0,
          defaultStoreId: list.defaultStoreId,
          budgetLimit: null,
          completedAt: null,
          createdAt: ts,
          updatedAt: ts
        };
        await db.shopping_lists.add(newList);

        const clonedItems: ListItem[] = unchecked.map((item, idx) => ({
          id: createId(),
          listId: newList!.id,
          productId: item.productId,
          quantity: item.quantity,
          unit: item.unit,
          isChecked: 0,
          checkedAt: null,
          priceRecordId: null,
          note: item.note,
          sortOrder: idx,
          createdAt: ts,
          updatedAt: ts
        }));
        await db.list_items.bulkAdd(clonedItems);
      }
    }
  });

  return newList;
}

export async function createListFromTemplate(templateId: string, customTitle?: string): Promise<ShoppingList | null> {
  const template = await db.shopping_lists.get(templateId);
  if (!template) return null;

  const ts = nowIso();
  const items = await db.list_items.where('listId').equals(templateId).toArray();

  const newList: ShoppingList = {
    id: createId(),
    title: customTitle?.trim() || `${template.title} (${new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })})`,
    status: 'active',
    isTemplate: 0,
    defaultStoreId: template.defaultStoreId,
    budgetLimit: template.budgetLimit,
    completedAt: null,
    createdAt: ts,
    updatedAt: ts
  };

  await db.transaction('rw', db.shopping_lists, db.list_items, async () => {
    await db.shopping_lists.add(newList);
    const cloned: ListItem[] = items.map((item, idx) => ({
      id: createId(),
      listId: newList.id,
      productId: item.productId,
      quantity: item.quantity,
      unit: item.unit,
      isChecked: 0,
      checkedAt: null,
      priceRecordId: null,
      note: item.note,
      sortOrder: idx,
      createdAt: ts,
      updatedAt: ts
    }));
    if (cloned.length > 0) {
      await db.list_items.bulkAdd(cloned);
    }
  });

  return newList;
}

export async function saveListAsTemplate(listId: string, templateTitle?: string): Promise<ShoppingList | null> {
  const sourceList = await db.shopping_lists.get(listId);
  if (!sourceList) return null;

  const ts = nowIso();
  const items = await db.list_items.where('listId').equals(listId).toArray();

  const template: ShoppingList = {
    id: createId(),
    title: templateTitle?.trim() || `${sourceList.title} (Şablon)`,
    status: 'active',
    isTemplate: 1,
    defaultStoreId: sourceList.defaultStoreId,
    budgetLimit: sourceList.budgetLimit,
    completedAt: null,
    createdAt: ts,
    updatedAt: ts
  };

  await db.transaction('rw', db.shopping_lists, db.list_items, async () => {
    await db.shopping_lists.add(template);
    const cloned: ListItem[] = items.map((item, idx) => ({
      id: createId(),
      listId: template.id,
      productId: item.productId,
      quantity: item.quantity,
      unit: item.unit,
      isChecked: 0,
      checkedAt: null,
      priceRecordId: null,
      note: item.note,
      sortOrder: idx,
      createdAt: ts,
      updatedAt: ts
    }));
    if (cloned.length > 0) {
      await db.list_items.bulkAdd(cloned);
    }
  });

  return template;
}

export async function deleteShoppingList(listId: string): Promise<void> {
  await db.transaction('rw', db.shopping_lists, db.list_items, async () => {
    await db.list_items.where('listId').equals(listId).delete();
    await db.shopping_lists.delete(listId);
  });
}
