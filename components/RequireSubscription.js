// File: components/RequireSubscription.js
import React from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { auth } from '../firebaseConfig';
import { useSubscription } from '../utils/subscription';
import { useTheme } from '../theme/ThemeContext';

export default function RequireSubscription({ children, onShowLogin, onShowPaywall }) {
  const { loading, isSubscriber } = useSubscription();
  const { accentColor } = useTheme();
  const user = auth.currentUser;

  if (loading) {
    return (
      <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
        <ActivityIndicator />
        <Text style={{ color:'#fff', marginTop:12 }}>Checking access…</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={{ flex:1, padding:24, gap:12, justifyContent:'center' }}>
        <Text style={{ color:'#fff', fontSize:18, fontWeight:'600' }}>Login required</Text>
        <Text style={{ color:'#bbb' }}>Please log in to use HartHealth.</Text>
        <TouchableOpacity
          onPress={onShowLogin}
          style={{ backgroundColor: accentColor || '#00e5ff', padding:14, borderRadius:10, alignItems:'center' }}>
          <Text style={{ color:'#000', fontWeight:'bold' }}>Log in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!isSubscriber) {
    return (
      <View style={{ flex:1, padding:24, gap:12, justifyContent:'center' }}>
        <Text style={{ color:'#fff', fontSize:18, fontWeight:'600' }}>HartHealth Pro required</Text>
        <Text style={{ color:'#bbb' }}>$6/month unlocks logs, AI feedback, and cloud sync.</Text>
        <TouchableOpacity
          onPress={onShowPaywall}
          style={{ backgroundColor: accentColor || '#00e5ff', padding:14, borderRadius:10, alignItems:'center' }}>
          <Text style={{ color:'#000', fontWeight:'bold' }}>Upgrade to Pro</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <>{children}</>;
}
