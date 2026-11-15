"""Generate admin-portal/app/dark-theme.css.

The portals still write many colours as literal hex values (inline styles and
Tailwind arbitrary classes such as text-[#145C44]). This script scans every
.tsx file, sorts each colour by the job it does (background, text, border) and
emits dark-mode rules that map it onto the CAS warm dark palette defined in
globals.css. Re-run it after adding new literal colours:

    python scripts/gen-dark-theme.py

Prefer the semantic tokens (bg-canvas, bg-surface, text-ink, text-brand, ...)
for new code; this file only exists to bring the older literal colours along.
"""
import colorsys
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'app' / 'dark-theme.css'
SRC = [p for d in ('app', 'components') for p in (ROOT / d).rglob('*.tsx')]

# ── Dark palette (keep in step with the .dark block in globals.css) ──────────
CANVAS, SUNKEN, SURFACE, ELEVATED = 'var(--canvas)', 'var(--sunken)', 'var(--surface)', 'var(--elevated)'
INK, INK2, MUTED = 'var(--ink)', 'var(--ink-2)', 'var(--ink-muted)'
LINE, LINE_STRONG = 'var(--line)', 'var(--line-strong)'
BRAND, GOLD, OK, BAD, WARN = 'var(--brand-ink)', 'var(--gold-ink)', 'var(--ok-ink)', 'var(--bad-ink)', 'var(--warn-ink)'
SURFACE_HEX = '#16241A'


def rgb(h):
    h = h.lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lum(h):
    def ch(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(v) for v in rgb(h))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    x, y = lum(a), lum(b)
    return (max(x, y) + 0.05) / (min(x, y) + 0.05)


def hls(h):
    r, g, b = (v / 255 for v in rgb(h))
    hh, l, s = colorsys.rgb_to_hls(r, g, b)
    return hh * 360, l, s


def chroma(h):
    c = rgb(h)
    return max(c) - min(c)


def tint(h):
    """A dark background with the same hue, for light tinted badges/panels."""
    hh, _, s = hls(h)
    r, g, b = colorsys.hls_to_rgb(hh / 360, 0.15, min(s, 0.45))
    return '#%02X%02X%02X' % (round(r * 255), round(g * 255), round(b * 255))


def is_cold_dark(h):
    hh, l, s = hls(h)
    return lum(h) < 0.08 and 195 <= hh <= 235 and chroma(h) < 60


def bg_map(h):
    """Dark-mode background for a literal background colour, or None to keep."""
    L = lum(h)
    if L >= 0.5:
        hh, _, _ = hls(h)
        if chroma(h) <= 10 or (20 <= hh <= 50 and chroma(h) < 24) or (195 <= hh <= 235 and chroma(h) < 20):  # white, parchment, slate greys
            return SURFACE if L > 0.93 else SUNKEN
        return tint(h)                          # pale green/red/amber/blue tints
    if is_cold_dark(h):                         # slate-900/800/700 dark branches
        return CANVAS if L < 0.012 else SURFACE if L < 0.03 else ELEVATED
    hh, _, _ = hls(h)
    if L < 0.06 and 10 <= hh <= 60 and chroma(h) <= 20:  # warm browns/stone used as dark cards (not amber tints)
        return SURFACE if L < 0.03 else ELEVATED
    return None                                 # brand greens, gold, buttons


def text_map(h):
    """Dark-mode text colour for a literal text colour, or None to keep."""
    L = lum(h)
    if h.upper() in ('#FFFFFF', '#FFF'):
        return None                             # white on buttons stays
    if chroma(h) < 45:                          # neutrals: warm and cold greys
        if L < 0.035:
            return INK
        if L < 0.12:
            return INK2
        if L < 0.45:
            return MUTED
        return INK2 if L < 0.7 else INK
    hh, _, _ = hls(h)
    if hh >= 330 or hh < 15:
        return BAD
    if hh < 65:                                 # amber, orange, gold
        return None if contrast(h, SURFACE_HEX) >= 4.5 else WARN
    if hh < 175:
        return BRAND if h.upper() != '#2D7A4F' else OK
    if hh < 250:
        return BRAND                            # blue and teal links
    return GOLD                                 # purple and indigo labels


def border_map(h):
    L = lum(h)
    if L >= 0.5:
        return LINE
    if is_cold_dark(h):
        return LINE if L < 0.03 else LINE_STRONG
    return None


# ── Scan ────────────────────────────────────────────────────────────────────
HEX = r'#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b'
inline = {'bg': set(), 'text': set(), 'border': set()}
classes = {'bg': set(), 'text': set(), 'border': set(), 'divide': set()}
style_pairs, class_pairs = set(), set()

KEY = re.compile(r'\b(background(?:Color)?|color|border(?:Top|Bottom|Left|Right)?(?:Color)?)\s*:\s*([^,}\n]+)')
CLS = re.compile(r'(?<![\w-])((?:hover:)?)(bg|text|border|divide)-\[(' + HEX + r')\]')

for p in SRC:
    s = p.read_text(encoding='utf-8', errors='ignore')
    for m in KEY.finditer(s):
        key, val = m.group(1), m.group(2)
        role = 'bg' if key.startswith('background') else 'text' if key == 'color' else 'border'
        for h in re.findall(HEX, val):
            inline[role].add(h)
    for m in CLS.finditer(s):
        if s[max(0, m.start() - 5):m.start()].endswith('dark:'):
            continue
        classes[m.group(2)].add((m.group(1), m.group(3)))
    # bg + text written together, for the "keep text on solid buttons" rule
    for obj in re.findall(r'style=\{\{([^{}]*)\}\}', s):
        bgs = [h for k, v in KEY.findall(obj) if k.startswith('background') for h in re.findall(HEX, v)]
        txs = [h for k, v in KEY.findall(obj) if k == 'color' for h in re.findall(HEX, v)]
        style_pairs.update((b, t) for b in bgs for t in txs)
    for cl in re.findall(r'className=["\'`{]([^"\'`]*)', s):
        bgs = re.findall(r'(?<![\w:-])bg-\[(' + HEX + r')\]', cl)
        txs = re.findall(r'(?<![\w:-])text-\[(' + HEX + r')\]', cl)
        class_pairs.update((b, t) for b in bgs for t in txs)
# Colours kept in palette objects under other names (rowAlt, card, thead ...)
# still reach a style attribute. The rules below are property-specific, so a
# background rule only ever matches an element whose background is that
# colour; covering every quoted colour for every property is therefore safe.
QUOTED = re.compile(r"['\"`](" + HEX + r")['\"`]")
for p in SRC:
    for h in QUOTED.findall(p.read_text(encoding='utf-8', errors='ignore')):
        for role in inline:
            inline[role].add(h)
for role in inline:                       # rgb() form is case-blind: one per colour
    seen, keep = set(), set()
    for h in sorted(inline[role]):
        if h.upper() not in seen:
            seen.add(h.upper()); keep.add(h)
    inline[role] = keep
# dark-branch classes such as dark:bg-[#1E293B]
dark_cls = set()
for p in SRC:
    for m in re.finditer(r'dark:(bg|border)-\[(' + HEX + r')\]', p.read_text(encoding='utf-8', errors='ignore')):
        dark_cls.add((m.group(1), m.group(2)))


def rgbs(h):
    r, g, b = rgb(h)
    return f'rgb({r}, {g}, {b})'


def prop_sel(prop, h):
    """Exact style-attribute matches for one property, client and server forms."""
    c, raw = rgbs(h), h
    return [f'[style^="{prop}: {c}"]', f'[style*="; {prop}: {c}"]',
            f'[style^="{prop}:{raw}" i]', f'[style*=";{prop}:{raw}" i]']


def esc(cls):
    return re.sub(r'([\[\]#:])', r'\\\1', cls)


out = [__doc__.replace('"""', '').strip().replace('\n', '\n   ').join(['/* ', ' */']), '']
rule = lambda sels, decl: out.append(',\n'.join(f'.dark {x}' for x in sels) + f' {{ {decl} !important; }}')

out.append('/* ── Inline backgrounds ── */')
for h in sorted(inline['bg'], key=str.upper):
    v = bg_map(h)
    if v:
        rule(prop_sel('background-color', h) + prop_sel('background', h), f'background: {v}')
out.append('\n/* ── Inline text ── */')
for h in sorted(inline['text'], key=str.upper):
    v = text_map(h)
    if v:
        rule(prop_sel('color', h), f'color: {v}')
out.append('\n/* ── Inline borders ── */')
for h in sorted(inline['border'] | inline['bg'], key=str.upper):
    v = border_map(h)
    if v:
        c = rgbs(h)
        rule([f'[style*="border: 1px solid {c}"]', f'[style*="border-color: {c}"]', f'[style*="border-bottom: 1px solid {c}"]',
              f'[style*="border-top: 1px solid {c}"]', f'[style*="border-left: 1px solid {c}"]', f'[style*="border-right: 1px solid {c}"]',
              f'[style*="{h}" i][style*="border" i]'], f'border-color: {v}')

out.append('\n/* ── Arbitrary-value classes ── */')
for kind in ('bg', 'text', 'border', 'divide'):
    for var, h in sorted(classes[kind], key=lambda x: (x[1].upper(), x[0])):
        v = {'bg': bg_map, 'text': text_map, 'border': border_map, 'divide': border_map}[kind](h)
        if not v:
            continue
        name = f'{var}{kind}-[{h}]'
        sel = '.' + esc(name) + (':hover' if var else '')
        if kind == 'divide':
            sel += ' > :not(:last-child)'
        prop = {'bg': 'background-color', 'text': 'color', 'border': 'border-color', 'divide': 'border-color'}[kind]
        rule([sel], f'{prop}: {v}')
for kind, h in sorted(dark_cls):
    v = (bg_map if kind == 'bg' else border_map)(h)
    if v and is_cold_dark(h):
        rule(['.' + esc(f'dark:{kind}-[{h}]')], f'{"background-color" if kind == "bg" else "border-color"}: {v}')

out.append('\n/* ── Text on solid brand/gold/red backgrounds keeps its light-mode colour ── */')
for b, t in sorted(style_pairs | class_pairs):
    if bg_map(b) is None and text_map(t) is not None and lum(b) < 0.5:
        rule([f'[style*="background: {rgbs(b)}"]' + p for p in prop_sel('color', t)] +
             [f'[style*="background-color: {rgbs(b)}"]' + p for p in prop_sel('color', t)] +
             ['.' + esc(f'bg-[{b}]') + '.' + esc(f'text-[{t}]')], f'color: {t}')

OUT.write_text('\n'.join(out) + '\n', encoding='utf-8')
print(f'wrote {OUT.relative_to(ROOT)}: {len(out)} lines; inline bg {len(inline["bg"])}, text {len(inline["text"])}, '
      f'border {len(inline["border"])}; classes ' + ', '.join(f'{k} {len(v)}' for k, v in classes.items()))
