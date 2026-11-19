'use client';

// The rich editor for question text, options, explanations, marking schemes
// and shared information. It writes the small HTML subset every app can show
// (see backend/src/utils/rich-text.js): bold, italic, underline,
// strikethrough, sub- and superscript, lists and tables, plus symbols as
// plain characters. Pictures stay [image N] markers, put in with insertMarker.

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import Placeholder from '@tiptap/extension-placeholder';
import { SYMBOL_GROUPS } from '@/lib/questionSymbols';
import { isRich } from '@/lib/richText';

const C = {
  bar: '#0E1A0C', border: '#2A3D28', ink: '#FFFFFF', ink2: 'rgba(255,255,255,0.8)', muted: 'rgba(255,255,255,0.55)',
  on: 'rgba(200,151,58,0.25)', onBorder: '#C8973A', field: '#0B1A0E', pop: '#132B1C',
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** Plain text (older questions) as editor paragraphs; rich text as it is. */
export function toEditorHtml(v: string | null | undefined) {
  const s = v ?? '';
  if (!s.trim()) return '';
  if (isRich(s)) return s;
  return s.split('\n').map(l => `<p>${esc(l)}</p>`).join('');
}

export interface QuestionEditorHandle { insertMarker: (n: number) => void; insertText: (t: string) => void; focus: () => void }

export const QuestionEditor = forwardRef<QuestionEditorHandle, {
  value: string; onChange: (html: string) => void;
  id?: string; ariaLabel: string; placeholder?: string;
  /** Short fields (options): no lists or tables, a smaller box. */
  compact?: boolean; minHeight?: number;
  /** Shows "Draw a diagram" in the toolbar. */
  onDiagram?: () => void;
}>(function QuestionEditor({ value, onChange, id, ariaLabel, placeholder, compact = false, minHeight, onDiagram }, ref) {
  const lastOut = useRef<string>(value);
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: false, blockquote: false, code: false, codeBlock: false, horizontalRule: false,
        ...(compact ? { bulletList: false, orderedList: false, listItem: false } : {}) }),
      Underline, Subscript, Superscript,
      ...(compact ? [] : [Table.configure({ resizable: false }), TableRow, TableHeader, TableCell]),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: toEditorHtml(value),
    editorProps: { attributes: { 'aria-label': ariaLabel, ...(id ? { id } : {}), class: 'cas-qe-content', role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate: ({ editor: ed }) => {
      const html = ed.isEmpty ? '' : ed.getHTML();
      lastOut.current = html;
      onChange(html);
    },
  });

  // Outside changes (a marker renumbered after a picture was removed).
  useEffect(() => {
    if (!editor || value === lastOut.current) return;
    lastOut.current = value;
    editor.commands.setContent(toEditorHtml(value), false);
  }, [value, editor]);

  useImperativeHandle(ref, () => ({
    insertMarker: (n: number) => { editor?.chain().focus().insertContent(`<p>[image ${n}]</p>`).run(); },
    insertText: (t: string) => { editor?.chain().focus().insertContent(esc(t)).run(); },
    focus: () => { editor?.commands.focus(); },
  }), [editor]);

  return (
    <div className="cas-qe" style={{ border: `1px solid ${C.border}`, borderRadius: 10, background: C.field }}>
      {editor && <Toolbar editor={editor} compact={compact} onDiagram={onDiagram} />}
      <EditorContent editor={editor} style={{ minHeight: minHeight ?? (compact ? 44 : 110) }} />
      <style>{EDITOR_CSS}</style>
    </div>
  );
});

function Toolbar({ editor, compact, onDiagram }: { editor: Editor; compact: boolean; onDiagram?: () => void }) {
  const [, force] = useState(0);
  const [symbols, setSymbols] = useState(false);
  const [tableMenu, setTableMenu] = useState(false);
  useEffect(() => {
    const re = () => force(x => x + 1);
    editor.on('selectionUpdate', re); editor.on('transaction', re);
    return () => { editor.off('selectionUpdate', re); editor.off('transaction', re); };
  }, [editor]);

  const b = (label: string, title: string, active: boolean, run: () => void, style?: React.CSSProperties) => (
    <button type="button" title={title} aria-label={title} aria-pressed={active} onMouseDown={e => e.preventDefault()} onClick={run}
      style={{ minWidth: 32, height: 32, padding: '0 7px', borderRadius: 7, fontSize: 14, cursor: 'pointer', color: C.ink,
        background: active ? C.on : 'transparent', border: `1px solid ${active ? C.onBorder : 'transparent'}`, ...style }}>{label}</button>
  );
  const chain = () => editor.chain().focus();
  const inTable = editor.isActive('table');

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, padding: 4, borderBottom: `1px solid ${C.border}`, background: C.bar, borderRadius: '10px 10px 0 0', position: 'relative' }}>
      {b('B', 'Bold', editor.isActive('bold'), () => chain().toggleBold().run(), { fontWeight: 800 })}
      {b('I', 'Italic', editor.isActive('italic'), () => chain().toggleItalic().run(), { fontStyle: 'italic' })}
      {b('U', 'Underline', editor.isActive('underline'), () => chain().toggleUnderline().run(), { textDecoration: 'underline' })}
      {b('S', 'Strikethrough', editor.isActive('strike'), () => chain().toggleStrike().run(), { textDecoration: 'line-through' })}
      {b('x₂', 'Subscript (H₂O)', editor.isActive('subscript'), () => chain().toggleSubscript().run())}
      {b('x²', 'Superscript (x²)', editor.isActive('superscript'), () => chain().toggleSuperscript().run())}
      {!compact && <>
        <span style={{ width: 1, background: C.border, margin: '4px 4px' }} />
        {b('• List', 'Bulleted list', editor.isActive('bulletList'), () => chain().toggleBulletList().run())}
        {b('1. List', 'Numbered list', editor.isActive('orderedList'), () => chain().toggleOrderedList().run())}
        {b('Table', 'Table', inTable || tableMenu, () => { setTableMenu(m => !m); setSymbols(false); })}
      </>}
      {b('Ω Symbols', 'Symbols and shapes', symbols, () => { setSymbols(s => !s); setTableMenu(false); })}
      {onDiagram && b('Draw a diagram', 'Draw a diagram and add it as a picture', false, onDiagram)}
      <span style={{ flex: 1 }} />
      {b('↶', 'Undo', false, () => chain().undo().run())}
      {b('↷', 'Redo', false, () => chain().redo().run())}
      {b('Clear', 'Clear formatting', false, () => chain().unsetAllMarks().run(), { fontSize: 12, color: C.ink2 })}

      {tableMenu && !compact && (
        <div style={pop}>
          {!inTable ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 12, color: C.muted }}>Insert a table</span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[[2, 2], [3, 2], [3, 3], [4, 3], [5, 2], [6, 3]].map(([r, c]) => (
                  <button key={`${r}x${c}`} type="button" style={popBtn} onMouseDown={e => e.preventDefault()}
                    onClick={() => { chain().insertTable({ rows: r, cols: c, withHeaderRow: true }).run(); setTableMenu(false); }}>
                    {r} rows × {c} columns
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[
                ['Add row below', () => chain().addRowAfter().run()],
                ['Add row above', () => chain().addRowBefore().run()],
                ['Add column right', () => chain().addColumnAfter().run()],
                ['Add column left', () => chain().addColumnBefore().run()],
                ['Remove row', () => chain().deleteRow().run()],
                ['Remove column', () => chain().deleteColumn().run()],
                ['Header row on/off', () => chain().toggleHeaderRow().run()],
                ['Merge cells', () => chain().mergeCells().run()],
                ['Split cell', () => chain().splitCell().run()],
                ['Delete table', () => { chain().deleteTable().run(); setTableMenu(false); }],
              ].map(([l, run]) => (
                <button key={l as string} type="button" style={popBtn} onMouseDown={e => e.preventDefault()} onClick={run as () => void}>{l as string}</button>
              ))}
            </div>
          )}
        </div>
      )}

      {symbols && (
        <div style={{ ...pop, maxHeight: 300, overflowY: 'auto' }}>
          {SYMBOL_GROUPS.map(g => (
            <div key={g.name} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{g.name}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {g.symbols.map(sym => (
                  <button key={sym} type="button" title={`Insert ${sym}`} aria-label={`Insert ${sym}`} onMouseDown={e => e.preventDefault()}
                    onClick={() => chain().insertContent(esc(sym)).run()}
                    style={{ minWidth: 34, height: 34, padding: '0 6px', borderRadius: 7, fontSize: 16, cursor: 'pointer', color: C.ink, background: C.bar, border: `1px solid ${C.border}` }}>
                    {sym}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const pop: React.CSSProperties = {
  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4, padding: 10,
  background: C.pop, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
};
const popBtn: React.CSSProperties = {
  minHeight: 34, padding: '0 10px', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: C.ink, background: C.bar, border: `1px solid ${C.border}`,
};

const EDITOR_CSS = `
.cas-qe-content { outline: none; padding: 10px 12px; color: #FFFFFF; font-size: 15px; line-height: 1.55; }
.cas-qe-content p { margin: 0 0 6px; }
.cas-qe-content ul, .cas-qe-content ol { margin: 0 0 6px; padding-left: 22px; }
.cas-qe-content table { border-collapse: collapse; margin: 6px 0 8px; table-layout: fixed; }
.cas-qe-content th, .cas-qe-content td { border: 1px solid rgba(255,255,255,0.35); padding: 6px 8px; min-width: 60px; vertical-align: top; }
.cas-qe-content th { background: rgba(255,255,255,0.08); font-weight: 700; text-align: left; }
.cas-qe-content .selectedCell { background: rgba(200,151,58,0.25); }
.cas-qe-content p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: rgba(255,255,255,0.4); float: left; height: 0; pointer-events: none; }
.cas-qe-content:focus-visible { box-shadow: inset 0 0 0 2px #C8973A; border-radius: 0 0 10px 10px; }
`;
