'use client';

import { useCallback, useEffect, useState } from 'react';
import { teacherApi } from '@/lib/teacher-api';

// Opens the school server's Offline Assessment page (tests and exams on the
// school Wi-Fi) without typing its address. CAS knows the address from the
// server's last sync and gives a 5-minute sign-in pass, carried in the #hash.

interface ServerLink { id: string; name: string; last_seen_at: string | null; urls: string[]; ticket: string }

const REFRESH_MS = 4 * 60 * 1000; // passes last 5 minutes

function seen(at: string | null) {
  if (!at) return 'has not synced yet';
  const mins = Math.round((Date.now() - new Date(at).getTime()) / 60000);
  if (mins < 2) return 'synced just now';
  if (mins < 60) return `synced ${mins} minutes ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `synced ${h} hour${h === 1 ? '' : 's'} ago`;
  return `last synced ${new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
}
const host = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/teacher$/, '');

export default function OfflineAssessmentPage() {
  const [servers, setServers] = useState<ServerLink[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    teacherApi.get<{ servers: ServerLink[] }>('/api/school-server/teacher-open')
      .then(r => { setServers(r.data.servers); setError(''); })
      .catch(() => setError('Could not reach CAS. Check your internet connection and try again.'));
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="min-h-screen px-4 pt-6 pb-24" style={{ background: '#F4EFE6' }}>
      <div className="max-w-2xl mx-auto space-y-4">
        <div>
          <h1 className="text-xl font-bold text-[#2C2218]">Offline Assessment</h1>
          <p className="text-sm text-[#8C7E6E] mt-1">
            Set tests and exams that students take on tablets over the school Wi-Fi, with no internet. Scores go into Assessments when you close a test.
          </p>
        </div>

        {error && <p role="alert" className="rounded-xl bg-[#FBEAEA] text-[#9B2C2C] px-4 py-3 text-sm">{error}</p>}
        {!servers && !error && <p className="text-sm text-[#8C7E6E]">Loading…</p>}

        {servers && servers.length === 0 && (
          <div className="rounded-2xl border border-[#E2D9CC] bg-[#FDFAF5] p-5">
            <p className="text-base font-semibold text-[#2C2218]">No school server yet</p>
            <p className="text-sm text-[#4A3F32] mt-1">
              Your school has not connected a CAS School Server. Ask the school admin to set one up (LMS, then School Server, in the admin portal).
            </p>
          </div>
        )}

        {servers?.map(s => {
          const [main, ...others] = s.urls;
          const link = (u: string) => `${u}#ticket=${s.ticket}`;
          return (
            <div key={s.id} className="rounded-2xl border border-[#E2D9CC] bg-[#FDFAF5] p-5 space-y-4">
              <div>
                <p className="text-base font-semibold text-[#2C2218]">{s.name}</p>
                <p className="text-sm text-[#8C7E6E]">Server {seen(s.last_seen_at)}</p>
              </div>

              {main ? (
                <>
                  <a href={link(main)} target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center w-full min-h-[48px] rounded-xl bg-[#145C44] text-white font-semibold text-base hover:bg-[#0B3D2E] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#145C44]">
                    Open Offline Assessment
                  </a>
                  <ul className="text-sm text-[#4A3F32] space-y-1.5 list-disc pl-5">
                    <li>Connect this laptop, tablet or phone to the <strong>school Wi-Fi</strong> first. It opens in a new tab and signs you in.</li>
                    <li>The browser may call the page &ldquo;Not secure&rdquo;. That is normal: it is a page on the school network, not the internet.</li>
                    <li>
                      If the school Wi-Fi has no internet, this CAS page will not load on it. Once Offline Assessment opens, bookmark it
                      (<span className="font-mono text-[#2C2218]">{host(main)}/teacher</span>) to go straight there next time and sign in with your teacher code and password.
                    </li>
                  </ul>
                  {others.length > 0 && (
                    <div className="text-sm text-[#4A3F32]">
                      <p>Not opening? Try the server&rsquo;s other address:</p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {others.map(u => (
                          <a key={u} href={link(u)} target="_blank" rel="noopener noreferrer"
                            className="inline-flex items-center min-h-[44px] px-4 rounded-xl border border-[#E2D9CC] bg-white text-[#145C44] font-semibold font-mono text-sm hover:bg-[#F4EFE6]">
                            {host(u)}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-[#4A3F32]">
                  This server has not told CAS its school network address yet. It does on its next sync, within 10 minutes of being switched on with internet. Until then, ask the admin for the address shown on the server.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
