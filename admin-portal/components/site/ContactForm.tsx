'use client';
import { useRef, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

const inputCls = 'mt-1 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-green-600';

export function ContactForm({ slug }: { slug: string }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');
  const honeypotRef = useRef<HTMLInputElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending'); setError('');
    try {
      const res = await fetch(`${API}/api/website/${slug}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone: phone || undefined, message, website_url: honeypotRef.current?.value || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Something went wrong. Please try again.'); setStatus('error'); return; }
      setStatus('sent');
      setName(''); setEmail(''); setPhone(''); setMessage('');
    } catch {
      setError('Something went wrong. Please try again.');
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <div className="rounded-xl border border-green-100 bg-green-50 p-6 text-center">
        <p className="font-semibold text-green-800">Thanks — your message has been sent.</p>
        <p className="text-sm text-green-700 mt-1">We&apos;ll get back to you soon.</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4 max-w-xl">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500">Name</label>
          <input required className={inputCls} value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500">Email</label>
          <input required type="email" className={inputCls} value={email} onChange={e => setEmail(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500">Phone (optional)</label>
        <input className={inputCls} value={phone} onChange={e => setPhone(e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-500">Message</label>
        <textarea required rows={4} className={inputCls} value={message} onChange={e => setMessage(e.target.value)} />
      </div>
      {/* Honeypot — a simple form-scraping bot fills every field it finds,
          including this one; a real visitor never sees it. Hidden via CSS
          off-screen rather than `type="hidden"`, since some bots skip
          inputs with that type specifically. */}
      <input
        ref={honeypotRef} type="text" name="website_url" tabIndex={-1} autoComplete="off" defaultValue=""
        className="absolute left-[-9999px] w-px h-px opacity-0" aria-hidden="true"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={status === 'sending'}
        className="px-6 py-3 rounded-lg text-sm font-bold text-white bg-[#145C44] hover:bg-[#0f4a36] disabled:opacity-50 transition-colors">
        {status === 'sending' ? 'Sending…' : 'Send Message'}
      </button>
    </form>
  );
}
