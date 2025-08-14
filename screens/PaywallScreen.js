// File: screens/PaywallScreen.js
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, Linking } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

const TERMS_URL = 'https://ljhart724.github.io/terms/';
const PRIVACY_URL = 'https://www.privacypolicies.com/live/51e2ab74-e75a-4f00-a70d-1fd5d06771d5';

export default function PaywallScreen() {
  const { accentColor, theme } = useTheme();

  const onSubscribe = () => {
    // Placeholder for now; you’ll connect RevenueCat next.
    Alert.alert(
      'Subscribe',
      'This button will start the $5.99/month subscription via RevenueCat.',
    );
  };

  const onRestore = () => {
    Alert.alert('Restore Purchases', 'This will restore your subscription via RevenueCat.');
  };

  const openLink = (url) => Linking.openURL(url).catch(() => {});

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.bg }]}>
      <View style={styles.card}>
        <Text style={[styles.title, { color: theme.text }]}>HartHealth Pro</Text>
        <Text style={[styles.price, { color: theme.text }]}>$5.99 / month</Text>
        <Text style={[styles.subtitle, { color: theme.text }]}>What you get</Text>

        <View style={styles.bullets}>
          {[
            'Unlimited AI feedback for workouts & meals',
            'Goal-aware coaching (strength, endurance, nutrition)',
            'Faster suggestions & weekly progression tips',
            'Sync across devices (iOS, Android)',
          ].map((b, i) => (
            <View key={i} style={styles.bulletRow}>
              <Text style={[styles.bulletDot, { color: accentColor }]}>•</Text>
              <Text style={[styles.bulletText, { color: theme.text }]}>{b}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity onPress={onSubscribe} style={[styles.cta, { backgroundColor: accentColor }]}>
          <Text style={styles.ctaText}>Subscribe — $5.99/month</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={onRestore} style={styles.restoreBtn}>
          <Text style={[styles.restoreText, { color: theme.text }]}>Restore Purchases</Text>
        </TouchableOpacity>

        <View style={styles.linksRow}>
          <TouchableOpacity onPress={() => openLink(TERMS_URL)}>
            <Text style={[styles.link, { color: accentColor }]}>Terms of Use</Text>
          </TouchableOpacity>
          <Text style={[styles.dot, { color: theme.text }]}>·</Text>
          <TouchableOpacity onPress={() => openLink(PRIVACY_URL)}>
            <Text style={[styles.link, { color: accentColor }]}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.disclaimer, { color: theme.text }]}>
          Payment will be charged to your Apple ID at confirmation of purchase. Subscription renews
          automatically unless cancelled at least 24 hours before the end of the current period.
          Manage or cancel in Settings → Subscriptions after purchase.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  card: {
    borderRadius: 16,
    padding: 20,
    backgroundColor: '#181818',
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  title: { fontSize: 28, fontWeight: '800', marginBottom: 4 },
  price: { fontSize: 18, opacity: 0.9, marginBottom: 16 },
  subtitle: { fontSize: 16, fontWeight: '700', marginTop: 4, marginBottom: 8 },
  bullets: { marginVertical: 8 },
  bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  bulletDot: { fontSize: 18, marginRight: 8, lineHeight: 22 },
  bulletText: { fontSize: 14, lineHeight: 20, flex: 1 },
  cta: { marginTop: 18, padding: 14, borderRadius: 10, alignItems: 'center' },
  ctaText: { color: '#000', fontWeight: '800', fontSize: 16 },
  restoreBtn: { alignItems: 'center', marginTop: 10, padding: 10 },
  restoreText: { fontSize: 14, textDecorationLine: 'underline' },
  linksRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 12, gap: 10 },
  link: { fontSize: 13, textDecorationLine: 'underline' },
  dot: { opacity: 0.6 },
  disclaimer: { fontSize: 12, opacity: 0.8, marginTop: 12, lineHeight: 18 },
});
