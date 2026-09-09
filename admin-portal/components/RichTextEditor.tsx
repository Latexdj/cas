'use client';
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import { Extension } from '@tiptap/core';
import { useEffect, useCallback } from 'react';

// ── Font-size extension (built on TextStyle) ──────────────────────────────────
const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: el => el.style.fontSize?.replace('pt', '') || null,
          renderHTML: attrs => attrs.fontSize
            ? { style: `font-size: ${attrs.fontSize}pt` }
            : {},
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize: (size: string) => ({ chain }: { chain: () => { run: () => boolean; setMark: (mark: string, attrs: Record<string, unknown>) => { run: () => boolean } } }) =>
        chain().setMark('textStyle', { fontSize: size }).run(),
      unsetFontSize: () => ({ chain }: { chain: () => { run: () => boolean; setMark: (mark: string, attrs: Record<string, unknown>) => { run: () => boolean } } }) =>
        chain().setMark('textStyle', { fontSize: null }).run(),
    } as Record<string, unknown>;
  },
});

// ── Toolbar helpers ───────────────────────────────────────────────────────────
const FONTS = [
  { label: 'Georgia',          value: 'Georgia, serif' },
  { label: 'Times New Roman',  value: "'Times New Roman', serif" },
  { label: 'Arial',            value: 'Arial, sans-serif' },
  { label: 'Helvetica',        value: 'Helvetica, sans-serif' },
];

const FONT_SIZES = ['8','9','10','11','12','14','16','18','24'];

function ToolBtn({
  active, disabled, onClick, title, children,
}: {
  active?: boolean; disabled?: boolean; onClick: () => void; title: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={e => { e.preventDefault(); onClick(); }}
      className={`flex items-center justify-center h-7 w-7 rounded text-sm transition-colors
        ${active
          ? 'bg-[#145C44] text-white'
          : 'text-slate-600 hover:bg-slate-100'
        } disabled:opacity-30`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-slate-200 mx-1 self-center" />;
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null;

  const currentFont = FONTS.find(f => editor.isActive('textStyle', { fontFamily: f.value }))?.value ?? '';
  const currentSize = (() => {
    for (const s of FONT_SIZES) {
      if (editor.isActive('textStyle', { fontSize: s })) return s;
    }
    return '';
  })();

  return (
    <div className="flex flex-wrap items-center gap-0.5 px-3 py-2 border-b border-slate-200 bg-slate-50">
      {/* History */}
      <ToolBtn title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6-6M3 10l6 6" />
        </svg>
      </ToolBtn>
      <ToolBtn title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 10H11a8 8 0 00-8 8v2M21 10l-6-6M21 10l-6 6" />
        </svg>
      </ToolBtn>

      <Divider />

      {/* Inline formatting */}
      <ToolBtn title="Bold" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
        <span className="font-black text-xs">B</span>
      </ToolBtn>
      <ToolBtn title="Italic" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <span className="italic font-serif text-sm">I</span>
      </ToolBtn>
      <ToolBtn title="Underline" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
        <span className="underline text-xs font-medium">U</span>
      </ToolBtn>

      <Divider />

      {/* Font family */}
      <select
        title="Font family"
        value={currentFont}
        onChange={e => {
          if (e.target.value) editor.chain().focus().setFontFamily(e.target.value).run();
          else editor.chain().focus().unsetFontFamily().run();
        }}
        className="h-7 rounded border border-slate-200 bg-white text-xs text-slate-700 px-1.5 focus:outline-none focus:ring-1 focus:ring-green-600"
      >
        <option value="">Font</option>
        {FONTS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>

      {/* Font size */}
      <select
        title="Font size"
        value={currentSize}
        onChange={e => {
          if (e.target.value) (editor.chain().focus() as unknown as Record<string, (s: string) => { run: () => void }>).setFontSize(e.target.value).run();
          else (editor.chain().focus() as unknown as Record<string, () => { run: () => void }>).unsetFontSize().run();
        }}
        className="h-7 w-14 rounded border border-slate-200 bg-white text-xs text-slate-700 px-1.5 focus:outline-none focus:ring-1 focus:ring-green-600"
      >
        <option value="">Size</option>
        {FONT_SIZES.map(s => <option key={s} value={s}>{s}pt</option>)}
      </select>

      <Divider />

      {/* Alignment */}
      <ToolBtn title="Align left" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/>
        </svg>
      </ToolBtn>
      <ToolBtn title="Align center" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
        </svg>
      </ToolBtn>
      <ToolBtn title="Align right" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/>
        </svg>
      </ToolBtn>
      <ToolBtn title="Justify" active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}>
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </ToolBtn>

      <Divider />

      {/* Lists */}
      <ToolBtn title="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <circle cx="5" cy="6" r="1.5" fill="currentColor" stroke="none"/>
          <circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/>
          <circle cx="5" cy="18" r="1.5" fill="currentColor" stroke="none"/>
          <line x1="9" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="9" y1="18" x2="21" y2="18"/>
        </svg>
      </ToolBtn>
      <ToolBtn title="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <text x="3" y="8" fontSize="7" fill="currentColor" stroke="none">1.</text>
          <text x="3" y="14" fontSize="7" fill="currentColor" stroke="none">2.</text>
          <text x="3" y="20" fontSize="7" fill="currentColor" stroke="none">3.</text>
          <line x1="11" y1="6" x2="21" y2="6"/><line x1="11" y1="12" x2="21" y2="12"/><line x1="11" y1="18" x2="21" y2="18"/>
        </svg>
      </ToolBtn>
    </div>
  );
}

// ── Public component ──────────────────────────────────────────────────────────
interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

export function RichTextEditor({ value, onChange, placeholder, minHeight = 400 }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Underline,
      TextStyle,
      FontFamily,
      FontSize,
    ],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none px-4 py-3',
        style: `min-height:${minHeight}px;font-family:Georgia,serif;font-size:11pt;line-height:1.7;`,
        'data-placeholder': placeholder ?? '',
      },
    },
  });

  // Sync when external value changes (e.g. on initial load from DB)
  const syncContent = useCallback(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value || '', false);
    }
  }, [editor, value]);

  useEffect(() => { syncContent(); }, [syncContent]);

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
      <Toolbar editor={editor} />
      <style>{`
        .ProseMirror p { margin: 0 0 10px; }
        .ProseMirror ul, .ProseMirror ol { margin: 0 0 10px; padding-left: 22px; }
        .ProseMirror li { margin-bottom: 3px; }
        .ProseMirror[data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: #94a3b8;
          pointer-events: none;
          float: left;
          height: 0;
        }
      `}</style>
      <EditorContent editor={editor} />
    </div>
  );
}
