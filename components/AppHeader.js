// components/AppHeader.js
import React from 'react';
import { Text } from 'react-native';
import { fonts } from '../theme/theme';

export default function AppHeader({ title }) {
  return <Text style={fonts.header}>{title}</Text>;
}
