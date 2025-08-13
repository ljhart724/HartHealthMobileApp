import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '../firebaseConfig';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { useTheme } from '../theme/ThemeContext';

export default function PersonalGoalsScreen() {
  const { accentColor, theme } = useTheme();
  const [memories, setMemories] = useState([]);
  const [goals, setGoals] = useState([]);
  const [newMemory, setNewMemory] = useState('');
  const [newGoal, setNewGoal] = useState('');

  const storageKey = (uid) => `personalGoals:${uid ?? 'anon'}`;

  const persistData = async (updatedMemories, updatedGoals) => {
  const data = { memories: updatedMemories, goals: updatedGoals };
  const uid = auth.currentUser?.uid;
  try {
    if (!uid) return; // don’t persist when signed out

    // Save under a user-scoped key
    await AsyncStorage.setItem(storageKey(uid), JSON.stringify(data));

    // Save to Firestore (source of truth)
    await setDoc(doc(db, 'userJournal', uid), data);
  } catch (err) {
    console.warn('❌ Could not persist memories/goals:', err);
  }
};

  const loadData = async () => {
  try {
    const uid = auth.currentUser?.uid;

    // If not logged in: show nothing (or load "anon" if you want)
    if (!uid) {
      setMemories([]);
      setGoals([]);

      // OPTIONAL: if you want anonymous local notes, uncomment:
      // const anonLocal = await AsyncStorage.getItem(storageKey(null));
      // if (anonLocal) {
      //   const { memories = [], goals = [] } = JSON.parse(anonLocal);
      //   setMemories(memories);
      //   setGoals(goals);
      // }
      return;
    }

    // 1) Load local cache for this user
    const local = await AsyncStorage.getItem(storageKey(uid));
    if (local) {
      const { memories = [], goals = [] } = JSON.parse(local);
      setMemories(memories);
      setGoals(goals);
    } else {
      setMemories([]);
      setGoals([]);
    }

    // 2) Load from Firestore for this user (source of truth)
    const snap = await getDoc(doc(db, 'userJournal', uid));
    if (snap.exists()) {
      const { memories = [], goals = [] } = snap.data();
      setMemories(memories);
      setGoals(goals);

      // refresh local cache from cloud
      await AsyncStorage.setItem(storageKey(uid), JSON.stringify({ memories, goals }));
    }
  } catch (err) {
    console.warn('❌ Failed to load journal data:', err);
  }
};

  useEffect(() => {
  const unsub = auth.onAuthStateChanged((u) => {
    if (u) {
      loadData();              // signed in → load this user’s data
    } else {
      setMemories([]);         // signed out → clear UI immediately
      setGoals([]);
    }
  });
  return unsub;
}, []);

  const addMemory = () => {
    if (newMemory.trim()) {
      const updated = [...memories, newMemory];
      setMemories(updated);
      setNewMemory('');
      persistData(updated, goals);
    }
  };

  const removeMemory = (index) => {
    const updated = memories.filter((_, i) => i !== index);
    setMemories(updated);
    persistData(updated, goals);
  };

  const addGoal = () => {
    if (newGoal.trim()) {
      const updated = [...goals, newGoal];
      setGoals(updated);
      setNewGoal('');
      persistData(memories, updated);
    }
  };

  const removeGoal = (index) => {
    const updated = goals.filter((_, i) => i !== index);
    setGoals(updated);
    persistData(memories, updated);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.bg }]}>
      <Text style={[styles.title, { color: theme.text }]}>Journal</Text>

      <View style={styles.tChart}>
        <View style={styles.column}>
          <Text style={[styles.columnHeader, { color: theme.text }]}>Memories</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.input, color: theme.text, borderColor: accentColor }]}
            placeholder="Write a memory..."
            placeholderTextColor="#aaa"
            value={newMemory}
            onChangeText={setNewMemory}
          />
          <TouchableOpacity style={[styles.button, { backgroundColor: accentColor }]} onPress={addMemory}>
            <Text style={styles.buttonText}>+ Add</Text>
          </TouchableOpacity>
          {memories.map((item, index) => (
            <View key={index} style={[styles.itemBox, { backgroundColor: theme.card, borderColor: accentColor }]}>
              <Text style={[styles.itemText, { color: theme.text }]}>{item}</Text>
              <TouchableOpacity onPress={() => removeMemory(index)}>
                <Text style={[styles.removeText, { color: accentColor }]}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={styles.column}>
          <Text style={[styles.columnHeader, { color: theme.text }]}>Goals</Text>
          <TextInput
            style={[styles.input, { backgroundColor: theme.input, color: theme.text, borderColor: accentColor }]}
            placeholder="Write a goal..."
            placeholderTextColor="#aaa"
            value={newGoal}
            onChangeText={setNewGoal}
          />
          <TouchableOpacity style={[styles.button, { backgroundColor: accentColor }]} onPress={addGoal}>
            <Text style={styles.buttonText}>+ Add</Text>
          </TouchableOpacity>
          {goals.map((item, index) => (
            <View key={index} style={[styles.itemBox, { backgroundColor: theme.card, borderColor: accentColor }]}>
              <Text style={[styles.itemText, { color: theme.text }]}>{item}</Text>
              <TouchableOpacity onPress={() => removeGoal(index)}>
                <Text style={[styles.removeText, { color: accentColor }]}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // keep defaults; theme overrides above will handle colors
  container: { flex: 1, backgroundColor: '#000', padding: 20 },
  title: {
    color: '#fff',
    fontSize: 28,
    fontWeight: 'bold',
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 20,
  },
  tChart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 20,
  },
  column: { flex: 1 },
  columnHeader: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 10,
    textAlign: 'center',
  },
  input: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
    borderWidth: 1,
    padding: 12,
    borderRadius: 8,
    marginBottom: 10,
  },
  button: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonText: { color: '#000', fontWeight: 'bold' },
  itemBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#1a1a1a',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
  },
  itemText: { color: '#fff', flex: 1 },
  removeText: { fontWeight: 'bold', paddingLeft: 10 },
});
