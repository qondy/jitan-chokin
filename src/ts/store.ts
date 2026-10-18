import {
  collection, doc, onSnapshot, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { isDateKey } from './dates';
import { isCategory, isFreqUnit } from './templates';
import { Kaizen, KaizenInput, Profile } from './types';

type ErrorHandler = (err: Error) => void;

const toMillis = (v: unknown): number => (v instanceof Timestamp ? v.toMillis() : Date.now());
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// ===== 効率化したこと =====
export function subscribeKaizen(uid: string, onData: (list: Kaizen[]) => void, onError: ErrorHandler): () => void {
  return onSnapshot(collection(db, 'users', uid, 'kaizen'), (snap) => {
    const list: Kaizen[] = [];
    snap.forEach((d) => {
      const data = d.data();
      if (
        typeof data.title !== 'string' || !isCategory(data.category) || !isFreqUnit(data.freqUnit)
        || !isNum(data.beforeMin) || !isNum(data.afterMin) || !isNum(data.freqCount) || !isDateKey(data.startDate)
      ) return;
      list.push({
        id: d.id,
        title: data.title,
        category: data.category,
        beforeMin: Math.max(0, data.beforeMin),
        afterMin: Math.max(0, data.afterMin),
        freqCount: Math.max(0, data.freqCount),
        freqUnit: data.freqUnit,
        startDate: data.startDate,
        endDate: isDateKey(data.endDate) ? data.endDate : null,
        memo: typeof data.memo === 'string' ? data.memo : '',
        createdAt: toMillis(data.createdAt),
      });
    });
    list.sort((a, b) => b.createdAt - a.createdAt);
    onData(list);
  }, onError);
}

export async function createKaizen(uid: string, input: KaizenInput): Promise<void> {
  await addDoc(collection(db, 'users', uid, 'kaizen'), { ...input, createdAt: serverTimestamp() });
}

export function updateKaizen(uid: string, id: string, input: KaizenInput): Promise<void> {
  return updateDoc(doc(db, 'users', uid, 'kaizen', id), { ...input });
}

export function setKaizenEnd(uid: string, id: string, endDate: string | null): Promise<void> {
  return updateDoc(doc(db, 'users', uid, 'kaizen', id), { endDate });
}

export function deleteKaizen(uid: string, id: string): Promise<void> {
  return deleteDoc(doc(db, 'users', uid, 'kaizen', id));
}

// ===== 設定 =====
export function subscribeProfile(uid: string, onData: (p: Profile) => void, onError: ErrorHandler): () => void {
  return onSnapshot(doc(db, 'users', uid, 'settings', 'profile'), (snap) => {
    const data = snap.data() ?? {};
    onData({
      hourlyWage: isNum(data.hourlyWage) && data.hourlyWage > 0 ? data.hourlyWage : null,
      celebratedMin: isNum(data.celebratedMin) ? data.celebratedMin : 0,
    });
  }, onError);
}

export function saveProfile(uid: string, patch: Partial<Profile>): Promise<void> {
  return setDoc(doc(db, 'users', uid, 'settings', 'profile'), patch, { merge: true });
}
