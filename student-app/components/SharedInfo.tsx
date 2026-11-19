// "Use this information": the text, table or pictures a group of questions
// shares, shown above each of them. Can be folded away on small screens.
import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { QuestionBody } from './QuestionBody';

export function SharedInfo({ text, html, images, fontSize = 15 }: {
  text: string; html?: string | null; images: (string | null)[]; fontSize?: number;
}) {
  const C = useTheme();
  const [open, setOpen] = useState(true);
  return (
    <View style={{ borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, borderRadius: 12, overflow: 'hidden' }}>
      <TouchableOpacity onPress={() => setOpen(o => !o)} accessibilityRole="button" accessibilityState={{ expanded: open }}
        accessibilityLabel={open ? 'Hide the information for this question' : 'Show the information for this question'}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 44, backgroundColor: C.primaryLight }}>
        <Ionicons name="document-text-outline" size={18} color={C.primaryText} />
        <Text style={{ flex: 1, color: C.primaryText, fontSize: 14, fontWeight: '700' }}>Use this information</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.primaryText} />
      </TouchableOpacity>
      {open && (
        <View style={{ padding: 12 }}>
          <QuestionBody text={text} html={html} images={images} textStyle={{ color: C.text, fontSize, lineHeight: Math.round(fontSize * 1.5) }} imageHeight={180} />
        </View>
      )}
    </View>
  );
}
