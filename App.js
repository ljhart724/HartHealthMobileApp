// File: App.js

import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createDrawerNavigator } from '@react-navigation/drawer';
import WorkoutLogScreen from './screens/WorkoutLogScreen';
import EatingLogScreen from './screens/EatingLogScreen';
import PersonalGoalsScreen from './screens/PersonalGoalsScreen';
import SettingsScreen from './screens/SettingsScreen';
import { GoalsProvider } from './context/GoalsContext';
import { ThemeProvider, useTheme } from './theme/ThemeContext';

// 👇 NEW: auth listener
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebaseConfig';

const Drawer = createDrawerNavigator();

function AppNavigator() {
  const { theme } = useTheme();

  return (
    <NavigationContainer>
      <Drawer.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: theme.headerBg },
          headerTintColor: theme.headerText,
          drawerStyle: { backgroundColor: theme.drawerBg },
          drawerLabelStyle: { color: theme.text },
          headerTitle: 'HartHealth',
        }}
      >
        <Drawer.Screen name="Workout Log" component={WorkoutLogScreen} />
        <Drawer.Screen name="Eating Log" component={EatingLogScreen} />
        <Drawer.Screen name="Personal / Goals" component={PersonalGoalsScreen} />
        <Drawer.Screen name="Settings" component={SettingsScreen} />
      </Drawer.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [booted, setBooted] = useState(false);
  const [user, setUser] = useState(null);

  // ✅ Persisted login: wait for Firebase to restore the session
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      setBooted(true);
    });
    return unsub;
  }, []);

  // Optional: show nothing (or a splash) while we check auth
  if (!booted) return null;

  return (
    <ThemeProvider>
      <GoalsProvider>
        <AppNavigator />
      </GoalsProvider>
    </ThemeProvider>
  );
}
