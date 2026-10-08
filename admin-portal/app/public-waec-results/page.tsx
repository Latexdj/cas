'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { publicApi } from '@/lib/api';

export default function PublicWaecResultsCheckoutPage() {
  const router = useRouter();
  const [rawText, setRawText] = useState('');
  const [amount, setAmount] = useState('2000');
  const [paymentReference, setPaymentReference] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (!rawText.trim()) {
      setError('Paste the WAEC results listing first.');
      return;
    }

    try {
      setLoading(true);
      const { data } = await publicApi.post('/api/public/waec-results/checkout', {
        raw_text: rawText,
        amount: Number(amount || 0),
        payment_reference: paymentReference || 'public-waec-demo',
      });

      if (data?.id) {
        router.push(`/public-waec-results/${data.id}`);
        return;
      }

      setError(data?.error || 'The checkout could not be completed.');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Could not generate the WAEC report right now.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-800">
      <div className="mx-auto max-w-6xl grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-8">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#145C44]">WAEC Analytics</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900">Generate your public WASSCE analysis report</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-500">
              Paste the WAEC results listing, pay the analysis fee, and receive a computed grade and pass-rate summary instantly.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="waec-results" className="mb-2 block text-sm font-semibold text-slate-700">
                WAEC results listing
              </label>
              <textarea
                id="waec-results"
                value={rawText}
                onChange={(event) => setRawText(event.target.value)}
                placeholder="Paste the full WAEC results text here..."
                className="min-h-[420px] w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 shadow-inner outline-none transition focus:border-[#145C44] focus:bg-white"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="amount" className="mb-2 block text-sm font-semibold text-slate-700">Analysis fee (GHS)</label>
                <input
                  id="amount"
                  type="number"
                  min="0"
                  step="50"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-[#145C44] focus:bg-white"
                />
              </div>

              <div>
                <label htmlFor="reference" className="mb-2 block text-sm font-semibold text-slate-700">Payment reference</label>
                <input
                  id="reference"
                  value={paymentReference}
                  onChange={(event) => setPaymentReference(event.target.value)}
                  placeholder="Optional reference"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none transition focus:border-[#145C44] focus:bg-white"
                />
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={loading} className="min-w-[220px]" size="lg">
                {loading ? 'Processing...' : 'Pay & Generate Report'}
              </Button>
              <p className="text-xs text-slate-500">Instant access after payment confirmation.</p>
            </div>
          </form>
        </section>

        <aside className="space-y-5">
          <div className="rounded-3xl border border-[#145C44]/10 bg-[#145C44] p-6 text-white shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-100">Included</p>
            <h2 className="mt-4 text-xl font-bold">What you get</h2>
            <ul className="mt-4 space-y-3 text-sm text-emerald-50">
              <li>• Subject-by-subject pass percentages</li>
              <li>• Total candidate summary and no-result counts</li>
              <li>• Grade distribution across A1–F9</li>
              <li>• Official WAEC summary comparison</li>
            </ul>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900">How it works</h3>
            <ol className="mt-4 space-y-4 text-sm text-slate-600">
              <li>
                <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">1</span>
                Paste or upload the WAEC listing text.
              </li>
              <li>
                <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">2</span>
                Complete the secure checkout and submit.
              </li>
              <li>
                <span className="mr-2 inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">3</span>
                Receive the analysis report and key metrics.
              </li>
            </ol>
          </div>
        </aside>
      </div>
    </main>
  );
}
