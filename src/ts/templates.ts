import { Category, FreqUnit } from './types';

export const CATEGORIES: Category[] = ['housework', 'work', 'move', 'money', 'self', 'digital', 'other'];

export const CATEGORY_LABEL: Record<Category, string> = {
  housework: '家事',
  work: '仕事',
  move: '移動',
  money: 'お金・買い物',
  self: '身支度・健康',
  digital: 'デジタル',
  other: 'その他',
};

export const isCategory = (v: unknown): v is Category =>
  typeof v === 'string' && (CATEGORIES as string[]).includes(v);

export const FREQ_UNITS: FreqUnit[] = ['day', 'week', 'month'];

export const FREQ_LABEL: Record<FreqUnit, string> = {
  day: '1日に',
  week: '1週間に',
  month: '1か月に',
};

export const isFreqUnit = (v: unknown): v is FreqUnit =>
  typeof v === 'string' && (FREQ_UNITS as string[]).includes(v);

/** 1単位あたりの日数（1か月は平均日数） */
export const UNIT_DAYS: Record<FreqUnit, number> = {
  day: 1,
  week: 7,
  month: 365.25 / 12,
};

/** 入力の上限 */
export const LIMITS = {
  title: 60,
  memo: 300,
  minutes: 1440,
  freqCount: 100,
};

/** 追加モーダルの「例から入力」 */
export interface Example {
  title: string;
  category: Category;
  beforeMin: number;
  afterMin: number;
  freqCount: number;
  freqUnit: FreqUnit;
}

export const EXAMPLES: Example[] = [
  { title: '洗濯物をたたまず、ハンガーのまま収納', category: 'housework', beforeMin: 20, afterMin: 5, freqCount: 1, freqUnit: 'day' },
  { title: 'よく使う文章を単語登録した', category: 'work', beforeMin: 3, afterMin: 1, freqCount: 10, freqUnit: 'day' },
  { title: '日用品をネットの定期便にした', category: 'money', beforeMin: 40, afterMin: 5, freqCount: 2, freqUnit: 'month' },
  { title: '翌日の服を前の晩に決めておく', category: 'self', beforeMin: 10, afterMin: 2, freqCount: 1, freqUnit: 'day' },
  { title: '乗換えを1本減らせるルートに変えた', category: 'move', beforeMin: 50, afterMin: 42, freqCount: 10, freqUnit: 'week' },
  { title: 'ロボット掃除機を導入した', category: 'housework', beforeMin: 25, afterMin: 3, freqCount: 3, freqUnit: 'week' },
  { title: '定型の報告メールをテンプレート化', category: 'work', beforeMin: 15, afterMin: 4, freqCount: 5, freqUnit: 'week' },
  { title: 'パスワード管理アプリで自動入力', category: 'digital', beforeMin: 2, afterMin: 0, freqCount: 5, freqUnit: 'day' },
];

/** マイルストーン（分）と称号 */
export interface Milestone {
  minutes: number;
  title: string;
}

export const MILESTONES: Milestone[] = [
  { minutes: 60, title: 'はじめの1時間' },
  { minutes: 5 * 60, title: 'コツコツ時短家' },
  { minutes: 10 * 60, title: '時短の芽' },
  { minutes: 24 * 60, title: 'まる1日ぶん貯金' },
  { minutes: 50 * 60, title: 'カイゼン上手' },
  { minutes: 100 * 60, title: '100時間の達人' },
  { minutes: 200 * 60, title: '時間の錬金術師' },
  { minutes: 500 * 60, title: 'ゆとりの大富豪' },
  { minutes: 1000 * 60, title: '伝説の時短王' },
];

/** 浮いた時間を身近なものに言い換える（分） */
export interface Equivalent {
  minutes: number;
  unit: string;
  label: string;
}

export const EQUIVALENTS: Equivalent[] = [
  { minutes: 5, unit: '杯', label: 'コーヒー' },
  { minutes: 30, unit: '回', label: 'ゆっくりお風呂' },
  { minutes: 45, unit: '話', label: 'ドラマ' },
  { minutes: 120, unit: '本', label: '映画' },
  { minutes: 360, unit: '冊', label: '本' },
  { minutes: 16 * 60, unit: '日', label: 'まる1日の休日' },
];
