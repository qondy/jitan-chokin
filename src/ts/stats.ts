import { DAY_MS, endOfKey, parseKey } from './dates';
import { Category, Kaizen } from './types';
import { CATEGORIES, EQUIVALENTS, Equivalent, MILESTONES, Milestone, UNIT_DAYS } from './templates';

/** 1回あたりの短縮時間（分） */
export function savedPerTime(k: Pick<Kaizen, 'beforeMin' | 'afterMin'>): number {
  return Math.max(0, k.beforeMin - k.afterMin);
}

/** 1日あたりに浮く時間（分） */
export function perDayMin(k: Pick<Kaizen, 'beforeMin' | 'afterMin' | 'freqCount' | 'freqUnit'>): number {
  return (savedPerTime(k) * k.freqCount) / UNIT_DAYS[k.freqUnit];
}

/** 1年続けたときに浮く時間（分） */
export function perYearMin(k: Pick<Kaizen, 'beforeMin' | 'afterMin' | 'freqCount' | 'freqUnit'>): number {
  return perDayMin(k) * 365;
}

export const isActive = (k: Kaizen): boolean => k.endDate === null;

/** from〜to の期間に浮いた時間（分）。始めた日の0:00から連続的に貯まっていく */
export function accruedBetween(k: Kaizen, from: number, to: number): number {
  const start = Math.max(parseKey(k.startDate).getTime(), from);
  const endLimit = k.endDate ? endOfKey(k.endDate).getTime() : Infinity;
  const end = Math.min(endLimit, to);
  if (end <= start) return 0;
  return (perDayMin(k) * (end - start)) / DAY_MS;
}

/** これまでに浮いた時間（分） */
export function accruedMin(k: Kaizen, now = Date.now()): number {
  return accruedBetween(k, -Infinity, now);
}

export function totalMin(list: Kaizen[], now = Date.now()): number {
  return list.reduce((sum, k) => sum + accruedMin(k, now), 0);
}

/** 続けている効率化をこのまま1年続けた場合（分） */
export function yearlyMin(list: Kaizen[]): number {
  return list.filter(isActive).reduce((sum, k) => sum + perYearMin(k), 0);
}

/** 続けている効率化で1日あたりに浮く時間（分） */
export function dailyMin(list: Kaizen[]): number {
  return list.filter(isActive).reduce((sum, k) => sum + perDayMin(k), 0);
}

export interface MonthBucket {
  year: number;
  month0: number;
  minutes: number;
}

/** 直近 n か月ぶんの月別の浮いた時間（古い順） */
export function monthly(list: Kaizen[], n: number, now = new Date()): MonthBucket[] {
  const buckets: MonthBucket[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const end = Math.min(to.getTime(), now.getTime());
    const minutes = list.reduce((sum, k) => sum + accruedBetween(k, from.getTime(), end), 0);
    buckets.push({ year: from.getFullYear(), month0: from.getMonth(), minutes });
  }
  return buckets;
}

export function byCategory(list: Kaizen[], now = Date.now()): { category: Category; minutes: number; count: number }[] {
  return CATEGORIES
    .map((category) => {
      const items = list.filter((k) => k.category === category);
      return { category, minutes: totalMin(items, now), count: items.length };
    })
    .filter((c) => c.count > 0)
    .sort((a, b) => b.minutes - a.minutes);
}

export interface MilestoneState {
  reached: Milestone | null;
  next: Milestone | null;
  /** 次のマイルストーンまでの進み具合（0〜1） */
  progress: number;
}

export function milestoneOf(total: number): MilestoneState {
  let reached: Milestone | null = null;
  for (const m of MILESTONES) {
    if (total >= m.minutes) reached = m;
  }
  const next = MILESTONES.find((m) => total < m.minutes) ?? null;
  const base = reached ? reached.minutes : 0;
  const progress = next ? Math.min(1, Math.max(0, (total - base) / (next.minutes - base))) : 1;
  return { reached, next, progress };
}

/** 浮いた時間で「何回ぶん」になるか。1回以上になるもののうち大きい単位から最大3つ */
export function equivalentsOf(total: number): { eq: Equivalent; count: number }[] {
  return EQUIVALENTS
    .map((eq) => ({ eq, count: Math.floor(total / eq.minutes) }))
    .filter((e) => e.count >= 1)
    .reverse()
    .slice(0, 3);
}

/** 分を「◯時間◯分」の形にする */
export function formatDuration(min: number): string {
  const m = Math.max(0, min);
  if (m < 1) return m > 0 ? '1分未満' : '0分';
  if (m < 60) return `${Math.floor(m)}分`;
  const h = Math.floor(m / 60);
  const rest = Math.floor(m % 60);
  if (h >= 100 || rest === 0) return `${h.toLocaleString('ja-JP')}時間`;
  return `${h}時間${rest}分`;
}

/** 1日あたりなど小さな値向け：小数1桁まで（例：12.5分） */
export function formatSmall(min: number): string {
  if (min >= 60) return formatDuration(min);
  const v = Math.round(min * 10) / 10;
  return `${v}分`;
}

export function formatYen(min: number, wage: number): string {
  return `${Math.floor((min / 60) * wage).toLocaleString('ja-JP')}円`;
}
