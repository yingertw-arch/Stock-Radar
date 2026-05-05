import { initializeApp } from 'firebase/app'
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot } from 'firebase/firestore'

// Replace with your actual Firebase project config
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY      || '',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN  || '',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID   || '',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MSG_SENDER   || '',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID       || '',
}

const app    = initializeApp(firebaseConfig)
const db     = getFirestore(app)
const COLL   = 'watchlist'

/** Subscribe to the watchlist in realtime. cb receives array of {symbol, name, addedAt} */
export function subscribeWatchlist(cb) {
  return onSnapshot(collection(db, COLL), snap => {
    cb(snap.docs.map(d => d.data()).sort((a, b) => (a.addedAt > b.addedAt ? -1 : 1)))
  })
}

/** Add a stock to the watchlist */
export async function addToWatchlist({ symbol, name, sector }) {
  await setDoc(doc(db, COLL, symbol), {
    symbol,
    name:    name    || symbol,
    sector:  sector  || '',
    addedAt: new Date().toISOString(),
  })
}

/** Remove a stock from the watchlist */
export async function removeFromWatchlist(symbol) {
  await deleteDoc(doc(db, COLL, symbol))
}
