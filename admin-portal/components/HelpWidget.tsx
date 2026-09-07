'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import type { AxiosInstance } from 'axios';

type Msg = { role: 'user' | 'assistant'; content: string };

const C = {
  forest: '#0B3D2E', mid: '#145C44',
  bg: '#F5F0E8', border: '#E2D9CC',
  dark: '#2C2218', muted: '#8C7E6E',
  danger: '#B83232',
};

export function HelpWidget({ apiClient }: { apiClient?: AxiosInstance } = {}) {
  const client = apiClient ?? api;
  const [open,      setOpen]      = useState(false);
  const [messages,  setMessages]  = useState<Msg[]>([]);
  const [input,     setInput]     = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [sessionId, setSessionId] = useState('');
  const [starting,  setStarting]  = useState(false);

  const endRef   = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 100)}px`;
  }, [input]);

  const startSession = useCallback(async () => {
    if (sessionId || starting) return;
    setStarting(true); setError('');
    try {
      const { data } = await client.post('/api/help-chat/start');
      setSessionId(data.session_id);
      setMessages([{ role: 'assistant', content: data.welcome_message }]);
    } catch {
      setError('Could not start help session. Please try again.');
    } finally { setStarting(false); }
  }, [sessionId, starting, client]);

  async function openPanel() {
    setOpen(true);
    if (!sessionId) await startSession();
  }

  async function send() {
    if (!input.trim() || loading || !sessionId) return;
    const userContent = input.trim();
    setMessages(prev => [...prev, { role: 'user', content: userContent }]);
    setInput(''); setLoading(true); setError('');
    try {
      const { data } = await client.post(`/api/help-chat/${sessionId}/message`, { content: userContent });
      setMessages(prev => [...prev, { role: 'assistant', content: data.content }]);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string; expired?: boolean } } };
      if (err.response?.data?.expired) {
        // Session expired — start a fresh one silently, then retry.
        setSessionId('');
        setMessages([]);
        try {
          const s = await client.post('/api/help-chat/start');
          setSessionId(s.data.session_id);
          setMessages([{ role: 'assistant', content: s.data.welcome_message }]);
          const r = await client.post(`/api/help-chat/${s.data.session_id}/message`, { content: userContent });
          setMessages(prev => [...prev, { role: 'assistant', content: r.data.content }]);
        } catch { setError('Session expired. Please close and reopen Help.'); }
      } else {
        setError(err.response?.data?.error ?? 'Failed to send message.');
      }
    } finally { setLoading(false); }
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={openPanel}
        aria-label="Open Help"
        style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 9000,
          width: 44, height: 44, borderRadius: '50%',
          background: C.mid, color: '#fff',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          fontSize: 20, fontWeight: 700, lineHeight: 1,
          transition: 'transform 0.15s, box-shadow 0.15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.08)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)'; }}
      >?</button>

      {/* Slide-in panel */}
      {open && (
        <>
          {/* Dim overlay (does not block page interaction) */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 8999,
              background: 'rgba(0,0,0,0.18)',
            }}
          />

          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, zIndex: 9001,
            width: 340, display: 'flex', flexDirection: 'column',
            background: C.bg, borderLeft: `1px solid ${C.border}`,
            boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
          }}>
            {/* Header */}
            <div style={{
              background: C.forest, color: '#fff',
              padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>Help</p>
                <p style={{ margin: 0, fontSize: 11, opacity: 0.75 }}>Ask how to use CAS</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.75)', cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1 }}
              >✕</button>
            </div>

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {starting && (
                <p style={{ fontSize: 12, color: C.muted, textAlign: 'center', padding: '24px 0' }}>Starting help session…</p>
              )}

              {messages.map((m, i) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                }}>
                  <div style={{
                    maxWidth: '88%', padding: '8px 11px', borderRadius: 10,
                    fontSize: 12, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                    background: m.role === 'user' ? C.mid : '#fff',
                    color: m.role === 'user' ? '#fff' : C.dark,
                    border: m.role === 'assistant' ? `1px solid ${C.border}` : 'none',
                  }}>{m.content}</div>
                </div>
              ))}

              {loading && (
                <div style={{
                  alignSelf: 'flex-start', background: '#fff',
                  border: `1px solid ${C.border}`, borderRadius: 10,
                  padding: '8px 12px', fontSize: 12, color: C.muted,
                }}>Looking that up…</div>
              )}

              {error && (
                <p style={{ fontSize: 11, color: C.danger, textAlign: 'center', margin: 0 }}>{error}</p>
              )}

              <div ref={endRef} />
            </div>

            {/* Input */}
            <div style={{
              padding: '8px 10px', borderTop: `1px solid ${C.border}`,
              background: '#fff', display: 'flex', gap: 6, alignItems: 'flex-end',
              flexShrink: 0,
            }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Ask a question… (Enter to send)"
                rows={1}
                style={{
                  flex: 1, border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: '7px 10px', fontSize: 12, outline: 'none',
                  color: C.dark, background: C.bg, resize: 'none',
                  fontFamily: 'inherit', lineHeight: 1.5, maxHeight: 100, overflowY: 'auto',
                }}
              />
              <button
                onClick={send}
                disabled={loading || !input.trim() || !sessionId}
                style={{
                  padding: '7px 12px', borderRadius: 8, border: 'none',
                  background: C.mid, color: '#fff', fontWeight: 700,
                  fontSize: 12, cursor: 'pointer', flexShrink: 0,
                  opacity: (loading || !input.trim() || !sessionId) ? 0.5 : 1,
                }}
              >Send</button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
