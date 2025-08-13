// File: screens/SettingsScreen.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { GoogleAuthProvider, signInWithCredential, reauthenticateWithCredential, EmailAuthProvider, deleteUser } from 'firebase/auth';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { auth, db } from '../firebaseConfig';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
} from 'firebase/auth';
import {
  doc,
  getDocs,
  deleteDoc,
  collection,
} from 'firebase/firestore';

WebBrowser.maybeCompleteAuthSession();

export default function SettingsScreen() {
  // ---- Google Sign-In (PROD iOS; native; no proxy) ----
const IOS_CLIENT_ID = '197939323493-luqi5ni1mg71m387a8bie2kleeahkdll.apps.googleusercontent.com';

// If you don't care about Android right now, reuse iOS ID so the hook is defined.
const ANDROID_CLIENT_ID = IOS_CLIENT_ID;

const [request, response, promptAsync] = Google.useIdTokenAuthRequest(
  {
    iosClientId: IOS_CLIENT_ID,
    androidClientId: ANDROID_CLIENT_ID, // temp; replace later with real Android ID
    scopes: ['profile', 'email'],
    prompt: 'select_account',
  },
  { useProxy: false } // native redirect: harthealth:/oauthredirect
);

  useEffect(() => {
    if (response?.type === 'success') {
      const id_token =
        response?.params?.id_token || response?.authentication?.idToken;
      if (id_token) {
        const cred = GoogleAuthProvider.credential(id_token);
        signInWithCredential(auth, cred).catch((err) =>
          Alert.alert('Google Sign-In Failed', err?.message ?? String(err))
        );
      }
    }
  }, [response]);

  const handleGoogleSignIn = async () => {
    try {
      await promptAsync();
    } catch (e) {
      Alert.alert('Google Sign-In Failed', e?.message ?? String(e));
    }
  };

  const { accentColor, setAccentColor, mode, setMode } = useTheme();
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Delete Account UI state
const [showDeleteUI, setShowDeleteUI] = useState(false);
const [deletePassword, setDeletePassword] = useState('');
const [deleting, setDeleting] = useState(false);


  const colors = [
    { label: 'Pink', value: '#FFC5D3' },
    { label: 'Blue', value: '#00CED1' },
  ];

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(setUser);
    return unsubscribe;
  }, []);

  const isValidEmail = (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email.trim());
  };

  const handleSignIn = async () => {
    if (!isValidEmail(email)) {
      return Alert.alert('Invalid Email', 'Please enter a valid email address.');
    }
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      setEmail('');
      setPassword('');
    } catch (err) {
      Alert.alert('Sign In Failed', err.message);
    }
  };

  const handleSignUp = async () => {
    if (!isValidEmail(email)) {
      return Alert.alert('Invalid Email', 'Please enter a valid email address.');
    }
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), password);
      setEmail('');
      setPassword('');
    } catch (err) {
      Alert.alert('Sign Up Failed', err.message);
    }
  };

  const handleSignOut = async () => {
    try {
      const uid = auth.currentUser?.uid;

      // Remove per-user caches (include both ":" and "_" variants) + old globals
      const keysToRemove = [
        `workoutLogs:${uid}`,
        `workoutLogs_${uid}`,
        `eatingLogs:${uid}`,
        `eatingLogs_${uid}`,
        `goals:${uid}`,
        `goals_${uid}`,
        `memories:${uid}`,
        `memories_${uid}`,
        'workoutLogs',
        'eatingLogs',
        'goals',
        'memories',
      ];

      try {
        await AsyncStorage.multiRemove(keysToRemove);
      } catch (e) {
        console.warn('Failed to clear local caches on sign-out:', e);
      }

      await signOut(auth);
    } catch (err) {
      Alert.alert('Sign Out Failed', err?.message ?? String(err));
    }
  };

  const handlePasswordReset = async () => {
    if (!isValidEmail(email)) {
      return Alert.alert('Invalid Email', 'Please enter a valid email address.');
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      Alert.alert('Reset Email Sent', 'Check your inbox to reset your password.');
    } catch (err) {
      Alert.alert('Reset Failed', err.message);
    }
  };
  // Delete all documents in a subcollection (simple batches)
async function deleteAllDocsInSubcollection(parentPath, subcollectionName, batchSize = 100) {
  const subColRef = collection(db, `${parentPath}/${subcollectionName}`);
  while (true) {
    const snap = await getDocs(subColRef);
    if (snap.empty) break;
    const deletions = [];
    let count = 0;
    snap.forEach((d) => {
      if (count < batchSize) {
        deletions.push(deleteDoc(doc(db, d.ref.path)));
        count++;
      }
    });
    if (deletions.length === 0) break;
    await Promise.all(deletions);
    if (snap.size < batchSize) break;
  }
}

// Delete a whole log bucket like workoutLogs/{uid} including entries/*
async function deleteLogBucket(bucketName, uid) {
  const parentPath = `${bucketName}/${uid}`;
  // Adjust 'entries' if your subcollection name differs
  await deleteAllDocsInSubcollection(parentPath, 'entries');
  try { await deleteDoc(doc(db, parentPath)); } catch (e) { /* ok if it didn't exist */ }
}

// Remove AsyncStorage keys for this user
async function clearUserAsyncStorage(uid) {
  // Keep this targeted; mirrors your sign-out clears
  const keysToRemove = [
    `workoutLogs:${uid}`,
    `workoutLogs_${uid}`,
    `eatingLogs:${uid}`,
    `eatingLogs_${uid}`,
    `goals:${uid}`,
    `goals_${uid}`,
    `memories:${uid}`,
    `memories_${uid}`,
    'workoutLogs',
    'eatingLogs',
    'goals',
    'memories',
  ];
  try {
    await AsyncStorage.multiRemove(keysToRemove);
  } catch (e) {
    console.warn('Failed to clear local caches on delete:', e);
  }
}

// Full cascade delete of Firestore user data
async function deleteUserFirestoreData(uid) {
  await deleteLogBucket('workoutLogs', uid);
  await deleteLogBucket('eatingLogs', uid);
  await deleteLogBucket('userJournal', uid); // only if you actually use this
  try { await deleteDoc(doc(db, 'users', uid)); } catch (e) { /* ok if missing */ }
}

// Handle delete for password accounts
async function handleConfirmDeletePassword() {
  const user = auth.currentUser;
  if (!user) return Alert.alert('Not logged in', 'Please sign in first.');
  if (!deletePassword.trim()) return Alert.alert('Password required', 'Enter your password to continue.');

  try {
    setDeleting(true);
    // Re-auth
    const cred = EmailAuthProvider.credential(user.email, deletePassword);
    await reauthenticateWithCredential(user, cred);

    // Data deletes
    await deleteUserFirestoreData(user.uid);
    await clearUserAsyncStorage(user.uid);

    // Delete auth user
    await deleteUser(user);

    Alert.alert('Account deleted', 'Your account and data have been removed.');
  } catch (err) {
    console.error('Delete account error:', err);
    Alert.alert('Delete failed', err?.message ?? 'Something went wrong.');
  } finally {
    setDeleting(false);
    setShowDeleteUI(false);
    setDeletePassword('');
  }
}

// Handle delete for Google accounts (reauth with Google first)
async function handleConfirmDeleteWithGoogle(promptAsyncFn) {
  const user = auth.currentUser;
  if (!user) return Alert.alert('Not logged in', 'Please sign in first.');

  try {
    setDeleting(true);

    // Start Google reauth flow
    const res = await promptAsyncFn();
    if (res?.type !== 'success') {
      setDeleting(false);
      return Alert.alert('Re-auth required', 'Google confirmation was cancelled.');
    }
    const id_token = res?.params?.id_token || res?.authentication?.idToken;
    if (!id_token) {
      setDeleting(false);
      return Alert.alert('Re-auth failed', 'No Google token. Try again.');
    }

    const gCred = GoogleAuthProvider.credential(id_token);
    await reauthenticateWithCredential(user, gCred);

    // Data deletes
    await deleteUserFirestoreData(user.uid);
    await clearUserAsyncStorage(user.uid);

    // Delete auth user
    await deleteUser(user);

    Alert.alert('Account deleted', 'Your account and data have been removed.');
  } catch (err) {
    console.error('Delete account error:', err);
    Alert.alert('Delete failed', err?.message ?? 'Something went wrong.');
  } finally {
    setDeleting(false);
    setShowDeleteUI(false);
    setDeletePassword('');
  }
}

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Choose Your Accent Color</Text>
      <Text style={[styles.header, { marginTop: 24 }]}>Appearance</Text>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        <TouchableOpacity
          onPress={() => setMode('light')}
          style={[
            styles.modeBtn,
            {
              borderColor: accentColor,
              backgroundColor: mode === 'light' ? accentColor : 'transparent',
            },
          ]}
        >
          <Text
            style={[
              styles.modeBtnText,
              { color: mode === 'light' ? '#000' : accentColor },
            ]}
          >
            Light
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setMode('dark')}
          style={[
            styles.modeBtn,
            {
              borderColor: accentColor,
              backgroundColor: mode === 'dark' ? accentColor : 'transparent',
            },
          ]}
        >
          <Text
            style={[
              styles.modeBtnText,
              { color: mode === 'dark' ? '#000' : accentColor },
            ]}
          >
            Dark
          </Text>
        </TouchableOpacity>
      </View>

      {colors.map(({ label, value }) => (
        <TouchableOpacity
          key={label}
          style={[
            styles.colorButton,
            { backgroundColor: value, borderColor: accentColor },
          ]}
          onPress={() => setAccentColor(value)}
        >
          <Text style={styles.colorLabel}>{label}</Text>
        </TouchableOpacity>
      ))}

      <View style={{ marginTop: 40 }}>
        {user ? (
          <>
            <Text style={styles.header}>Signed in as:</Text>
            <Text style={{ color: '#ccc', marginBottom: 10 }}>
              {user.email}
            </Text>
            <TouchableOpacity
              onPress={handleSignOut}
              style={[styles.authBtn, { backgroundColor: accentColor }]}
            >
              <Text style={styles.authBtnText}>Sign Out</Text>
            </TouchableOpacity>
            {/* Danger Zone */}
<View style={{ marginTop: 24, padding: 16, backgroundColor: '#1a1a1a', borderRadius: 12, borderWidth: 1, borderColor: '#442' }}>
  <Text style={{ color:'#fff', fontSize:16, fontWeight:'700', marginBottom: 8 }}>Danger Zone</Text>
  <Text style={{ color:'#bbb', marginBottom: 12 }}>
    Permanently delete your account and all associated data (workouts, eating logs, journals).
  </Text>

  {!showDeleteUI ? (
    <TouchableOpacity
      onPress={() => setShowDeleteUI(true)}
      style={{ backgroundColor:'#5a0000', padding:14, borderRadius:10, alignItems:'center' }}>
      <Text style={{ color:'#fff', fontWeight:'bold' }}>Delete Account</Text>
    </TouchableOpacity>
  ) : (
    <View style={{ gap:10 }}>
      {/* If password user: show password field. If Google user: show reauth with Google */}
      {user?.providerData?.[0]?.providerId === 'password' ? (
        <>
          <Text style={{ color:'#f88' }}>
            This action is permanent. Confirm your password to continue.
          </Text>
          <TextInput
            value={deletePassword}
            onChangeText={setDeletePassword}
            placeholder="Enter password"
            placeholderTextColor="#888"
            secureTextEntry
            style={{
              color:'#fff', borderColor:'#555', borderWidth:1, borderRadius:8, padding:12
            }}
          />
          <View style={{ flexDirection:'row', gap:10 }}>
            <TouchableOpacity
              disabled={deleting}
              onPress={() => { setShowDeleteUI(false); setDeletePassword(''); }}
              style={{ flex:1, backgroundColor:'#333', padding:14, borderRadius:10, alignItems:'center' }}>
              <Text style={{ color:'#fff' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={deleting}
              onPress={handleConfirmDeletePassword}
              style={{ flex:1, backgroundColor:'#b00000', padding:14, borderRadius:10, alignItems:'center', opacity: deleting ? 0.6 : 1 }}>
              <Text style={{ color:'#fff', fontWeight:'bold' }}>{deleting ? 'Deleting…' : 'Confirm Delete'}</Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <>
          <Text style={{ color:'#f88' }}>
            You signed in with Google. Confirm via Google to proceed.
          </Text>
          <View style={{ flexDirection:'row', gap:10 }}>
            <TouchableOpacity
              disabled={deleting}
              onPress={() => { setShowDeleteUI(false); setDeletePassword(''); }}
              style={{ flex:1, backgroundColor:'#333', padding:14, borderRadius:10, alignItems:'center' }}>
              <Text style={{ color:'#fff' }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              disabled={deleting}
              onPress={() => handleConfirmDeleteWithGoogle(promptAsync)}
              style={{ flex:1, backgroundColor:'#b00000', padding:14, borderRadius:10, alignItems:'center', opacity: deleting ? 0.6 : 1 }}>
              <Text style={{ color:'#fff', fontWeight:'bold' }}>{deleting ? 'Deleting…' : 'Confirm with Google'}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  )}
</View>
          </>
        ) : (
          <>
            <Text style={styles.header}>Login or Sign Up</Text>
            <TextInput
              placeholder="Email"
              placeholderTextColor="#aaa"
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <TextInput
              placeholder="Password"
              placeholderTextColor="#aaa"
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              secureTextEntry
            />
            <TouchableOpacity
              onPress={handleSignIn}
              style={[styles.authBtn, { backgroundColor: accentColor }]}
            >
              <Text style={styles.authBtnText}>Sign In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSignUp}
              style={[
                styles.authBtn,
                { backgroundColor: accentColor, marginTop: 8 },
              ]}
            >
              <Text style={styles.authBtnText}>Sign Up</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleGoogleSignIn}
              style={[
                styles.authBtn,
                { backgroundColor: accentColor, marginTop: 8 },
              ]}
              disabled={!request} // disabled until the hook is ready
            >
              <Text style={styles.authBtnText}>Continue with Google</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handlePasswordReset}
              style={[
                styles.authBtn,
                { backgroundColor: 'transparent', marginTop: 12 },
              ]}
            >
              <Text style={[styles.authBtnText, { color: accentColor }]}>
                Forgot Password?
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    flex: 1,
    padding: 24,
  },
  header: {
    fontSize: 20,
    color: '#fff',
    marginBottom: 16,
    fontWeight: 'bold',
  },
  colorButton: {
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
    marginBottom: 16,
    alignItems: 'center',
  },
  colorLabel: {
    color: '#000',
    fontWeight: 'bold',
  },
  input: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
    padding: 12,
    borderRadius: 8,
    borderColor: '#555',
    borderWidth: 1,
    marginBottom: 10,
  },
  authBtn: {
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  authBtnText: {
    color: '#000',
    fontWeight: 'bold',
  },
  modeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  modeBtnText: {
    fontWeight: 'bold',
  },
});
