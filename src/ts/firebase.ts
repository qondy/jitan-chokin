import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// NOTE: Firebase の Web 設定は秘匿情報ではなく、実質的な防御は firestore.rules 側で行う。
// （他のミニアプリと同様に、この値はコミットして良い）
const firebaseConfig = {
  apiKey: 'AIzaSyB4zYd-UJOlaG0bxTdpKXMYzym7slLFQFE',
  authDomain: 'jitan-chokin.firebaseapp.com',
  projectId: 'jitan-chokin',
  storageBucket: 'jitan-chokin.firebasestorage.app',
  messagingSenderId: '70753393551',
  appId: '1:70753393551:web:5265f1a1f2f029ef3d89fa',
};

export const app = initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
