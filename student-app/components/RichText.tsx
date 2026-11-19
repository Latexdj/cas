// Shows rich question text (lib/richText.ts) with native views: paragraphs,
// bold/italic/underline, x² and H₂O, lists, tables that scroll sideways when
// wide, and pictures where the text has [image N] markers.
import React from 'react';
import { Image, ScrollView, Text, View, type TextStyle } from 'react-native';
import { useTheme } from '@/context/ThemeContext';
import { parseRich, scriptChars, textOf, type RichNode } from '@/lib/richText';

type El = RichNode & { kind: 'el' };
const INLINE = new Set(['strong', 'em', 'u', 's', 'sub', 'sup']);
const isInline = (n: RichNode) => n.kind === 'text' || (n.kind === 'el' && INLINE.has(n.tag));

export function RichText({ html, images = [], textStyle, imageHeight = 220 }: {
  html: string; images?: (string | null)[]; textStyle?: TextStyle | TextStyle[]; imageHeight?: number;
}) {
  const C = useTheme();
  const nodes = React.useMemo(() => parseRich(html), [html]);
  const base: TextStyle = Object.assign({ color: C.text, fontSize: 16, lineHeight: 24 }, ...(Array.isArray(textStyle) ? textStyle : [textStyle ?? {}]));
  const fontSize = base.fontSize ?? 16;

  const picture = (n: number, key: string) => {
    const uri = images[n - 1];
    if (!uri) return null;
    return <Image key={key} source={{ uri }} resizeMode="contain" accessibilityLabel={`Figure ${n}`}
      style={{ width: '100%', height: imageHeight, backgroundColor: '#FFFFFF', borderRadius: 12 }} />;
  };

  // Inline runs inside one <Text>.
  const inline = (list: RichNode[], key: string, marks: TextStyle = {}): React.ReactNode[] => list.map((n, i) => {
    const k = `${key}.${i}`;
    if (n.kind === 'text') return <Text key={k} style={marks}>{n.text}</Text>;
    if (n.kind === 'image') return null;   // pictures are split out as blocks
    const t = n.tag;
    if (t === 'sub' || t === 'sup') {
      const s = scriptChars(textOf(n.children), t);
      if (s) return <Text key={k} style={marks}>{s}</Text>;
      return <Text key={k} style={[marks, { fontSize: Math.round(fontSize * 0.72) }]}>{inline(n.children, k, marks)}</Text>;
    }
    const style: TextStyle = { ...marks };
    if (t === 'strong') style.fontWeight = '700';
    if (t === 'em') style.fontStyle = 'italic';
    if (t === 'u' || t === 's') {
      const lines = new Set(String(marks.textDecorationLine ?? '').split(' ').filter(x => x && x !== 'none'));
      lines.add(t === 'u' ? 'underline' : 'line-through');
      style.textDecorationLine = [...lines].join(' ') as TextStyle['textDecorationLine'];
    }
    return <Text key={k} style={style}>{inline(n.children, k, style)}</Text>;
  });

  // A run of inline nodes, broken where pictures sit.
  const paragraph = (list: RichNode[], key: string, style?: TextStyle): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    let run: RichNode[] = [];
    const flush = (k: string) => {
      if (run.some(n => n.kind !== 'text' || n.text.trim())) out.push(<Text key={k} style={[base, style]}>{inline(run, k)}</Text>);
      run = [];
    };
    list.forEach((n, i) => {
      if (n.kind === 'image') { flush(`${key}.t${i}`); out.push(picture(n.n, `${key}.i${i}`)); }
      else run.push(n);
    });
    flush(`${key}.end`);
    return out;
  };

  const blocks = (list: RichNode[], key: string, style?: TextStyle): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    let run: RichNode[] = [];
    const flushRun = (k: string) => { if (run.length) out.push(...paragraph(run, k, style)); run = []; };
    list.forEach((n, i) => {
      const k = `${key}.${i}`;
      if (isInline(n) || n.kind === 'image') { run.push(n); return; }
      flushRun(`${k}r`);
      const el = n as El;
      if (el.tag === 'p' || el.tag === 'li') out.push(...paragraph(el.children, k, style));
      else if (el.tag === 'ul' || el.tag === 'ol') out.push(list_(el, k, style));
      else if (el.tag === 'table') out.push(table(el, k));
      else out.push(...blocks(el.children, k, style));
    });
    flushRun(`${key}.end`);
    return out;
  };

  const list_ = (el: El, key: string, style?: TextStyle) => {
    const items = el.children.filter((c): c is El => c.kind === 'el' && c.tag === 'li');
    return (
      <View key={key} style={{ gap: 4 }}>
        {items.map((li, i) => (
          <View key={`${key}.${i}`} style={{ flexDirection: 'row', gap: 8 }}>
            <Text style={[base, style, { minWidth: 18 }]}>{el.tag === 'ol' ? `${i + 1}.` : '•'}</Text>
            <View style={{ flex: 1, gap: 4 }}>{blocks(li.children, `${key}.${i}`, style)}</View>
          </View>
        ))}
      </View>
    );
  };

  const table = (el: El, key: string) => {
    const rows: El[] = [];
    const collect = (n: RichNode) => { if (n.kind !== 'el') return; if (n.tag === 'tr') rows.push(n); else n.children.forEach(collect); };
    el.children.forEach(collect);
    const cells = rows.map(r => r.children.filter((c): c is El => c.kind === 'el' && (c.tag === 'td' || c.tag === 'th')));
    // Column widths from the longest text in each column.
    const cols = Math.max(0, ...cells.map(r => r.reduce((n, c) => n + c.colspan, 0)));
    const widths = Array.from({ length: cols }, () => 64);
    for (const r of cells) {
      let col = 0;
      for (const c of r) {
        if (c.colspan === 1) {
          const longest = Math.max(...textOf(c.children).split('\n').map(l => l.length));
          widths[col] = Math.max(widths[col], Math.min(240, Math.round(longest * fontSize * 0.56) + 18));
        }
        col += c.colspan;
      }
    }
    return (
      <ScrollView key={key} horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingVertical: 2 }}>
        <View style={{ borderWidth: 1, borderColor: C.borderStrong, borderRadius: 6, overflow: 'hidden' }} accessibilityRole="none">
          {cells.map((r, ri) => {
            let col = 0;
            return (
              <View key={`${key}.r${ri}`} style={{ flexDirection: 'row', borderTopWidth: ri ? 1 : 0, borderColor: C.borderStrong }}>
                {r.map((c, ci) => {
                  const w = widths.slice(col, col + c.colspan).reduce((a, b) => a + b, 0);
                  col += c.colspan;
                  const head = c.tag === 'th';
                  return (
                    <View key={`${key}.r${ri}c${ci}`} style={{ width: w, padding: 6, gap: 4, borderLeftWidth: ci ? 1 : 0, borderColor: C.borderStrong, backgroundColor: head ? C.primaryLight : 'transparent' }}>
                      {blocks(c.children, `${key}.r${ri}c${ci}`, head ? { fontWeight: '700' } : undefined)}
                    </View>
                  );
                })}
              </View>
            );
          })}
        </View>
      </ScrollView>
    );
  };

  return <View style={{ gap: 8 }}>{blocks(nodes, 'rt')}</View>;
}
