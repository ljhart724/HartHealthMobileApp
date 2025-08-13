// File: theme/ThemeContext.js

import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  // Accent color (already supported)
  const [accentColor, setAccentColor] = useState('#FFC5D3'); // default pink

  // NEW: Light/Dark mode (persisted)
  const [mode, setMode] = useState('dark'); // 'dark' | 'light'

  useEffect(() => {
    (async () => {
      try {
        const storedAccent = await AsyncStorage.getItem('accentColor');
        if (storedAccent) setAccentColor(storedAccent);
        const storedMode = await AsyncStorage.getItem('themeMode');
        if (storedMode) setMode(storedMode);
      } catch {}
    })();
  }, []);

  const updateAccentColor = async (color) => {
    try {
      setAccentColor(color);
      await AsyncStorage.setItem('accentColor', color);
    } catch (err) {
      console.warn('⚠️ Failed to save accent color', err);
    }
  };

  const updateMode = async (next) => {
    try {
      setMode(next);
      await AsyncStorage.setItem('themeMode', next);
    } catch (err) {
      console.warn('⚠️ Failed to save theme mode', err);
    }
  };

  // Minimal palette the app can use
  const theme = mode === 'dark'
  ? {
      bg: '#000',
      surface: '#111',
      card: '#181818',      // NEW
      input: '#1a1a1a',     // NEW
      text: '#fff',
      headerBg: '#000',
      headerText: '#fff',
      drawerBg: '#111',
    }
  : {
      bg: '#fff',
      surface: '#f7f7f7',
      card: '#f0f0f0',      // NEW
      input: '#f2f2f2',     // NEW
      text: '#000',
      headerBg: '#fff',
      headerText: '#000',
      drawerBg: '#fff',
    };

  return (
    <ThemeContext.Provider
      value={{ accentColor, setAccentColor: updateAccentColor, mode, setMode: updateMode, theme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
