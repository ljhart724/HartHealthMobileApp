// File: screens/EatingLogScreen.js
import React, { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTheme } from '../theme/ThemeContext';
import { db, auth } from '../firebaseConfig';
import {
  collection,
  setDoc,
  doc,
  getDocs,
  query,
  where,
  getDoc,
  deleteDoc,              // ✅ ensure remote delete
} from 'firebase/firestore';
import { useSubscription } from '../utils/subscription';

// Backend base URL (simulator vs emulator vs prod)
const LOCAL_BASE = Platform.select({
  ios: 'http://localhost:8000',     // iOS Simulator talks to your Mac's localhost
  android: 'http://10.0.2.2:8000',  // Android Emulator maps host loopback to 10.0.2.2
  default: 'http://localhost:8000',
});
const BACKEND_URL = 'https://hartbackend.onrender.com';

// --- Stable IDs (no churn) ---
const genId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
function ensureStableIdsOnce(arr) {
  const seen = new Set();
  let changed = false;
  const out = (arr || []).map((l) => {
    let id = l.id;
    if (!id) { id = genId(); changed = true; }
    while (seen.has(id)) { id = genId(); changed = true; }
    seen.add(id);
    return { ...l, id };
  });
  return { out, changed };
}

const createMeal = (type) => ({
  type,
  name: '',
  calories: '',
  notes: '',
});

const createLog = () => ({
  id: genId(),
  date: new Date(),
  collapsed: false,
  meals: [],
  feedback: '',
});

// Namespaced per user
const storageKey = (uid) => `eatingLogs:${uid ?? 'anon'}`;

// === Personalization context (goals + memories) ===
const goalsKey = (uid) => `goals:${uid}`;
const memoriesKey = (uid) => `memories:${uid}`;
const personalKey = (uid) => `personalGoals:${uid}`; // namespaced Personal/Goals object
const personalKeyOld = 'personalGoals';              // legacy global key

function normalizeList(val) {
  // Accept: ["a","b"] OR [{text:"a"}, {text:"b"}]
  if (!val) return [];
  if (Array.isArray(val)) {
    return val
      .map((v) => (typeof v === 'string' ? v : v?.text ?? ''))
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

async function getUserContextText() {
  const currentUid = auth.currentUser?.uid;
  let goals = [];
  let memories = [];

  // 1) Try per-user simple keys
  if (currentUid) {
    try {
      const [gRaw, mRaw] = await Promise.all([
        AsyncStorage.getItem(goalsKey(currentUid)),
        AsyncStorage.getItem(memoriesKey(currentUid)),
      ]);
      goals = normalizeList(gRaw ? JSON.parse(gRaw) : []);
      memories = normalizeList(mRaw ? JSON.parse(mRaw) : []);
    } catch {}
  }

  // 2) Try Personal/Goals object (namespaced then legacy)
  if ((!goals.length && !memories.length) && currentUid) {
    try {
      const pRaw = await AsyncStorage.getItem(personalKey(currentUid));
      if (pRaw) {
        const obj = JSON.parse(pRaw);
        goals = normalizeList(obj?.goals);
        memories = normalizeList(obj?.memories);
      }
    } catch {}
  }
  if (!goals.length && !memories.length) {
    try {
      const pOld = await AsyncStorage.getItem(personalKeyOld);
      if (pOld) {
        const obj = JSON.parse(pOld);
        goals = normalizeList(obj?.goals);
        memories = normalizeList(obj?.memories);
      }
    } catch {}
  }

  // 3) Prefer Firestore userJournal/{uid} if present
  if (currentUid) {
    try {
      const snap = await getDoc(doc(db, 'userJournal', currentUid));
      if (snap.exists()) {
        const d = snap.data() || {};
        const gFS = normalizeList(d.goals);
        const mFS = normalizeList(d.memories);
        if (gFS.length) goals = gFS;
        if (mFS.length) memories = mFS;
      }
    } catch {}
  }

  const goalsLine = goals.length ? goals.map((g) => `- ${g}`).join('\n') : 'None';
  const memsLine = memories.length ? memories.map((m) => `- ${m}`).join('\n') : 'None';

  return `User Goals:\n${goalsLine}\n\nImportant Memories:\n${memsLine}`;
}
// === Pull a short summary of recent Workout Logs (cloud preferred, local fallback) ===
async function getRecentWorkoutSummary(maxDays = 7, maxItems = 3) {
  const u = auth.currentUser?.uid;
  if (!u) return '';

  try {
    const qRef = query(collection(db, 'workoutLogs'), where('userId', '==', u));
    const snap = await getDocs(qRef);
    const cloud = snap.docs.map(d => d.data());

    const localRaw = await AsyncStorage.getItem(`workoutLogs:${u}`);
    const local = localRaw ? JSON.parse(localRaw) : [];

    const items = (cloud.length ? cloud : local)
      .map(l => ({ ...l, date: new Date(l.date) }))
      .sort((a,b) => b.date - a.date)
      .filter(l => (Date.now() - l.date.getTime())/86400000 <= maxDays)
      .slice(0, maxItems);

    if (!items.length) return '';

    const lines = items.map((log, i) => {
      const day = `${log.date.getMonth()+1}/${log.date.getDate()}`;
      const rowBits = (log.rows || []).slice(0, 3).map(r => {
        const base = r.exercise || r.type || 'exercise';
        if (r.sets || r.reps || r.weight) {
          const srw = [
            r.sets ? `${r.sets} sets` : '',
            r.reps ? `${r.reps} reps` : '',
            r.weight ? `${r.weight} wt` : '',
          ].filter(Boolean).join(' • ');
          return `${base}${srw ? ` — ${srw}` : ''}`;
        }
        if (r.duration || r.distance || r.pace) {
          const cdp = [
            r.duration ? `${r.duration} min` : '',
            r.distance ? `${r.distance} mi` : '',
            r.pace ? `${r.pace} pace` : '',
          ].filter(Boolean).join(' • ');
          return `${base}${cdp ? ` — ${cdp}` : ''}`;
        }
        return base;
      }).join(' | ');
      return `${i+1}. ${day}: ${rowBits || 'no details'}`;
    });

    return lines.join('\n');
  } catch {
    return '';
  }
}

const loadLogs = async (setLogs) => {
  try {
    const currentUid = auth.currentUser?.uid;

    // If signed out, show nothing (or a fresh empty log)
    if (!currentUid) {
      setLogs([]);
      return;
    }

    // 1) Load local for THIS user
    const stored = await AsyncStorage.getItem(storageKey(currentUid));
    const local = stored
      ? JSON.parse(stored).map((log) => ({ ...log, date: new Date(log.date) }))
      : [];

    // 2) Load cloud for THIS user (keep Firestore doc id and reconstruct id if missing)
const qRef = query(collection(db, 'eatingLogs'), where('userId', '==', currentUid));
const snap = await getDocs(qRef);
const cloud = snap.docs.map((d) => {
  const data = d.data() || {};
  const maybeIdFromDoc = d.id.includes('_') ? d.id.split('_').slice(1).join('_') : d.id;
  const id = data.id || maybeIdFromDoc;                 // <-- ensure we have a stable id
  const date = data.date ? new Date(data.date) : new Date();
  return { ...data, id, _docId: d.id, date };           // <-- keep _docId for deletes/sync
});

// 3) Prefer cloud if present; otherwise local, then de‑dupe by id (keep newest)
const chosen = (cloud.length ? cloud : local).map((log) => ({
  ...log,
  date: new Date(log.date),
}));

const byId = new Map();
for (const l of chosen) {
  const key = l.id;
  const prev = byId.get(key);
  if (!prev || new Date(l.date) > new Date(prev.date)) byId.set(key, l);
}
let base = Array.from(byId.values());
if (!base.length) base = [createLog()];

const { out, changed } = ensureStableIdsOnce(base);
setLogs(out);

    // If we had to fix IDs, persist to local so they stay stable next load
    if (changed) {
      try {
        await AsyncStorage.setItem(storageKey(currentUid), JSON.stringify(out));
        // Do NOT immediately push to Firestore here; let normal edits trigger sync
      } catch (e) {
        console.warn('⚠️ Failed to persist fixed IDs', e);
      }
    }
  } catch (err) {
    console.error('❌ Error loading logs:', err);
  }
};

// ⛏️ delete exact Firestore doc (prefer _docId, fallback to composed id)
async function deleteLogEverywhere(log) {
  try {
    const currentUid = auth.currentUser?.uid;
    if (!currentUid) return;
    const docId = log?._docId || `${currentUid}_${log?.id}`;
    await deleteDoc(doc(collection(db, 'eatingLogs'), docId));
  } catch (e) {
    console.warn('⚠️ Firestore delete failed', e);
  }
}


export default function EatingLogScreen() {
  const { accentColor, theme } = useTheme();
  const [logs, setLogs] = useState([]);
  const [showPicker, setShowPicker] = useState(null);
  const [submittingById, setSubmittingById] = useState({});
  const setSubmitting = (id, v) => setSubmittingById((prev) => ({ ...prev, [id]: !!v }));

  const { loading: subLoading, isSubscriber } = useSubscription();

  // Save locally for everyone; cloud sync only for logged-in subscribers
  const persistLogs = async (nextLogs) => {
    try {
      const currentUid = auth.currentUser?.uid;

      // Always save locally (per-user key if logged in, otherwise a local key)
      await AsyncStorage.setItem(storageKey(currentUid || 'local'), JSON.stringify(nextLogs));

      // Cloud sync only if logged in + subscriber
      if (!subLoading && currentUid && isSubscriber) {
        await syncToFirestore(nextLogs, currentUid);
      }
    } catch (err) {
      console.error('❌ Error saving logs:', err);
    }
  };

  const syncToFirestore = async (logsToSave, currentUid) => {
  try {
    if (!currentUid || !isSubscriber) return; // safety gate

    const writes = logsToSave.map(async (log) => {
      const docId = log._docId || `${currentUid}_${log.id}`;   // reuse existing doc when possible
      await setDoc(doc(collection(db, 'eatingLogs'), docId), {
        ...log,
        id: log.id,                                            // ensure id is stored in data for future loads
        _docId: undefined,                                     // don't store meta in Firestore
        date: new Date(log.date).toISOString(),
        userId: currentUid,
      });
      return { ...log, _docId: docId };                        // reflect back so deletes use the right doc id
    });

    const updated = await Promise.all(writes);

    // mirror _docId back into state + local cache so it stays stable
    setLogs((prev) => {
      const map = new Map(updated.map((u) => [u.id, u]));
      const merged = prev.map((l) => (map.has(l.id) ? map.get(l.id) : l));
      AsyncStorage.setItem(storageKey(currentUid), JSON.stringify(merged));
      return merged;
    });
  } catch (err) {
    console.warn('❌ Failed to sync to Firestore:', err);
  }
};

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (u) {
        loadLogs(setLogs); // signed in → load this user's logs
      } else {
        setLogs([]); // signed out → clear immediately
      }
    });
    return unsub;
  }, []);

  const addLog = () => {
    setLogs((prev) => {
      const updated = [createLog(), ...prev];
      persistLogs(updated);
      return updated;
    });
  };

  const updateMeals = (logId, newMeal) => {
    setLogs((prev) => {
      const updated = prev.map((log) =>
        log.id === logId ? { ...log, meals: [...log.meals, newMeal] } : log
      );
      persistLogs(updated);
      return updated;
    });
  };

  const handleAddMeal = (logId) => {
    Alert.alert('Meal Type', 'Choose meal type:', [
      { text: 'Breakfast', onPress: () => updateMeals(logId, createMeal('Breakfast')) },
      { text: 'Lunch', onPress: () => updateMeals(logId, createMeal('Lunch')) },
      { text: 'Dinner', onPress: () => updateMeals(logId, createMeal('Dinner')) },
      { text: 'Snack', onPress: () => updateMeals(logId, createMeal('Snack')) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const updateMealField = (logId, index, field, value) => {
    setLogs((prev) => {
      const updated = prev.map((log) =>
        log.id === logId
          ? {
              ...log,
              meals: log.meals.map((m, i) => (i === index ? { ...m, [field]: value } : m)),
            }
          : log
      );
      persistLogs(updated);
      return updated;
    });
  };

  const removeMeal = (logId, index) => {
    setLogs((prev) => {
      const updated = prev.map((log) =>
        log.id === logId ? { ...log, meals: log.meals.filter((_, i) => i !== index) } : log
      );
      persistLogs(updated);
      return updated;
    });
  };

  const updateDate = (logId, selectedDate) => {
    setLogs((prev) => {
      const updated = prev.map((log) => (log.id === logId ? { ...log, date: selectedDate } : log));
      persistLogs(updated);
      return updated;
    });
  };

  const toggleCollapse = (logId) => {
    setLogs((prev) => {
      const updated = prev.map((log) =>
        log.id === logId ? { ...log, collapsed: !log.collapsed } : log
      );
      persistLogs(updated);
      return updated;
    });
  };

  const formatDate = (d) => {
    if (!(d instanceof Date)) d = new Date(d);
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear().toString().slice(-2)}`;
  };

  const handleSubmit = async (logId) => {
    // 🛑 Double‑tap guard
    if (submittingById[logId]) return;

    const target = logs.find((l) => l.id === logId);
    if (!target || target.meals.length === 0) return;

    // 🚪 Gate at submit time (popup)
    if (!auth.currentUser) {
      Alert.alert('Login required', 'Please log in to submit meals and get AI nutrition feedback.');
      return;
    }
    if (subLoading) {
      Alert.alert('Please wait', 'Checking your subscription…');
      return;
    }
    if (!isSubscriber) {
      Alert.alert('HartHealth Pro required', '$6/month unlocks meal submissions and AI feedback.');
      return;
    }

    const summary = target.meals
      .map(
        (meal, i) =>
          `${i + 1}. [${meal.type}] ${meal.name || 'N/A'} — ${meal.calories} cal ${
            meal.notes ? `(${meal.notes})` : ''
          }`
      )
      .join('\n');

    setSubmitting(logId, true);
    try {
      const userContext = await getUserContextText();
      const token = await auth.currentUser?.getIdToken();
      const recentWorkouts = await getRecentWorkoutSummary();

      const res = await fetch(`${BACKEND_URL}/ai/groq-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          model: 'llama3-70b-8192',
          messages: [
  {
    role: 'system',
    content:
      "You are a world-class nutritionist. Be supportive, specific, and realistic. Use the user's goals/memories for context and keep advice practical."
  },
  {
    role: 'user',
    content:
`USER CONTEXT (goals & memories):
${userContext}

TODAY'S MEALS (user-entered):
${summary}

${recentWorkouts ? `RECENT WORKOUTS (last week, most recent first):\n${recentWorkouts}\n` : ''}

Write the response with these sections:

**What You Ate Today (parsed)**
- Brief bullet list that restates the meals with simple labels (breakfast/lunch/dinner/snacks) and approx calories if provided.

**Alignment With Your Goals**
- Call out which goals this day supports (or not) and *why* (e.g., protein total, fiber, hydration, calorie balance, timing).

**Training Fit (from recent workouts)**
- 2–4 bullets linking today's fueling to recent training demands (strength vs endurance): pre/post-workout timing, carb & protein amounts, hydration. Give concrete fixes for the next session.

**What To Do Next**
- 3 highly specific actions for tomorrow: exact snack/meal ideas with grams/ounces, fluid targets, simple swaps, and any macro targets.`
  }
  ],
        }),
      });

      // ✅ Friendlier error check
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 402) {
          Alert.alert('HartHealth Pro required', '$6/month unlocks meal submissions and AI feedback.');
          return; // finally will still run, resetting the flag
        }
        throw new Error(err.detail || `Server error ${res.status}`);
      }

      const data = await res.json();
      const feedback = data?.choices?.[0]?.message?.content || 'No feedback received.';

      setLogs((prev) => {
        const updated = prev.map((l) => (l.id === logId ? { ...l, feedback } : l));
        persistLogs(updated);
        return updated;
      });
    } catch (err) {
      console.error('❌ Groq error:', err);
      Alert.alert('Error', 'Failed to get nutrition feedback.');
    } finally {
      setSubmitting(logId, false); // 🔚 always clear the in‑flight flag
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.bg }]}>
      <TouchableOpacity style={[styles.addLogBtn, { backgroundColor: accentColor }]} onPress={addLog}>
        <Text style={styles.addLogText}>+ Add Eating Log</Text>
      </TouchableOpacity>

      {logs.map((log) => (
        <View key={log.id} style={[styles.logBox, { borderColor: accentColor, backgroundColor: theme.surface }]}>
          <View style={[styles.headerRow, { flexWrap: 'wrap', gap: 12 }]}>
            <Text style={[styles.label, { color: theme.text }]}>Date:</Text>
            <TouchableOpacity
              onPress={() => setShowPicker(log.id)}
              style={[styles.dateInput, { backgroundColor: theme.input, borderColor: '#555' }]}
            >
              <Text style={{ color: theme.text }}>{formatDate(log.date)}</Text>
            </TouchableOpacity>

            {showPicker === log.id && (
              <DateTimePicker
                value={log.date}
                mode="date"
                display="default"
                onChange={(e, d) => {
                  if (e.type === 'set' && d) {
                    setShowPicker(null);
                    updateDate(log.id, d);
                  } else {
                    setShowPicker(null);
                  }
                }}
              />
            )}

            <TouchableOpacity onPress={() => toggleCollapse(log.id)}>
              <Text style={[styles.collapseToggle, { color: accentColor }]}>{log.collapsed ? '▲' : '▼'}</Text>
            </TouchableOpacity>

            {!log.collapsed && (
              <TouchableOpacity
                onPress={() =>
                  Alert.alert('Confirm', 'Are you sure you want to delete this log?', [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: async () => {
                        setLogs((prev) => {
                          const updated = prev.filter((l) => l.id !== log.id);
                          persistLogs(updated);
                          return updated;
                        });
                        await deleteLogEverywhere(log);    // ✅ remove exact remote doc
                      },
                    },
                  ])
                }
                style={styles.trashIcon}
              >
                <Text style={styles.trashIconText}>🗑</Text>
              </TouchableOpacity>
            )}
          </View>

          {!log.collapsed &&
            log.meals.map((meal, index) => (
              <View key={index} style={[styles.mealGroup, { backgroundColor: theme.card }]}>
                <Text style={[styles.mealType, { color: accentColor }]}>{meal.type}</Text>
                {['name', 'calories', 'notes'].map((field) => (
                  <View key={field} style={styles.inputWrapper}>
                    <Text style={[styles.label, { color: theme.text }]}>
                      {field.charAt(0).toUpperCase() + field.slice(1)}
                    </Text>
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: theme.input, color: theme.text, borderColor: '#555' },
                      ]}
                      value={meal[field]}
                      onChangeText={(val) =>
                        setLogs((prev) => {
                          const updated = prev.map((l) =>
                            l.id === log.id
                              ? {
                                  ...l,
                                  meals: l.meals.map((m, i) => (i === index ? { ...m, [field]: val } : m)),
                                }
                              : l
                          );
                          persistLogs(updated);
                          return updated;
                        })
                      }
                      placeholder=""
                      placeholderTextColor="#aaa"
                    />
                  </View>
                ))}
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={() =>
                    setLogs((prev) => {
                      const updated = prev.map((l) =>
                        l.id === log.id
                          ? { ...l, meals: l.meals.filter((_, i) => i !== index) }
                          : l
                      );
                      persistLogs(updated);
                      return updated;
                    })
                  }
                >
                  <Text style={styles.removeBtnText}>Remove Meal</Text>
                </TouchableOpacity>
              </View>
            ))}

          {!log.collapsed && (
            <>
              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: accentColor }]}
                onPress={() =>
                  Alert.alert('Meal Type', 'Choose meal type:', [
                    { text: 'Breakfast', onPress: () => updateMeals(log.id, createMeal('Breakfast')) },
                    { text: 'Lunch', onPress: () => updateMeals(log.id, createMeal('Lunch')) },
                    { text: 'Dinner', onPress: () => updateMeals(log.id, createMeal('Dinner')) },
                    { text: 'Snack', onPress: () => updateMeals(log.id, createMeal('Snack')) },
                    { text: 'Cancel', style: 'cancel' },
                  ])
                }
              >
                <Text style={styles.addBtnText}>+ Add Meal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitBtn, submittingById[log.id] && { opacity: 0.5 }]}
                disabled={!!submittingById[log.id]}
                onPress={() => handleSubmit(log.id)}
              >
                <Text style={styles.submitBtnText}>
                  {submittingById[log.id] ? 'Submitting…' : 'Submit Meals'}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {!!log.feedback && !log.collapsed && (
            <View style={[styles.feedbackBox, { borderColor: accentColor, backgroundColor: theme.card }]}>
              <Text style={[styles.feedbackText, { color: theme.text }]}>{log.feedback}</Text>
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  addLogBtn: { alignSelf: 'flex-start', padding: 12, borderRadius: 8, marginBottom: 16 },
  addLogText: { fontWeight: 'bold', color: '#000' },
  logBox: { backgroundColor: '#111', borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 30 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dateInput: {
    marginLeft: 10,
    backgroundColor: '#1a1a1a',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#555',
  },
  collapseToggle: { fontSize: 20, fontWeight: 'bold' },
  inputWrapper: { marginBottom: 10 },
  label: { color: '#ccc', fontSize: 12, marginBottom: 4 },
  input: { backgroundColor: '#1a1a1a', color: '#fff', padding: 8, borderRadius: 6, borderColor: '#555', borderWidth: 1 },
  mealGroup: { marginBottom: 20, backgroundColor: '#181818', padding: 10, borderRadius: 8 },
  mealType: { fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  addBtn: { padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 16 },
  addBtnText: { fontWeight: 'bold', color: '#000' },
  submitBtn: { backgroundColor: '#00e5ff', padding: 14, borderRadius: 8, alignItems: 'center' },
  submitBtnText: { color: '#000', fontWeight: 'bold' },
  removeBtn: { backgroundColor: '#550000', padding: 8, borderRadius: 6, marginTop: 8, alignItems: 'center' },
  removeBtnText: { color: '#fff' },
  feedbackBox: { backgroundColor: '#181818', borderWidth: 1, padding: 14, borderRadius: 8, marginTop: 10 },
  feedbackText: { color: '#fff', fontSize: 13, lineHeight: 18 },
  trashIcon: { marginLeft: 10, padding: 4 },
  trashIconText: { fontSize: 18, color: '#f66' },
});
