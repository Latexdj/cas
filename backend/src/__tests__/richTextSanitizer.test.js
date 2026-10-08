'use strict';
/**
 * richTextSanitizer.js — the single sanitizer used wherever admin-authored
 * rich text (from the shared TipTap RichTextEditor) is written: website
 * pages and, since the rich text editor was added to the letters module,
 * general-letters and discipline letter bodies too. website-pages.test.js
 * already exercises this allowlist at the route level; these are direct
 * unit tests of the shared function itself, plus isHtmlEmpty.
 */

const { sanitizeRichText, isHtmlEmpty } = require('../utils/richTextSanitizer');

describe('sanitizeRichText', () => {
  it('passes through everything the shared editor can actually produce', () => {
    const html = '<h1>Heading</h1><p style="text-align:center;font-size:12pt;">Some <strong>bold</strong> and <em>italic</em> <u>text</u></p><ul style="list-style-type:square;"><li>one</li></ul>';
    const out = sanitizeRichText(html);
    expect(out).toContain('<h1>Heading</h1>');
    expect(out).toContain('text-align:center');
    expect(out).toContain('font-size:12pt');
    expect(out).toContain('<strong>bold</strong>');
    expect(out).toContain('<em>italic</em>');
    expect(out).toContain('<u>text</u>');
    expect(out).toContain('list-style-type:square');
    expect(out).toContain('<li>one</li>');
  });

  it('strips a script tag entirely, not just its content', () => {
    const out = sanitizeRichText('<p>Hello</p><script>alert(1)</script>');
    expect(out).not.toMatch(/script/i);
    expect(out).toContain('Hello');
  });

  it('strips an inline event handler attribute', () => {
    const out = sanitizeRichText('<p onclick="alert(1)">Hi</p>');
    expect(out).not.toMatch(/onclick/i);
  });

  it('rejects a javascript: URL on a link', () => {
    const out = sanitizeRichText('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toMatch(/javascript:/i);
  });

  it('drops a disallowed CSS property but keeps an allowed one on the same element', () => {
    const out = sanitizeRichText('<p style="text-align:center;position:fixed;">x</p>');
    expect(out).toContain('text-align:center');
    expect(out).not.toContain('position');
  });

  it('passes null/empty through unchanged rather than throwing', () => {
    expect(sanitizeRichText('')).toBe('');
    expect(sanitizeRichText(null)).toBe(null);
  });
});

describe('isHtmlEmpty', () => {
  it('treats a bare empty paragraph (TipTap\'s empty-editor output) as empty', () => {
    expect(isHtmlEmpty('<p></p>')).toBe(true);
  });

  it('treats whitespace-only content as empty', () => {
    expect(isHtmlEmpty('<p>   </p>')).toBe(true);
  });

  it('treats an empty string or null as empty', () => {
    expect(isHtmlEmpty('')).toBe(true);
    expect(isHtmlEmpty(null)).toBe(true);
  });

  it('is false once there is real text content', () => {
    expect(isHtmlEmpty('<p>Dear Sir,</p>')).toBe(false);
  });

  it('is false for a heading-only body', () => {
    expect(isHtmlEmpty('<h1>Notice</h1>')).toBe(false);
  });
});
