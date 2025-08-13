// File: firebaseConfig.js (Expo Go + persistent auth)

import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { initializeAuth, getAuth, getReactNativePersistence } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: 'AIzaSyDhbBgviJWQH1XsQ1bWD-q0Zm4SdnPqIBQ',
  authDomain: 'harthealth724.firebaseapp.com',
  projectId: 'harthealth724',
  storageBucket: 'harthealth724.appspot.com',
  messagingSenderId: '701095720590',
  appId: '1:701095720590:web:780f11f138e35e5c6a3bdf',
  measurementId: 'G-LY6ECHFQPT',
};

// Avoid re-initializing during Fast Refresh
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

// IMPORTANT: Persist auth in React Native via AsyncStorage
let auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  // If auth was already initialized (Fast Refresh), fall back to the existing instance
  auth = getAuth(app);
}

export { app, auth, db };
