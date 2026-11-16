// Question text with its pictures where the text says [image 1], [image 2]
// ([image] = [image 1]). Pictures no marker places go at the end.
import React from 'react';
import { Image, Text, View, type TextStyle } from 'react-native';

const MARKER = /\[image(?:\s+(\d+))?\]/gi;

type Part = { kind: 'text'; text: string } | { kind: 'image'; n: number };

function split(text: string, count: number, elsewhere?: string | null) {
  const parts: Part[] = [];
  const used = new Set<number>();
  let last = 0;
  for (const m of text.matchAll(MARKER)) {
    const n = m[1] ? parseInt(m[1], 10) : 1;
    const before = text.slice(last, m.index).replace(/^\n+|\n+$/g, '');
    if (before.trim()) parts.push({ kind: 'text', text: before });
    if (n >= 1 && n <= count) { parts.push({ kind: 'image', n }); used.add(n); }
    last = (m.index ?? 0) + m[0].length;
  }
  const rest = text.slice(last).replace(/^\n+/, '');
  if (rest.trim()) parts.push({ kind: 'text', text: rest });
  // Pictures placed in other text (the marking scheme) aren't "unplaced".
  for (const m of (elsewhere ?? '').matchAll(MARKER)) used.add(m[1] ? parseInt(m[1], 10) : 1);
  const unplaced = Array.from({ length: count }, (_, i) => i + 1).filter(n => !used.has(n));
  return { parts, unplaced };
}

export function QuestionBody({ text, images, textStyle, showUnplaced = true, imageHeight = 220, placedElsewhere }: {
  text: string; images: (string | null)[]; textStyle?: TextStyle | TextStyle[];
  showUnplaced?: boolean; imageHeight?: number;
  /** Other text whose [image N] markers also count as placed, e.g. the marking scheme. */
  placedElsewhere?: string | null;
}) {
  const { parts, unplaced } = split(text, images.length, placedElsewhere);
  const pic = (n: number, key: string) => {
    const uri = images[n - 1];
    if (!uri) return null;
    return (
      <Image key={key} source={{ uri }} resizeMode="contain" accessibilityLabel={`Figure ${n}`}
        style={{ width: '100%', height: imageHeight, backgroundColor: '#FFFFFF', borderRadius: 12 }} />
    );
  };
  return (
    <View style={{ gap: 10 }}>
      {parts.map((p, i) => p.kind === 'text'
        ? <Text key={i} style={textStyle}>{p.text}</Text>
        : pic(p.n, `m${i}`))}
      {showUnplaced && unplaced.map(n => pic(n, `u${n}`))}
    </View>
  );
}
