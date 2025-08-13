// File: utils/subscription.js
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db, auth } from '../firebaseConfig';

/** Definition (super short):
 * Subscription gate = we check users/{uid}.isSubscriber to decide if premium actions are allowed.
 */

export function useSubscription() {
  const [loading, setLoading] = useState(true);
  const [isSubscriber, setIsSubscriber] = useState(false);

  useEffect(() => {
    const u = auth.currentUser;
    if (!u) { setIsSubscriber(false); setLoading(false); return; }

    const ref = doc(db, 'users', u.uid);
    const unsub = onSnapshot(ref, (snap) => {
      setIsSubscriber(Boolean(snap.data()?.isSubscriber));
      setLoading(false);
    }, () => {
      setIsSubscriber(false);
      setLoading(false);
    });

    return unsub;
  }, []);

  return { loading, isSubscriber };
}

export async function fetchIsSubscriberOnce() {
  const u = auth.currentUser;
  if (!u) return false;
  const snap = await getDoc(doc(db, 'users', u.uid));
  return Boolean(snap.data()?.isSubscriber);
}
