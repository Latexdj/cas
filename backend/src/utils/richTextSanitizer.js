'use strict';
const sanitizeHtml = require('sanitize-html');

// Allowlist mirrors exactly what the shared TipTap-based RichTextEditor.tsx
// component can produce — the single sanitizer for every place admin-
// authored rich text is stored and later rendered back, whether to
// anonymous public visitors (website pages), the authoring admin, or into
// a server-generated PDF (general/discipline letter bodies).
function sanitizeRichText(html) {
  if (!html) return html;
  return sanitizeHtml(html, {
    allowedTags: ['p', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'br', 'span', 'img'],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      img: ['src', 'alt'],
      '*': ['style'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedStyles: {
      '*': {
        'font-family':      [/^[\w\s,'"-]+$/],
        'font-size':        [/^\d+(\.\d+)?pt$/],
        'line-height':      [/^[\d.]+$/],
        'list-style-type':  [/^(disc|circle|square|decimal|lower-alpha|upper-alpha|lower-roman|upper-roman)$/],
        'text-align':       [/^(left|center|right|justify)$/],
      },
    },
  });
}

// TipTap's getHTML() on an empty editor returns "<p></p>", not "" — a
// plain .trim() check on that string is truthy, so "is the body empty"
// validation needs to look at the text after stripping tags, not the raw
// HTML string.
function isHtmlEmpty(html) {
  return !html || String(html).replace(/<[^>]*>/g, '').trim().length === 0;
}

module.exports = { sanitizeRichText, isHtmlEmpty };
