import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme/ThemeContext';
import { db, auth } from '../firebaseConfig';
import { useSubscription } from '../utils/subscription';
import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  deleteDoc,
  getDoc,
} from 'firebase/firestore';

// Backend base URL (simulator vs emulator vs prod)
const LOCAL_BASE = Platform.select({
  ios: 'http://localhost:8000',     // iOS Simulator → Mac localhost
  android: 'http://10.0.2.2:8000',  // Android Emulator → host loopback
  default: 'http://localhost:8000',
});
const BACKEND_URL = 'https://hartbackend.onrender.com';
// --- Unique IDs + normalization ---
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2,9)}`;

function ensureUniqueIds(arr) {
  const seen = new Set();
  return (arr || []).map(l => {
    let id = l.id || uid();
    while (seen.has(id)) id = uid();
    seen.add(id);
    return { ...l, id };
  });
}

const createRow = (type) => ({
  type,
  exercise: '',
  sets: '',
  reps: '',
  weight: '',
  duration: '',
  distance: '',
  pace: '',
  notes: '',
});

const createLog = () => ({
  id: uid(),
  date: new Date(),
  collapsed: false,
  rows: [],
  feedback: '',
});

// === Personalization context (goals + memories) ===
const goalsKey        = (uid) => `goals:${uid}`;
const memoriesKey     = (uid) => `memories:${uid}`;
const personalKey     = (uid) => `personalGoals:${uid}`; // namespaced Personal/Goals
const personalKeyOld  = 'personalGoals';                 // legacy global key

function normalizeList(val) {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val
      .map(v => (typeof v === 'string' ? v : (v?.text ?? '')))
      .map(s => s.trim())
      .filter(Boolean);
  }
  return [];
}

async function getUserContextText() {
  const uid = auth.currentUser?.uid;
  let goals = [];
  let memories = [];

  if (uid) {
    try {
      const [gRaw, mRaw] = await Promise.all([
        AsyncStorage.getItem(goalsKey(uid)),
        AsyncStorage.getItem(memoriesKey(uid)),
      ]);
      goals = normalizeList(gRaw ? JSON.parse(gRaw) : []);
      memories = normalizeList(mRaw ? JSON.parse(mRaw) : []);
    } catch {}
  }

  if ((!goals.length && !memories.length) && uid) {
    try {
      const pRaw = await AsyncStorage.getItem(personalKey(uid));
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

  if (uid) {
    try {
      const snap = await getDoc(doc(db, 'userJournal', uid));
      if (snap.exists()) {
        const d = snap.data() || {};
        const gFS = normalizeList(d.goals);
        const mFS = normalizeList(d.memories);
        if (gFS.length) goals = gFS;
        if (mFS.length) memories = mFS;
      }
    } catch {}
  }

  const goalsLine = goals.length ? goals.map(g => `- ${g}`).join('\n') : 'None';
  const memsLine  = memories.length ? memories.map(m => `- ${m}`).join('\n') : 'None';

  return `User Goals:\n${goalsLine}\n\nImportant Memories:\n${memsLine}`;
}
// === Pull a short summary of recent Eating Logs (cloud preferred, local fallback) ===
async function getRecentEatingSummary(maxDays = 7, maxItems = 3) {
  const u = auth.currentUser?.uid;
  if (!u) return '';

  try {
    // Try Firestore first
    const qRef = query(collection(db, 'eatingLogs'), where('userId', '==', u));
    const snap = await getDocs(qRef);
    const cloud = snap.docs.map(d => d.data());

    // Fallback to local if no cloud
    const localRaw = await AsyncStorage.getItem(`eatingLogs:${u}`);
    const local = localRaw ? JSON.parse(localRaw) : [];

    const items = (cloud.length ? cloud : local)
      .map(l => ({ ...l, date: new Date(l.date) }))
      .sort((a,b) => b.date - a.date)
      .filter(l => (Date.now() - l.date.getTime())/86400000 <= maxDays)
      .slice(0, maxItems);

    if (!items.length) return '';

    const lines = items.map((log, i) => {
      const day = `${log.date.getMonth()+1}/${log.date.getDate()}`;
      const mealBits = (log.meals || []).slice(0, 3).map(m => {
        const cal = m.calories ? `${m.calories} cal` : '';
        const nm  = m.name || m.type || 'meal';
        return [nm, cal].filter(Boolean).join(' — ');
      }).join(' | ');
      return `${i+1}. ${day}: ${mealBits || 'no meals logged'}`;
    });

    return lines.join('\n');
  } catch {
    return '';
  }
}

// Per-user AsyncStorage key
const storageKey = (uid) => `workoutLogs:${uid}`;

export default function WorkoutLogScreen() {
  const { accentColor, theme } = useTheme();
  const [logs, setLogs] = useState([]);
  const [showPicker, setShowPicker] = useState(null);

  const { loading: subLoading, isSubscriber } = useSubscription();
  const user = auth.currentUser;
  const canWrite = !subLoading && !!user && isSubscriber;

  // double‑tap guard: per‑log in‑flight flags
  const [submittingById, setSubmittingById] = useState({});
  const setSubmitting = (id, v) =>
    setSubmittingById(prev => ({ ...prev, [id]: !!v }));

  const persistLogs = async (logs) => {
    try {
      const uid = auth.currentUser?.uid;
      await AsyncStorage.setItem(storageKey(uid || 'local'), JSON.stringify(logs));
      if (!subLoading && uid && isSubscriber) {
        await syncToFirestore(logs);
      }
    } catch (err) {
      console.error('❌ Error saving logs:', err);
    }
  };

  const syncToFirestore = async (logsToSave) => {
    if (!canWrite) return;
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const writes = logsToSave.map((log) =>
        setDoc(doc(db, 'workoutLogs', `${uid}_${log.id}`), {
          ...log,
          date: log.date.toISOString(),
          userId: uid,
        })
      );
      await Promise.all(writes);
    } catch (err) {
      console.warn('❌ Firestore sync failed', err);
    }
  };

  const loadLogs = async () => {
    try {
      const uid = auth.currentUser?.uid;
      const key = storageKey(uid || 'local');

      const localRaw = await AsyncStorage.getItem(key);
      const local = localRaw
        ? JSON.parse(localRaw).map((l) => ({ ...l, date: new Date(l.date) }))
        : [];

      if (uid) {
        const qRef = query(collection(db, 'workoutLogs'), where('userId', '==', uid));
        const snap = await getDocs(qRef);
        const remoteLogs = snap.docs.map((d) => ({
          ...d.data(),
          date: new Date(d.data().date),
        }));
        if (remoteLogs.length) {
  const normalized = ensureUniqueIds(remoteLogs);
  setLogs(normalized);
  await AsyncStorage.setItem(storageKey(uid), JSON.stringify(normalized));
  return;
}
      }
      setLogs(ensureUniqueIds(local));
    } catch (err) {
      console.warn('❌ Load logs failed', err);
    }
  };

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(() => {
      loadLogs();
    });
    loadLogs();
    return unsub;
  }, []);

  const addLog = () => {
    const updated = [createLog(), ...logs];
    setLogs(updated);
    persistLogs(updated);
  };

  const handleAddRow = (logId) => {
    Alert.alert('Row Type', 'Choose workout type:', [
      { text: 'Strength', onPress: () => updateRows(logId, createRow('Strength')) },
      { text: 'Cardio', onPress: () => updateRows(logId, createRow('Cardio')) },
      { text: 'Fitness', onPress: () => updateRows(logId, createRow('Fitness')) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const updateRows = (logId, newRow) => {
    const updated = logs.map((log) =>
      log.id === logId ? { ...log, rows: [...log.rows, newRow] } : log
    );
    setLogs(updated);
    persistLogs(updated);
  };

  const handleInputChange = (logId, rowIdx, field, value) => {
    const updated = logs.map((log) =>
      log.id === logId
        ? {
            ...log,
            rows: log.rows.map((row, i) =>
              i === rowIdx ? { ...row, [field]: value } : row
            ),
          }
        : log
    );
    setLogs(updated);
    persistLogs(updated);
  };

  const handleRemoveRow = (logId, index) => {
    const updated = logs.map((log) =>
      log.id === logId
        ? { ...log, rows: log.rows.filter((_, i) => i !== index) }
        : log
    );
    setLogs(updated);
    persistLogs(updated);
  };

  const updateDate = (logId, selectedDate) => {
    const updated = logs.map((log) =>
      log.id === logId ? { ...log, date: selectedDate } : log
    );
    setLogs(updated);
    persistLogs(updated);
  };

  const toggleCollapse = (logId) => {
    const updated = logs.map((log) =>
      log.id === logId ? { ...log, collapsed: !log.collapsed } : log
    );
    setLogs(updated);
    persistLogs(updated);
  };

  const handleDeleteLog = (logId) => {
    Alert.alert('Delete Log?', '', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const updated = logs.filter((l) => l.id !== logId);
          setLogs(updated);
          persistLogs(updated);
          try {
            const uid = auth.currentUser?.uid;
            if (uid) {
              await deleteDoc(doc(db, 'workoutLogs', `${uid}_${logId}`));
            }
          } catch (e) {
            console.warn('⚠️ Firestore delete failed', e);
          }
        },
      },
    ]);
  };

  const formatDate = (d) => {
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    return `${month}/${day}/${year}`;
  };

  // ========= GUARDed submit =========
  const handleSubmit = async (logId) => {
    // 🛑 Double‑tap guard
    if (submittingById[logId]) return;

    const log = logs.find((l) => l.id === logId);
    if (!log || log.rows.length === 0) return;

    // 🚪 Gate at submit time
    if (!auth.currentUser) {
      Alert.alert('Login required', 'Please log in to submit a workout and get AI feedback.');
      return;
    }
    if (subLoading) {
      Alert.alert('Please wait', 'Checking your subscription…');
      return;
    }
    if (!isSubscriber) {
      Alert.alert('HartHealth Pro required', '$6/month unlocks workout submissions and AI feedback.');
      return;
    }

    // Build a compact, informative summary of the workout
    const summary = log.rows
      .map((row, i) => {
        const details = Object.entries(row)
          .filter(([k, v]) =>
            !['type', 'exercise', 'notes'].includes(k) && String(v ?? '').trim() !== ''
          )
          .map(([k, v]) => `${k}=${v}`)
          .join(', ');
        const notes = row.notes ? ` | notes: ${row.notes}` : '';
        return `${i + 1}. [${row.type}] ${row.exercise || 'N/A'}${details ? ' — ' + details : ''}${notes}`;
      })
      .join('\n');

    // Pull goals/memories to personalize the coaching
    const userContext = await getUserContextText();

    setSubmitting(logId, true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const recentEating = await getRecentEatingSummary();
      const response = await fetch(`${BACKEND_URL}/ai/groq-chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          model: 'llama3-70b-8192',
          temperature: 0.6,
          max_tokens: 700,
          messages: [
  {
    role: 'system',
    content:
`You are a precise, encouraging personal coach.
- Use the user's goals/memories as context.
- Analyze whether today's workout moves the user toward those goals.
- Call out concrete physiological benefits (strength, hypertrophy, endurance, VO2max, mobility, etc.).
- If misaligned, explain *why* and give a fix.
- Keep tone supportive and direct. Use short bullets and clear headings.`
  },
  {
    role: 'user',
    content:
`USER CONTEXT (goals + memories):
${userContext}

TODAY'S WORKOUT:
${summary}

${recentEating ? `RECENT EATING (last week, most recent first):\n${recentEating}\n` : ''}

Write the response with these sections:

**Benefits You Just Earned**
- 4–8 bullets naming specific adaptations and muscle groups from today's session.

**Alignment With Your Goals**
- State explicitly which goal(s) this session supports (or doesn't) and *why*.

**What To Do Next**
- 3 specific actions for the next session/week (sets/reps/weight progression for strength; time/distance/pace/HR for cardio; recovery notes).

**Fueling Check (from recent meals)**
- 2–4 bullets connecting recent nutrition to today's training: pre/post-workout timing, carb/protein adequacy, hydration, and concrete fixes for next session.`
  }
],
        }),
      });

      // ✅ Pro gate & server errors
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        if (response.status === 402) {
          Alert.alert('HartHealth Pro required', '$6/month unlocks workout submissions and AI feedback.');
          return; // finally will still run to clear submitting state
        }
        throw new Error(err.detail || `Server error ${response.status}`);
      }

      const data = await response.json();
      const feedback = data?.choices?.[0]?.message?.content || 'No feedback received.';

      const updated = logs.map((l) => (l.id === logId ? { ...l, feedback } : l));
      setLogs(updated);
      persistLogs(updated);
    } catch (err) {
      Alert.alert('Error', 'AI feedback failed.');
    } finally {
      setSubmitting(logId, false); // 🔚 always clear the in‑flight flag
    }
  };

  const renderRowFields = (row, index, logId) => {
    const fields =
      row.type === 'Strength'
        ? ['exercise', 'sets', 'reps', 'weight', 'notes']
        : row.type === 'Cardio'
        ? ['exercise', 'duration', 'distance', 'pace', 'notes']
        : ['exercise', 'notes'];

    return (
      <View key={index} style={[styles.rowGroup, { backgroundColor: theme.card }]}>
        <Text style={[styles.rowTitle, { color: accentColor }]}>{row.type}</Text>
        {fields.map((field) => (
          <View key={field} style={styles.inputWrapper}>
            <Text style={[styles.label, { color: theme.text }]}>{field}</Text>
            <TextInput
              style={[styles.input, { backgroundColor: theme.input, color: theme.text, borderColor: '#555' }]}
              value={row[field]}
              onChangeText={(val) => handleInputChange(logId, index, field, val)}
              placeholder=""
              placeholderTextColor="#aaa"
            />
          </View>
        ))}
        <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemoveRow(logId, index)}>
          <Text style={styles.removeBtnText}>Remove Row</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.bg }]}>
      <TouchableOpacity onPress={addLog} style={[styles.addLogBtn, { backgroundColor: accentColor }]}>
        <Text style={styles.addLogBtnText}>+ Add Workout Log</Text>
      </TouchableOpacity>

      {logs.map((log) => (
        <View key={log.id} style={[styles.logBox, { borderColor: accentColor, backgroundColor: theme.surface }]}>
          <View style={[styles.logHeader, { flexWrap: 'wrap', gap: 12 }]}>
            <Text style={[styles.label, { color: theme.text }]}>Date:</Text>

            <TouchableOpacity
              onPress={() => setShowPicker(log.id)}
              style={[styles.dateInput, { backgroundColor: theme.input }]}
            >
              <Text style={{ color: theme.text }}>{formatDate(log.date)}</Text>
            </TouchableOpacity>

            {showPicker === log.id && (
              <DateTimePicker
                value={log.date}
                mode="date"
                display="default"
                onChange={(e, d) => {
                  if (e.type === 'set' && d) updateDate(log.id, d);
                  setShowPicker(null);
                }}
              />
            )}

            <TouchableOpacity onPress={() => toggleCollapse(log.id)}>
              <Text style={[styles.collapseToggle, { color: accentColor }]}>
                {log.collapsed ? '▲' : '▼'}
              </Text>
            </TouchableOpacity>

            {!log.collapsed && (
              <TouchableOpacity onPress={() => handleDeleteLog(log.id)}>
                <Text style={[styles.trashIconText, { color: theme.text }]}>🗑</Text>
              </TouchableOpacity>
            )}
          </View>

          {!log.collapsed && (
            <>
              {log.rows.map((row, i) => renderRowFields(row, i, log.id))}

              <TouchableOpacity
                style={[styles.addBtn, { backgroundColor: accentColor }]}
                onPress={() => handleAddRow(log.id)}
              >
                <Text style={styles.addBtnText}>+ Add Row</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.submitBtn, submittingById[log.id] && { opacity: 0.5 }]}
                disabled={!!submittingById[log.id]}
                onPress={() => handleSubmit(log.id)}
              >
                <Text style={styles.submitBtnText}>
                  {submittingById[log.id] ? 'Submitting…' : 'Submit Workout'}
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
  addLogBtnText: { color: '#000', fontWeight: 'bold' },
  logBox: { backgroundColor: '#111', borderWidth: 1, borderRadius: 12, padding: 16, marginBottom: 30 },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  dateSection: { flexDirection: 'row', alignItems: 'center' },
  dateInput: {
    marginLeft: 10,
    backgroundColor: '#1a1a1a',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#555',
  },
  collapseToggle: { fontSize: 20, fontWeight: 'bold' },
  logHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  trashIconText: { fontSize: 18, color: '#fff' },
  rowGroup: { marginBottom: 20, backgroundColor: '#181818', padding: 10, borderRadius: 8 },
  rowTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  inputWrapper: { marginBottom: 10 },
  label: { color: '#ccc', fontSize: 12, marginBottom: 4 },
  input: {
    backgroundColor: '#1a1a1a',
    color: '#fff',
    padding: 8,
    borderRadius: 6,
    borderColor: '#555',
    borderWidth: 1,
  },
  removeBtn: { padding: 8, borderRadius: 6, marginTop: 8, alignItems: 'center' },
  removeBtnText: { color: '#fff' },
  addBtn: { padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 16 },
  addBtnText: { fontWeight: 'bold', color: '#000' },
  submitBtn: { backgroundColor: '#00e5ff', padding: 14, borderRadius: 8, alignItems: 'center' },
  submitBtnText: { color: '#000', fontWeight: 'bold' },
  feedbackBox: { backgroundColor: '#181818', borderWidth: 1, padding: 14, borderRadius: 8, marginTop: 10 },
  feedbackText: { color: '#fff', fontSize: 13, lineHeight: 18 },
});