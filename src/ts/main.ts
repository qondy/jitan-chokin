import { User } from 'firebase/auth';
import { onAuthChange, loginWithGoogle, logout } from './auth';
import { showToast, openOverlay, closeOverlay, textEl, button } from './ui';
import { submitFeedback } from './feedback';
import { todayKey, isDateKey, labelOf, daysSince } from './dates';
import {
  CATEGORIES, CATEGORY_LABEL, FREQ_UNITS, FREQ_LABEL, EXAMPLES, MILESTONES, LIMITS, Example,
} from './templates';
import {
  subscribeKaizen, createKaizen, updateKaizen, setKaizenEnd, deleteKaizen, subscribeProfile, saveProfile,
} from './store';
import {
  savedPerTime, perDayMin, perYearMin, accruedMin, totalMin, yearlyMin, dailyMin, monthly, byCategory,
  milestoneOf, equivalentsOf, formatDuration, formatSmall, formatYen, isActive,
} from './stats';
import { Category, FreqUnit, Kaizen, KaizenInput, Profile } from './types';

// ============================================================
// DOM refs
// ============================================================
const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const loginScreen = $('login-screen');
const appEl = $('app');
const userInfo = $('user-info');
const userAvatar = $<HTMLImageElement>('user-avatar');
const userName = $('user-name');
const btnGoogleLogin = $<HTMLButtonElement>('btn-google-login');
const btnLogout = $<HTMLButtonElement>('btn-logout');

const tabButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.tabs__btn'));
const panels = Array.from(document.querySelectorAll<HTMLElement>('.panel'));
const countList = $('count-list');

const homeLoading = $('home-loading');
const homeEmpty = $('home-empty');
const homeBody = $('home-body');
const bankTotal = $('bank-total');
const bankYen = $('bank-yen');
const bankDaily = $('bank-daily');
const bankYearly = $('bank-yearly');
const equivalentsEl = $('equivalents');
const rankTitle = $('rank-title');
const rankFill = $('rank-fill');
const rankNext = $('rank-next');
const topList = $('top-list');

const listFilter = $('list-filter');
const kaizenList = $('kaizen-list');
const listEmpty = $('list-empty');

const statTotal = $('stat-total');
const statMonth = $('stat-month');
const statCount = $('stat-count');
const statYen = $('stat-yen');
const statYenLabel = $('stat-yen-label');
const monthChart = $('month-chart');
const categoryList = $('category-list');
const milestoneList = $('milestone-list');

const btnFab = $<HTMLButtonElement>('btn-fab');

const kaizenOverlay = $('kaizen-modal-overlay');
const kaizenForm = $<HTMLFormElement>('kaizen-form');
const kaizenModalTitle = $('kaizen-modal-title');
const examplesBox = $('examples-box');
const examplesEl = $('examples');
const inputTitle = $<HTMLInputElement>('input-title');
const categoryChips = $('category-chips');
const inputBefore = $<HTMLInputElement>('input-before');
const inputAfter = $<HTMLInputElement>('input-after');
const freqUnitEl = $('freq-unit');
const inputFreq = $<HTMLInputElement>('input-freq');
const inputStart = $<HTMLInputElement>('input-start');
const endField = $('end-field');
const inputEnd = $<HTMLInputElement>('input-end');
const inputMemo = $<HTMLTextAreaElement>('input-memo');
const kaizenPreview = $('kaizen-preview');
const btnKaizenDelete = $<HTMLButtonElement>('btn-kaizen-delete');
const btnKaizenSubmit = $<HTMLButtonElement>('btn-kaizen-submit');

const wageOverlay = $('wage-modal-overlay');
const wageForm = $<HTMLFormElement>('wage-form');
const inputWage = $<HTMLInputElement>('input-wage');
const btnWageSubmit = $<HTMLButtonElement>('btn-wage-submit');

const celebrateOverlay = $('celebrate-overlay');
const celebrateSub = $('celebrate-sub');
const celebrateTitle = $('celebrate-title');
const celebrateText = $('celebrate-text');

const confirmOverlay = $('confirm-dialog-overlay');
const confirmTitle = $('confirm-dialog-title');
const confirmText = $('confirm-dialog-text');
const btnConfirmCancel = $<HTMLButtonElement>('btn-confirm-cancel');
const btnConfirmOk = $<HTMLButtonElement>('btn-confirm-ok');

const feedbackBtn = $<HTMLButtonElement>('feedback-btn');
const feedbackOverlay = $('feedback-modal-overlay');
const inputFeedbackMessage = $<HTMLTextAreaElement>('input-feedback-message');
const btnFeedbackClose = $<HTMLButtonElement>('btn-feedback-close');
const btnFeedbackSend = $<HTMLButtonElement>('btn-feedback-send');

// ============================================================
// State
// ============================================================
type Tab = 'home' | 'list' | 'review';
type Filter = 'active' | 'ended' | 'all';

interface State {
  uid: string | null;
  unsubscribes: (() => void)[];
  kaizen: Kaizen[];
  profile: Profile;
  loaded: { kaizen: boolean; profile: boolean };
  tab: Tab;
  filter: Filter;
  editingId: string | null;
  formCategory: Category;
  formUnit: FreqUnit;
  pending: Set<string>;
  confirmAction: (() => Promise<void>) | null;
  /** お祝い済み（保存待ちを含む）の最大マイルストーン */
  celebratedLocal: number;
}

const EMPTY_PROFILE: Profile = { hourlyWage: null, celebratedMin: 0 };

const state: State = {
  uid: null,
  unsubscribes: [],
  kaizen: [],
  profile: { ...EMPTY_PROFILE },
  loaded: { kaizen: false, profile: false },
  tab: 'home',
  filter: 'active',
  editingId: null,
  formCategory: 'housework',
  formUnit: 'day',
  pending: new Set(),
  confirmAction: null,
  celebratedLocal: 0,
};

// ============================================================
// Helpers
// ============================================================
const allLoaded = (): boolean => state.loaded.kaizen && state.loaded.profile;
const activeList = (): Kaizen[] => state.kaizen.filter(isActive);

/** 同じキーの処理が進行中なら何もしない（二重送信防止） */
async function withLock(key: string, fn: () => Promise<void>, errorMessage = '保存に失敗しました。通信環境を確認してください'): Promise<boolean> {
  if (state.pending.has(key)) return false;
  state.pending.add(key);
  renderAll();
  try {
    await fn();
    return true;
  } catch (err) {
    console.error(err);
    showToast(errorMessage);
    return false;
  } finally {
    state.pending.delete(key);
    renderAll();
  }
}

function askConfirm(title: string, text: string, action: () => Promise<void>): void {
  confirmTitle.textContent = title;
  confirmText.textContent = text;
  state.confirmAction = action;
  openOverlay(confirmOverlay);
  btnConfirmCancel.focus();
}

/** 「12時間34分56秒」をライブ表示用に数字と単位で組み立てる */
function renderLiveTotal(el: HTMLElement, min: number): void {
  const sec = Math.floor(Math.max(0, min) * 60);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const parts: [string, string][] = [];
  if (h > 0) parts.push([h.toLocaleString('ja-JP'), '時間']);
  if (h > 0 || m > 0) parts.push([String(m), '分']);
  parts.push([String(s).padStart(h > 0 || m > 0 ? 2 : 1, '0'), '秒']);
  el.replaceChildren(...parts.flatMap(([num, unit]) => [
    textEl('span', 'bank__num', num),
    textEl('span', 'bank__unit', unit),
  ]));
}

const freqText = (k: Pick<Kaizen, 'freqCount' | 'freqUnit'>): string => `${FREQ_LABEL[k.freqUnit]}${k.freqCount}回`;

const minText = (v: number): string => `${Math.round(v * 10) / 10}分`;

// ============================================================
// Render
// ============================================================
function renderTabs(): void {
  tabButtons.forEach((b) => {
    const active = b.dataset.tab === state.tab;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-selected', String(active));
  });
  panels.forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== state.tab));
}

function renderBank(): void {
  if (!allLoaded() || state.kaizen.length === 0) return;
  const total = totalMin(state.kaizen);
  renderLiveTotal(bankTotal, total);
  const wage = state.profile.hourlyWage;
  bankYen.classList.toggle('hidden', !wage);
  if (wage) bankYen.textContent = `時給換算で 約${formatYen(total, wage)}ぶん`;
}

function renderHome(): void {
  const loaded = allLoaded();
  const has = state.kaizen.length > 0;
  homeLoading.classList.toggle('hidden', loaded);
  homeEmpty.classList.toggle('hidden', !loaded || has);
  homeBody.classList.toggle('hidden', !loaded || !has);
  if (!loaded || !has) return;

  renderBank();
  const daily = dailyMin(state.kaizen);
  bankDaily.textContent = daily > 0 ? `+${formatSmall(daily)}` : '—';
  bankYearly.textContent = daily > 0 ? `約${formatDuration(yearlyMin(state.kaizen))}` : '—';

  // 浮いた時間で、できること
  const total = totalMin(state.kaizen);
  const eqs = equivalentsOf(total);
  if (eqs.length === 0) {
    const remain = 5 - total;
    equivalentsEl.replaceChildren(textEl('p', 'equivalents__hint',
      `コーヒー1杯ぶん（5分）まで、あと${formatDuration(remain)}。続けるほど、どんどん貯まります。`));
  } else {
    equivalentsEl.replaceChildren(...eqs.map(({ eq, count }) => {
      const card = document.createElement('div');
      card.className = 'equivalent';
      const value = document.createElement('p');
      value.className = 'equivalent__value';
      value.append(textEl('span', 'equivalent__num', count.toLocaleString('ja-JP')), textEl('span', 'equivalent__unit', eq.unit));
      card.append(value, textEl('p', 'equivalent__label', `${eq.label}ぶん`));
      return card;
    }));
  }

  // 称号
  const ms = milestoneOf(total);
  rankTitle.textContent = ms.reached ? ms.reached.title : 'まだ称号はありません';
  rankFill.style.width = `${Math.round(ms.progress * 100)}%`;
  rankNext.textContent = ms.next
    ? `次の称号「${ms.next.title}」（${formatDuration(ms.next.minutes)}）まで あと${formatDuration(ms.next.minutes - total)}`
    : 'すべての称号を達成しました！';

  // よく効いている効率化
  const top = activeList().slice().sort((a, b) => perDayMin(b) - perDayMin(a)).slice(0, 5);
  if (top.length === 0) {
    topList.replaceChildren(textEl('li', 'top-list__empty', '続けている効率化はありません。'));
  } else {
    topList.replaceChildren(...top.map((k, i) => {
      const li = document.createElement('li');
      li.className = 'top-item';
      const body = document.createElement('div');
      body.className = 'top-item__body';
      body.append(
        textEl('p', 'top-item__title', k.title),
        textEl('p', 'top-item__meta', `これまで ${formatDuration(accruedMin(k))}・1年で約${formatDuration(perYearMin(k))}`),
      );
      li.append(textEl('span', 'top-item__rank', String(i + 1)), body, textEl('span', 'top-item__pace', `+${formatSmall(perDayMin(k))}/日`));
      return li;
    }));
  }
}

const FILTER_LABEL: Record<Filter, string> = { active: '続けている', ended: 'おわった', all: 'すべて' };

function renderList(): void {
  const counts: Record<Filter, number> = {
    active: activeList().length,
    ended: state.kaizen.length - activeList().length,
    all: state.kaizen.length,
  };
  countList.textContent = counts.active > 0 ? String(counts.active) : '';

  listFilter.replaceChildren(...(Object.keys(FILTER_LABEL) as Filter[]).map((f) => {
    const b = button(`${FILTER_LABEL[f]} ${counts[f]}`, 'segmented__btn', () => {
      state.filter = f;
      renderList();
    });
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(state.filter === f));
    b.classList.toggle('is-active', state.filter === f);
    return b;
  }));

  const items = state.kaizen.filter((k) => (state.filter === 'all' ? true : state.filter === 'active' ? isActive(k) : !isActive(k)));
  listEmpty.classList.toggle('hidden', items.length > 0 || !allLoaded());
  listEmpty.textContent = state.kaizen.length === 0
    ? 'まだ記録がありません。右下の「＋」から、効率化したことを記録しましょう。'
    : 'このなかには、まだありません。';

  kaizenList.replaceChildren(...items.map((k) => {
    const card = document.createElement('article');
    card.className = `kaizen-card${isActive(k) ? '' : ' is-ended'}`;

    const head = document.createElement('div');
    head.className = 'kaizen-card__head';
    const tags = document.createElement('div');
    tags.className = 'kaizen-card__tags';
    tags.append(textEl('span', `cat-chip cat-chip--${k.category}`, CATEGORY_LABEL[k.category]));
    if (!isActive(k)) tags.append(textEl('span', 'ended-chip', 'おわり'));
    head.append(textEl('h3', 'kaizen-card__title', k.title), tags);

    const flow = document.createElement('p');
    flow.className = 'kaizen-card__flow';
    flow.append(
      textEl('span', 'kaizen-card__before', `前 ${minText(k.beforeMin)}`),
      textEl('span', 'kaizen-card__arrow', '→'),
      textEl('span', 'kaizen-card__after', `今 ${minText(k.afterMin)}`),
      textEl('span', 'kaizen-card__diff', `−${minText(savedPerTime(k))}`),
      textEl('span', 'kaizen-card__freq', freqText(k)),
    );

    const saved = document.createElement('div');
    saved.className = 'kaizen-card__saved';
    saved.append(
      textEl('span', 'kaizen-card__saved-label', 'これまで'),
      textEl('span', 'kaizen-card__saved-value', formatDuration(accruedMin(k))),
    );
    const period = isActive(k)
      ? `${labelOf(k.startDate)}から・${Math.max(0, daysSince(k.startDate))}日目・+${formatSmall(perDayMin(k))}/日`
      : `${labelOf(k.startDate)}〜${labelOf(k.endDate as string)}`;

    card.append(head, flow, saved, textEl('p', 'kaizen-card__period', period));
    if (k.memo) card.append(textEl('p', 'kaizen-card__memo', k.memo));

    const actions = document.createElement('div');
    actions.className = 'kaizen-card__actions';
    const busy = state.pending.has(`end-${k.id}`);
    const toggle = isActive(k)
      ? button('おわりにする', 'btn btn--ghost btn--sm', () => endKaizen(k))
      : button('おわりを取り消す', 'btn btn--ghost btn--sm', () => undoEnd(k));
    toggle.disabled = busy;
    actions.append(toggle, button('編集', 'btn btn--ghost btn--sm', () => openKaizenModal(k)));
    card.append(actions);
    return card;
  }));
}

function renderReview(): void {
  const total = totalMin(state.kaizen);
  statTotal.textContent = formatDuration(total);
  const months = monthly(state.kaizen, 6);
  statMonth.textContent = formatDuration(months[months.length - 1].minutes);
  statCount.textContent = String(activeList().length);
  const wage = state.profile.hourlyWage;
  statYen.textContent = wage ? formatYen(total, wage) : '設定する';
  statYenLabel.textContent = wage ? `時給${wage.toLocaleString('ja-JP')}円で換算` : '時給換算（任意）';

  // 月別グラフ
  const max = Math.max(...months.map((m) => m.minutes), 1);
  monthChart.replaceChildren(...months.map((m, i) => {
    const col = document.createElement('div');
    col.className = `month-chart__col${i === months.length - 1 ? ' is-current' : ''}`;
    const barWrap = document.createElement('div');
    barWrap.className = 'month-chart__bar-wrap';
    const bar = document.createElement('div');
    bar.className = 'month-chart__bar';
    bar.style.height = `${m.minutes > 0 ? Math.max(3, (m.minutes / max) * 100) : 0}%`;
    barWrap.append(bar);
    col.append(
      textEl('span', 'month-chart__value', m.minutes > 0 ? formatDuration(m.minutes) : '—'),
      barWrap,
      textEl('span', 'month-chart__label', `${m.month0 + 1}月`),
    );
    return col;
  }));

  // カテゴリ別
  const cats = byCategory(state.kaizen);
  if (cats.length === 0) {
    categoryList.replaceChildren(textEl('p', 'block__empty', '記録するとここに表示されます。'));
  } else {
    const cmax = Math.max(...cats.map((c) => c.minutes), 1);
    categoryList.replaceChildren(...cats.map((c) => {
      const row = document.createElement('div');
      row.className = 'category-row';
      const head = document.createElement('div');
      head.className = 'category-row__head';
      head.append(
        textEl('span', `cat-chip cat-chip--${c.category}`, CATEGORY_LABEL[c.category]),
        textEl('span', 'category-row__count', `${c.count}件`),
        textEl('span', 'category-row__value', formatDuration(c.minutes)),
      );
      const track = document.createElement('div');
      track.className = 'category-row__track';
      const fill = document.createElement('div');
      fill.className = `category-row__fill cat-bg--${c.category}`;
      fill.style.width = `${c.minutes > 0 ? Math.max(2, (c.minutes / cmax) * 100) : 0}%`;
      track.append(fill);
      row.append(head, track);
      return row;
    }));
  }

  // 称号
  milestoneList.replaceChildren(...MILESTONES.map((m) => {
    const reached = total >= m.minutes;
    const li = document.createElement('li');
    li.className = `milestone${reached ? ' is-reached' : ''}`;
    li.append(
      textEl('span', 'milestone__mark', reached ? '✓' : ''),
      textEl('span', 'milestone__title', reached ? m.title : '？？？'),
      textEl('span', 'milestone__need', formatDuration(m.minutes)),
    );
    return li;
  }));
}

function renderAll(): void {
  renderTabs();
  renderHome();
  renderList();
  renderReview();
  checkMilestone();
}

// ============================================================
// 称号達成のお祝い
// ============================================================
function checkMilestone(): void {
  const uid = state.uid;
  if (!uid || !allLoaded() || celebrateOverlay.classList.contains('is-open')) return;
  const reached = milestoneOf(totalMin(state.kaizen)).reached;
  const done = Math.max(state.profile.celebratedMin, state.celebratedLocal);
  if (!reached || reached.minutes <= done) return;
  state.celebratedLocal = reached.minutes;
  celebrateSub.textContent = `浮いた時間が ${formatDuration(reached.minutes)} を突破！`;
  celebrateTitle.textContent = `称号「${reached.title}」`;
  celebrateText.textContent = reached.minutes >= 120
    ? `映画${Math.floor(reached.minutes / 120)}本ぶんの時間です。小さな工夫の積み重ねが、ちゃんと時間になっています。`
    : '小さな工夫の積み重ねが、ちゃんと時間になっています。この調子で続けましょう。';
  openOverlay(celebrateOverlay);
  saveProfile(uid, { celebratedMin: reached.minutes }).catch((err) => console.error(err));
}

// ============================================================
// 効率化の追加・編集
// ============================================================
function renderCategoryChips(): void {
  categoryChips.replaceChildren(...CATEGORIES.map((c) => {
    const b = button(CATEGORY_LABEL[c], 'chip', () => {
      state.formCategory = c;
      renderCategoryChips();
    });
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(state.formCategory === c));
    b.classList.toggle('is-active', state.formCategory === c);
    return b;
  }));
}

function renderFreqUnits(): void {
  freqUnitEl.replaceChildren(...FREQ_UNITS.map((u) => {
    const b = button(FREQ_LABEL[u], 'segmented__btn', () => {
      state.formUnit = u;
      renderFreqUnits();
      updatePreview();
    });
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(state.formUnit === u));
    b.classList.toggle('is-active', state.formUnit === u);
    return b;
  }));
}

function applyExample(ex: Example): void {
  inputTitle.value = ex.title;
  state.formCategory = ex.category;
  inputBefore.value = String(ex.beforeMin);
  inputAfter.value = String(ex.afterMin);
  inputFreq.value = String(ex.freqCount);
  state.formUnit = ex.freqUnit;
  renderCategoryChips();
  renderFreqUnits();
  updatePreview();
}

function openKaizenModal(k: Kaizen | null): void {
  state.editingId = k ? k.id : null;
  kaizenModalTitle.textContent = k ? '効率化を編集' : '効率化を記録する';
  btnKaizenSubmit.textContent = k ? '保存する' : '貯金する';
  btnKaizenDelete.classList.toggle('hidden', !k);
  examplesBox.classList.toggle('hidden', !!k);
  endField.classList.toggle('hidden', !k);

  inputTitle.value = k ? k.title : '';
  state.formCategory = k ? k.category : 'housework';
  inputBefore.value = k ? String(k.beforeMin) : '';
  inputAfter.value = k ? String(k.afterMin) : '';
  inputFreq.value = k ? String(k.freqCount) : '1';
  state.formUnit = k ? k.freqUnit : 'day';
  inputStart.value = k ? k.startDate : todayKey();
  inputStart.max = todayKey();
  inputEnd.value = k?.endDate ?? '';
  inputEnd.max = todayKey();
  inputMemo.value = k ? k.memo : '';

  examplesEl.replaceChildren(...EXAMPLES.map((ex) => button(ex.title, 'chip chip--example', () => applyExample(ex))));
  renderCategoryChips();
  renderFreqUnits();
  updatePreview();
  openOverlay(kaizenOverlay);
  if (!k) inputTitle.focus();
}

function closeKaizenModal(): void {
  closeOverlay(kaizenOverlay);
  state.editingId = null;
}

const num = (input: HTMLInputElement): number => (input.value.trim() === '' ? NaN : Number(input.value));

/** フォームの値を検証して返す。不正ならエラーメッセージ */
function readForm(): KaizenInput | string {
  const title = inputTitle.value.trim();
  const before = num(inputBefore);
  const after = num(inputAfter);
  const freq = num(inputFreq);
  const start = inputStart.value;
  const end = state.editingId ? inputEnd.value : '';
  const today = todayKey();

  if (!title) return '何を効率化したかを入力してください';
  if (title.length > LIMITS.title) return `タイトルは${LIMITS.title}文字以内にしてください`;
  if (!Number.isFinite(before) || before < 0 || before > LIMITS.minutes) return '「前は」の時間を0〜1440分で入力してください';
  if (!Number.isFinite(after) || after < 0 || after > LIMITS.minutes) return '「今は」の時間を0〜1440分で入力してください';
  if (after >= before) return '「今は」の時間を「前は」より短くしてください';
  if (!Number.isFinite(freq) || freq <= 0 || freq > LIMITS.freqCount) return `回数を1〜${LIMITS.freqCount}回で入力してください`;
  if (!isDateKey(start)) return '始めた日を入力してください';
  if (start > today) return '始めた日は今日以前にしてください';
  if (end) {
    if (!isDateKey(end)) return 'おわりにした日の形式が正しくありません';
    if (end < start) return 'おわりにした日は始めた日以降にしてください';
    if (end > today) return 'おわりにした日は今日以前にしてください';
  }
  const memo = inputMemo.value.trim();
  if (memo.length > LIMITS.memo) return `メモは${LIMITS.memo}文字以内にしてください`;

  return {
    title,
    category: state.formCategory,
    beforeMin: before,
    afterMin: after,
    freqCount: freq,
    freqUnit: state.formUnit,
    startDate: start,
    endDate: end || null,
    memo,
  };
}

function updatePreview(): void {
  const before = num(inputBefore);
  const after = num(inputAfter);
  const freq = num(inputFreq);
  if (!Number.isFinite(before) || !Number.isFinite(after) || !Number.isFinite(freq) || freq <= 0) {
    kaizenPreview.replaceChildren(textEl('p', 'preview__hint', '時間と頻度を入れると、どれだけ貯まるか計算します。'));
    return;
  }
  if (after >= before) {
    kaizenPreview.replaceChildren(textEl('p', 'preview__hint', '「今は」の時間が「前は」より短くなると、貯金が始まります。'));
    return;
  }
  const k = { beforeMin: before, afterMin: after, freqCount: freq, freqUnit: state.formUnit };
  const lines: HTMLElement[] = [
    textEl('p', 'preview__main', `1回 ${minText(savedPerTime(k))} の短縮 → 1年で 約${formatDuration(perYearMin(k))}`),
    textEl('p', 'preview__sub', `1日あたり +${formatSmall(perDayMin(k))}`),
  ];
  const start = inputStart.value;
  if (isDateKey(start) && start < todayKey()) {
    const end = state.editingId && isDateKey(inputEnd.value) ? inputEnd.value : null;
    const already = accruedMin({ ...k, id: '', title: '', category: 'other', startDate: start, endDate: end, memo: '', createdAt: 0 });
    lines.push(textEl('p', 'preview__sub', `始めた日からの分として、すでに 約${formatDuration(already)} 貯まっています`));
  }
  kaizenPreview.replaceChildren(...lines);
}

[inputBefore, inputAfter, inputFreq, inputStart, inputEnd].forEach((el) => el.addEventListener('input', updatePreview));

kaizenForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const uid = state.uid;
  if (!uid) return;
  const input = readForm();
  if (typeof input === 'string') {
    showToast(input);
    return;
  }
  const id = state.editingId;
  btnKaizenSubmit.disabled = true;
  const ok = await withLock('kaizen-save', () => (id ? updateKaizen(uid, id, input) : createKaizen(uid, input)));
  btnKaizenSubmit.disabled = false;
  if (!ok) return;
  closeKaizenModal();
  showToast(id ? '保存しました' : `貯金スタート！ 1年で約${formatDuration(perYearMin(input))}浮く見込みです`);
});

btnKaizenDelete.addEventListener('click', () => {
  const uid = state.uid;
  const k = state.kaizen.find((x) => x.id === state.editingId);
  if (!uid || !k) return;
  askConfirm('この効率化を削除しますか？', `「${k.title}」で貯まった ${formatDuration(accruedMin(k))} も累計から消えます。元に戻せません。`, async () => {
    const ok = await withLock(`delete-${k.id}`, () => deleteKaizen(uid, k.id), '削除に失敗しました');
    if (!ok) return;
    closeKaizenModal();
    showToast('削除しました');
  });
});

async function endKaizen(k: Kaizen): Promise<void> {
  const uid = state.uid;
  if (!uid) return;
  const ok = await withLock(`end-${k.id}`, () => setKaizenEnd(uid, k.id, todayKey()));
  if (ok) showToast(`おつかれさまでした。${formatDuration(accruedMin({ ...k, endDate: todayKey() }))}の貯金はそのまま残ります`);
}

async function undoEnd(k: Kaizen): Promise<void> {
  const uid = state.uid;
  if (!uid) return;
  const ok = await withLock(`end-${k.id}`, () => setKaizenEnd(uid, k.id, null));
  if (ok) showToast('「続けている」に戻しました');
}

// ============================================================
// 時給の設定
// ============================================================
function openWageModal(): void {
  inputWage.value = state.profile.hourlyWage ? String(state.profile.hourlyWage) : '';
  openOverlay(wageOverlay);
  inputWage.focus();
}

wageForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const uid = state.uid;
  if (!uid) return;
  const raw = inputWage.value.trim();
  const wage = raw === '' ? null : Math.floor(Number(raw));
  if (wage !== null && (!Number.isFinite(wage) || wage < 1 || wage > 1000000)) {
    showToast('時給は1〜1,000,000円で入力してください');
    return;
  }
  btnWageSubmit.disabled = true;
  const ok = await withLock('wage', () => saveProfile(uid, { hourlyWage: wage }));
  btnWageSubmit.disabled = false;
  if (!ok) return;
  closeOverlay(wageOverlay);
  showToast(wage ? '時給換算を表示します' : '時給換算をオフにしました');
});

// ============================================================
// Events
// ============================================================
tabButtons.forEach((b) => b.addEventListener('click', () => {
  state.tab = (b.dataset.tab as Tab) ?? 'home';
  renderTabs();
  window.scrollTo({ top: 0 });
}));

btnFab.addEventListener('click', () => openKaizenModal(null));
$('btn-first').addEventListener('click', () => openKaizenModal(null));
$('btn-to-review').addEventListener('click', () => {
  state.tab = 'review';
  renderTabs();
  window.scrollTo({ top: 0 });
});
$('btn-wage').addEventListener('click', openWageModal);

$('btn-kaizen-close').addEventListener('click', closeKaizenModal);
$('btn-kaizen-cancel').addEventListener('click', closeKaizenModal);
$('btn-wage-close').addEventListener('click', () => closeOverlay(wageOverlay));
$('btn-wage-cancel').addEventListener('click', () => closeOverlay(wageOverlay));
$('btn-celebrate-ok').addEventListener('click', () => {
  closeOverlay(celebrateOverlay);
  checkMilestone();
});

btnConfirmCancel.addEventListener('click', () => {
  state.confirmAction = null;
  closeOverlay(confirmOverlay);
});
btnConfirmOk.addEventListener('click', async () => {
  const action = state.confirmAction;
  state.confirmAction = null;
  closeOverlay(confirmOverlay);
  if (action) await action();
});

// 背景クリック・Escで閉じる（確認ダイアログを最優先）
const overlayClosers: [HTMLElement, () => void][] = [
  [confirmOverlay, () => { state.confirmAction = null; closeOverlay(confirmOverlay); }],
  [celebrateOverlay, () => closeOverlay(celebrateOverlay)],
  [kaizenOverlay, closeKaizenModal],
  [wageOverlay, () => closeOverlay(wageOverlay)],
  [feedbackOverlay, () => closeOverlay(feedbackOverlay)],
];
overlayClosers.forEach(([overlay, close]) => {
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = overlayClosers.find(([o]) => o.classList.contains('is-open'));
  if (open) open[1]();
});

// Feedback
feedbackBtn.addEventListener('click', () => {
  openOverlay(feedbackOverlay);
  inputFeedbackMessage.focus();
});
btnFeedbackClose.addEventListener('click', () => closeOverlay(feedbackOverlay));
btnFeedbackSend.addEventListener('click', async () => {
  const message = inputFeedbackMessage.value.trim();
  if (!message) {
    showToast('メッセージを入力してください');
    return;
  }
  if (btnFeedbackSend.disabled) return;
  btnFeedbackSend.disabled = true;
  btnFeedbackSend.textContent = '送信中…';
  const ok = await submitFeedback(message);
  btnFeedbackSend.disabled = false;
  btnFeedbackSend.textContent = '送信する';
  if (ok) {
    inputFeedbackMessage.value = '';
    closeOverlay(feedbackOverlay);
    showToast('送信しました。ありがとうございます！');
  } else {
    showToast('送信に失敗しました。時間をおいて再度お試しください');
  }
});

// 貯金額は1秒ごとに更新し、ほかの表示は1分ごとに更新する（開きっぱなし対策）
window.setInterval(() => {
  if (state.tab === 'home' && !document.hidden) renderBank();
}, 1000);
window.setInterval(() => {
  if (state.uid && !document.hidden) renderAll();
}, 60000);

// ============================================================
// Auth
// ============================================================
btnGoogleLogin.addEventListener('click', async () => {
  if (btnGoogleLogin.disabled) return;
  btnGoogleLogin.disabled = true;
  try {
    await loginWithGoogle();
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      console.error(err);
      showToast('ログインに失敗しました。もう一度お試しください');
    }
  } finally {
    btnGoogleLogin.disabled = false;
  }
});

btnLogout.addEventListener('click', async () => {
  try {
    await logout();
  } catch (err) {
    console.error(err);
    showToast('ログアウトに失敗しました');
  }
});

const onLoadError = (err: Error): void => {
  console.error(err);
  showToast('データの読み込みに失敗しました。再読み込みしてください');
};

function onLogin(user: User): void {
  state.uid = user.uid;
  loginScreen.classList.add('hidden');
  appEl.classList.remove('hidden');
  userInfo.classList.remove('hidden');
  userAvatar.src = user.photoURL ?? '';
  userAvatar.classList.toggle('hidden', !user.photoURL);
  userAvatar.alt = user.displayName ?? '';
  userName.textContent = user.displayName ?? '';
  state.unsubscribes = [
    subscribeKaizen(user.uid, (list) => {
      state.kaizen = list;
      state.loaded.kaizen = true;
      renderAll();
    }, onLoadError),
    subscribeProfile(user.uid, (profile) => {
      state.profile = profile;
      state.loaded.profile = true;
      renderAll();
    }, onLoadError),
  ];
  renderAll();
}

function onLogout(): void {
  state.unsubscribes.forEach((u) => u());
  state.unsubscribes = [];
  state.uid = null;
  state.kaizen = [];
  state.profile = { ...EMPTY_PROFILE };
  state.loaded = { kaizen: false, profile: false };
  state.celebratedLocal = 0;
  [kaizenOverlay, wageOverlay, celebrateOverlay, confirmOverlay].forEach(closeOverlay);
  state.editingId = null;
  appEl.classList.add('hidden');
  loginScreen.classList.remove('hidden');
  userInfo.classList.add('hidden');
}

onAuthChange((user) => (user ? onLogin(user) : onLogout()));
