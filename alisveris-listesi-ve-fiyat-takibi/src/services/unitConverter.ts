import type { BaseUnit, InputUnit } from '../types/models';

export const BASE_UNITS: { value: BaseUnit; label: string }[] = [
  { value: 'kg', label: 'Kilogram (kg)' },
  { value: 'l', label: 'Litre (L)' },
  { value: 'adet', label: 'Adet' }
];

export const INPUT_UNITS: { value: InputUnit; label: string; short: string }[] = [
  { value: 'kg', label: 'Kilogram (kg)', short: 'kg' },
  { value: 'g', label: 'Gram (g)', short: 'g' },
  { value: 'l', label: 'Litre (L)', short: 'L' },
  { value: 'ml', label: 'Mililitre (ml)', short: 'ml' },
  { value: 'adet', label: 'Adet', short: 'adet' },
  { value: 'paket', label: 'Paket', short: 'paket' }
];

export interface PriceCalculationResult {
  totalPrice: number;
  unitPrice: number;
  normalizedUnitPrice: number | null;
  canNormalize: boolean;
  warningMessage: string | null;
}

export function getUnitMultiplierToBase(inputUnit: InputUnit, baseUnit: BaseUnit): number | null {
  if (baseUnit === 'kg') {
    if (inputUnit === 'kg') return 1;
    if (inputUnit === 'g') return 0.001;
    return null;
  }
  if (baseUnit === 'l') {
    if (inputUnit === 'l') return 1;
    if (inputUnit === 'ml') return 0.001;
    return null;
  }
  if (baseUnit === 'adet') {
    if (inputUnit === 'adet') return 1;
    return null;
  }
  return null;
}

export function calculatePriceMetrics(params: {
  mode: 'total' | 'unit';
  amount: number;
  quantity: number;
  inputUnit: InputUnit;
  baseUnit: BaseUnit;
}): PriceCalculationResult {
  const qty = params.quantity > 0 ? params.quantity : 1;
  const amount = params.amount >= 0 ? params.amount : 0;

  let totalPrice = 0;
  let unitPrice = 0;

  if (params.mode === 'total') {
    totalPrice = round2(amount);
    unitPrice = round4(amount / qty);
  } else {
    // In 'unit' mode, user enters price per baseUnit or per inputUnit
    // If unit is g/ml and baseUnit is kg/l, entering unit price usually means TL/kg or TL/L
    const mult = getUnitMultiplierToBase(params.inputUnit, params.baseUnit);
    if (mult !== null && (params.inputUnit === 'g' || params.inputUnit === 'ml')) {
      // User typed e.g. 240 TL/kg and quantity 400 g -> total = 240 * 0.4
      totalPrice = round2(amount * (qty * mult));
      unitPrice = round4(totalPrice / qty);
    } else {
      totalPrice = round2(amount * qty);
      unitPrice = round4(amount);
    }
  }

  const mult = getUnitMultiplierToBase(params.inputUnit, params.baseUnit);
  if (mult === null) {
    return {
      totalPrice,
      unitPrice,
      normalizedUnitPrice: null,
      canNormalize: false,
      warningMessage: `Birim (${params.inputUnit}) temel birime (${formatBaseUnitLabel(params.baseUnit)}) çevrilemediği için birim fiyat grafiğine dahil edilmeyecek.`
    };
  }

  const baseQty = qty * mult;
  const normalizedUnitPrice = baseQty > 0 ? round2(totalPrice / baseQty) : null;

  return {
    totalPrice,
    unitPrice,
    normalizedUnitPrice,
    canNormalize: true,
    warningMessage: null
  };
}

export function estimateItemCost(
  quantity: number,
  unit: InputUnit,
  baseUnit: BaseUnit,
  referenceNormalizedUnitPrice: number | null,
  fallbackTotalPrice?: number
): number {
  if (referenceNormalizedUnitPrice !== null) {
    const mult = getUnitMultiplierToBase(unit, baseUnit);
    if (mult !== null) {
      return round2(quantity * mult * referenceNormalizedUnitPrice);
    }
  }
  if (fallbackTotalPrice && fallbackTotalPrice > 0) {
    return round2(fallbackTotalPrice);
  }
  return 0;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

export function formatBaseUnitLabel(unit: BaseUnit): string {
  if (unit === 'l') return 'L';
  return unit;
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value) + ' ₺';
}

export function formatUnitPrice(value: number | null, baseUnit: BaseUnit): string {
  if (value === null) return '—';
  return `${new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)} ₺/${formatBaseUnitLabel(baseUnit)}`;
}

export function formatRelativeDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Az önce';
  if (diffMin < 60) return `${diffMin} dk önce`;
  if (diffHours < 24 && date.toDateString() === now.toDateString()) {
    return `Bugün ${date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}`;
  }
  if (diffDays <= 1) return 'Dün';
  if (diffDays < 30) return `${diffDays} gün önce`;
  return date.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTimeShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function toLocalDateTimeInput(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function normalizeTurkish(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .trim()
    .replace(/\s+/g, ' ');
}
