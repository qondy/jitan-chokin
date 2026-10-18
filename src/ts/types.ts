export type FreqUnit = 'day' | 'week' | 'month';

export type Category = 'housework' | 'work' | 'move' | 'money' | 'self' | 'digital' | 'other';

/** users/{uid}/kaizen/{id} 効率化したこと */
export interface Kaizen {
  id: string;
  title: string;
  category: Category;
  /** 以前の所要時間（分／回） */
  beforeMin: number;
  /** 今の所要時間（分／回） */
  afterMin: number;
  /** 頻度：freqUnit あたり freqCount 回 */
  freqCount: number;
  freqUnit: FreqUnit;
  /** 始めた日（YYYY-MM-DD） */
  startDate: string;
  /** おわりにした日（YYYY-MM-DD）。続けているなら null */
  endDate: string | null;
  memo: string;
  createdAt: number;
}

/** users/{uid}/settings/profile */
export interface Profile {
  /** 時給（円）。未設定なら null */
  hourlyWage: number | null;
  /** お祝い済みの最大マイルストーン（分） */
  celebratedMin: number;
}

/** 効率化を追加・編集するときの入力値 */
export type KaizenInput = Omit<Kaizen, 'id' | 'createdAt'>;
