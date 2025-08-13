// File: context/GoalsContext.js

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  getFirestore,
} from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

const GoalsContext = createContext();

export function GoalsProvider({ children }) {
  const [goals, setGoals] = useState([]);
  const [memories, setMemories] = useState([]);
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUserId(user.uid);
        subscribeToData(user.uid);
      } else {
        setUserId(null);
        setGoals([]);
        setMemories([]);
      }
    });

    return () => unsubscribe();
  }, []);

  const subscribeToData = (uid) => {
    const goalsRef = collection(db, 'users', uid, 'goals');
    const memoriesRef = collection(db, 'users', uid, 'memories');

    const unsubGoals = onSnapshot(goalsRef, (snapshot) => {
      setGoals(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    const unsubMemories = onSnapshot(memoriesRef, (snapshot) => {
      setMemories(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubGoals();
      unsubMemories();
    };
  };

  const addGoal = async (text) => {
    if (!userId || !text.trim()) return;
    const ref = collection(db, 'users', userId, 'goals');
    await addDoc(ref, { text });
  };

  const removeGoal = async (id) => {
    if (!userId) return;
    await deleteDoc(doc(db, 'users', userId, 'goals', id));
  };

  const addMemory = async (text) => {
    if (!userId || !text.trim()) return;
    const ref = collection(db, 'users', userId, 'memories');
    await addDoc(ref, { text });
  };

  const removeMemory = async (id) => {
    if (!userId) return;
    await deleteDoc(doc(db, 'users', userId, 'memories', id));
  };

  return (
    <GoalsContext.Provider
      value={{ goals, memories, addGoal, removeGoal, addMemory, removeMemory }}
    >
      {children}
    </GoalsContext.Provider>
  );
}

export const useGoals = () => useContext(GoalsContext);
