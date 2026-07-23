'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getTeacherColors } from '@/lib/teacher-auth';
import { teacherApi } from '@/lib/teacher-api';

type InvSubTab = 'items' | 'issue' | 'return';

interface InvItem {
  id: string;
  asset_tag: string | null;
  name: string;
  category_name: string | null;
  quantity_total: number;
  quantity_available: number;
  condition: string;
  location: string | null;
}

interface InvStudent {
  id: string;
  name: string;
  student_code: string;
  class_name: string | null;
}

function condColor(c: string) {
  if (c === 'Good')    return { color: '#15803D', bg: '#F0FDF4' };
  if (c === 'Damaged') return { color: '#92400E', bg: '#FEF9C3' };
  return { color: '#B91C1C', bg: '#FEF2F2' };
}

export default function HodInventoryPage() {
  const router  = useRouter();
  const [primary, setPrimary] = useState('#2ab289');

  const [invItems,   setInvItems]   = useState<InvItem[]>([]);
  const [invLoading, setInvLoading] = useState(true);
  const [subTab,     setSubTab]     = useState<InvSubTab>('items');

  // Issue form
  const [issueItemId,          setIssueItemId]          = useState('');
  const [issueToType,          setIssueToType]          = useState<'student' | 'staff' | 'department'>('staff');
  const [issueStudentCode,     setIssueStudentCode]     = useState('');
  const [issueStudent,         setIssueStudent]         = useState<InvStudent | null>(null);
  const [issueStudentLoading,  setIssueStudentLoading]  = useState(false);
  const [issueStudentError,    setIssueStudentError]    = useState('');
  const [issueName,            setIssueName]            = useState('');
  const [issueRole,            setIssueRole]            = useState('');
  const [issueQty,             setIssueQty]             = useState(1);
  const [issueNotes,           setIssueNotes]           = useState('');
  const [issuing,              setIssuing]              = useState(false);
  const [issueError,           setIssueError]           = useState('');
  const [issueSuccess,         setIssueSuccess]         = useState('');

  // Return form
  const [returnItemId,    setReturnItemId]    = useState('');
  const [returnQty,       setReturnQty]       = useState(1);
  const [returnCondition, setReturnCondition] = useState('Good');
  const [returnNotes,     setReturnNotes]     = useState('');
  const [returning,       setReturning]       = useState(false);
  const [returnError,     setReturnError]     = useState('');
  const [returnSuccess,   setReturnSuccess]   = useState('');

  useEffect(() => { setPrimary(getTeacherColors().primary); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadItems(); }, []);

  async function loadItems() {
    setInvLoading(true);
    try {
      const { data } = await teacherApi.get<InvItem[]>('/api/inventory/items');
      setInvItems(data);
    } catch { /* ignore */ }
    finally { setInvLoading(false); }
  }

  async function lookupStudent() {
    if (!issueStudentCode.trim()) return;
    setIssueStudentLoading(true); setIssueStudentError(''); setIssueStudent(null);
    try {
      const { data } = await teacherApi.get<InvStudent>(
        `/api/inventory/students/${issueStudentCode.trim().toUpperCase()}`
      );
      setIssueStudent(data);
      setIssueName(data.name);
    } catch { setIssueStudentError('Student not found'); }
    finally { setIssueStudentLoading(false); }
  }

  async function submitIssue() {
    if (!issueItemId) { setIssueError('Please select an item'); return; }
    const recipientName = issueToType === 'student' ? issueStudent?.name : issueName.trim();
    if (!recipientName) { setIssueError('Recipient name is required'); return; }
    setIssuing(true); setIssueError(''); setIssueSuccess('');
    try {
      await teacherApi.post(`/api/inventory/items/${issueItemId}/issue`, {
        issued_to_name: recipientName,
        issued_to_role: issueRole.trim() || undefined,
        issued_to_type: issueToType,
        student_id: issueToType === 'student' ? issueStudent?.id : undefined,
        quantity: issueQty,
        notes: issueNotes.trim() || undefined,
      });
      setIssueSuccess('Item issued successfully');
      setIssueItemId(''); setIssueName(''); setIssueRole('');
      setIssueQty(1); setIssueNotes(''); setIssueStudent(null); setIssueStudentCode('');
      loadItems();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setIssueError(msg ?? 'Failed to issue item');
    } finally { setIssuing(false); }
  }

  async function submitReturn() {
    if (!returnItemId) { setReturnError('Please select an item'); return; }
    setReturning(true); setReturnError(''); setReturnSuccess('');
    try {
      await teacherApi.post(`/api/inventory/items/${returnItemId}/return`, {
        quantity: returnQty,
        condition: returnCondition,
        notes: returnNotes.trim() || undefined,
      });
      setReturnSuccess('Item returned successfully');
      setReturnItemId(''); setReturnQty(1); setReturnCondition('Good'); setReturnNotes('');
      loadItems();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setReturnError(msg ?? 'Failed to return item');
    } finally { setReturning(false); }
  }

  const issuableItems  = invItems.filter(i => i.condition !== 'Written Off' && i.quantity_available > 0);
  const returnableItems = invItems.filter(i => i.quantity_available < i.quantity_total);

  function Spinner() {
    return (
      <div className="flex justify-center py-16">
        <div className="w-7 h-7 rounded-full border-2 animate-spin"
          style={{ borderColor: primary, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24" style={{ background: '#F4EFE6' }}>

      {/* Header */}
      <div className="px-4 pt-6 pb-3">
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-xl flex items-center justify-center bg-white border border-[#E2D9CC]"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-4 h-4 text-[#8C7E6E]">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-bold text-[#2C2218]">Dept Inventory</h1>
            <p className="text-xs text-[#8C7E6E]">Items assigned to your department</p>
          </div>
        </div>
      </div>

      <div className="px-4 space-y-4">

        {/* Sub-tab bar */}
        <div className="flex gap-1 bg-white rounded-2xl p-1 border border-[#E2D9CC]">
          {(['items', 'issue', 'return'] as InvSubTab[]).map(st => (
            <button key={st}
              onClick={() => {
                setSubTab(st);
                setIssueError(''); setIssueSuccess('');
                setReturnError(''); setReturnSuccess('');
              }}
              className="flex-1 py-2 rounded-xl text-xs font-semibold transition-colors"
              style={subTab === st ? { background: primary, color: '#fff' } : { color: '#8C7E6E' }}>
              {st === 'items' ? 'Items' : st === 'issue' ? 'Issue Item' : 'Return Item'}
            </button>
          ))}
        </div>

        {/* ── Items list ── */}
        {subTab === 'items' && (
          <>
            <div className="flex items-center justify-between">
              <p className="text-xs text-[#8C7E6E]">
                {invItems.length} item{invItems.length !== 1 ? 's' : ''} in your department
              </p>
              <button onClick={loadItems} className="text-xs font-semibold" style={{ color: primary }}>
                Refresh
              </button>
            </div>

            {invLoading ? <Spinner /> : invItems.length === 0 ? (
              <div className="bg-white rounded-2xl border border-[#E2D9CC] p-8 text-center">
                <p className="text-sm text-[#8C7E6E]">No inventory items assigned to your department.</p>
                <p className="text-xs text-[#C0B5A5] mt-1">Contact admin to assign departmental items.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {invItems.map(item => {
                  const cc = condColor(item.condition);
                  return (
                    <div key={item.id} className="bg-white rounded-2xl border border-[#E2D9CC] p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-[#2C2218]">{item.name}</p>
                          <div className="flex flex-wrap gap-2 mt-1 items-center">
                            {item.asset_tag && (
                              <span className="text-[10px] font-mono font-semibold text-[#8C7E6E] bg-[#F4EFE6] px-1.5 py-0.5 rounded">
                                {item.asset_tag}
                              </span>
                            )}
                            {item.category_name && (
                              <span className="text-[10px] text-[#8C7E6E]">{item.category_name}</span>
                            )}
                            {item.location && (
                              <span className="text-[10px] text-[#8C7E6E]">📍 {item.location}</span>
                            )}
                          </div>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                          style={{ color: cc.color, background: cc.bg }}>
                          {item.condition}
                        </span>
                      </div>
                      <div className="mt-2 pt-2 border-t border-[#F4EFE6] flex gap-6">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-[#8C7E6E]">Available</p>
                          <p className="text-base font-bold"
                            style={{ color: item.quantity_available > 0 ? '#15803D' : '#B91C1C' }}>
                            {item.quantity_available}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-[#8C7E6E]">Total</p>
                          <p className="text-base font-bold text-[#2C2218]">{item.quantity_total}</p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-wide text-[#8C7E6E]">Issued</p>
                          <p className="text-base font-bold text-[#92400E]">
                            {item.quantity_total - item.quantity_available}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── Issue form ── */}
        {subTab === 'issue' && (
          <div className="bg-white rounded-2xl border border-[#E2D9CC] p-4 space-y-4">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1">Item</label>
              <select value={issueItemId} onChange={e => setIssueItemId(e.target.value)}
                className="w-full rounded-xl border border-[#E2D9CC] px-3 py-2 text-sm bg-white text-[#2C2218] focus:outline-none">
                <option value="">Select item…</option>
                {issuableItems.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.name}{i.asset_tag ? ` (${i.asset_tag})` : ''} — {i.quantity_available} available
                  </option>
                ))}
              </select>
              {issuableItems.length === 0 && !invLoading && (
                <p className="text-xs text-[#8C7E6E] mt-1">No items currently available to issue.</p>
              )}
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1">Issue to</label>
              <div className="flex gap-1 bg-[#F4EFE6] rounded-xl p-1">
                {(['staff', 'student', 'department'] as const).map(t => (
                  <button key={t}
                    onClick={() => {
                      setIssueToType(t);
                      setIssueStudent(null); setIssueStudentCode('');
                      setIssueName(''); setIssueStudentError('');
                    }}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors"
                    style={issueToType === t
                      ? { background: '#fff', color: primary, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                      : { color: '#8C7E6E' }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {issueToType === 'student' ? (
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1">Student Code</label>
                <div className="flex gap-2">
                  <input value={issueStudentCode}
                    onChange={e => setIssueStudentCode(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && lookupStudent()}
                    placeholder="e.g. STU001"
                    className="flex-1 rounded-xl border border-[#E2D9CC] px-3 py-2 text-sm focus:outline-none" />
                  <button onClick={lookupStudent} disabled={issueStudentLoading}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                    style={{ background: primary, opacity: issueStudentLoading ? 0.6 : 1 }}>
                    {issueStudentLoading ? '…' : 'Find'}
                  </button>
                </div>
                {issueStudentError && <p className="text-xs text-red-600 mt-1">{issueStudentError}</p>}
                {issueStudent && (
                  <div className="mt-2 bg-[#F0FDF4] border border-green-200 rounded-xl px-3 py-2">
                    <p className="text-sm font-semibold text-[#15803D]">{issueStudent.name}</p>
                    <p className="text-xs text-[#8C7E6E]">
                      {issueStudent.student_code}{issueStudent.class_name ? ` · ${issueStudent.class_name}` : ''}
                    </p>
                  </div>
                )}
              </div>
            ) : issueToType === 'department' ? (
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1">Department / Section</label>
                <input value={issueName} onChange={e => setIssueName(e.target.value)}
                  placeholder="e.g. Science Lab"
                  className="w-full rounded-xl border border-[#E2D9CC] px-3 py-2 text-sm focus:outline-none" />
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1">Staff Name</label>
                  <input value={issueName} onChange={e => setIssueName(e.target.value)}
                    placeholder="Full name"
                    className="w-full rounded-xl border border-[#E2D9CC] px-3 py-2 text-sm focus:outline-none" />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1">Role / Title (optional)</label>
                  <input value={issueRole} onChange={e => setIssueRole(e.target.value)}
                    placeholder="e.g. Lab Technician"
                    className="w-full rounded-xl border border-[#E2D9CC] px-3 py-2 text-sm focus:outline-none" />
                </div>
              </div>
            )}

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1">Quantity</label>
              <input type="number" min={1} value={issueQty}
                onChange={e => setIssueQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full rounded-xl border border-[#E2D9CC] px-3 py-2 text-sm focus:outline-none" />
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1">Notes (optional)</label>
              <textarea value={issueNotes} onChange={e => setIssueNotes(e.target.value)}
                rows={2} placeholder="Purpose of issue, expected return date, etc."
                className="w-full rounded-xl border border-[#E2D9CC] px-3 py-2 text-sm focus:outline-none resize-none" />
            </div>

            {issueError   && <p className="text-sm text-red-600">{issueError}</p>}
            {issueSuccess && <p className="text-sm font-semibold text-green-700">{issueSuccess}</p>}

            <button onClick={submitIssue} disabled={issuing}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: primary, opacity: issuing ? 0.6 : 1 }}>
              {issuing ? 'Issuing…' : 'Issue Item'}
            </button>
          </div>
        )}

        {/* ── Return form ── */}
        {subTab === 'return' && (
          <div className="bg-white rounded-2xl border border-[#E2D9CC] p-4 space-y-4">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1">Item Being Returned</label>
              <select value={returnItemId} onChange={e => setReturnItemId(e.target.value)}
                className="w-full rounded-xl border border-[#E2D9CC] px-3 py-2 text-sm bg-white text-[#2C2218] focus:outline-none">
                <option value="">Select item…</option>
                {returnableItems.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.name}{i.asset_tag ? ` (${i.asset_tag})` : ''} — {i.quantity_total - i.quantity_available} issued
                  </option>
                ))}
              </select>
              {returnableItems.length === 0 && !invLoading && (
                <p className="text-xs text-[#8C7E6E] mt-1">No items are currently issued.</p>
              )}
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1">Quantity Returned</label>
              <input type="number" min={1} value={returnQty}
                onChange={e => setReturnQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full rounded-xl border border-[#E2D9CC] px-3 py-2 text-sm focus:outline-none" />
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1">Condition on Return</label>
              <div className="flex gap-1 bg-[#F4EFE6] rounded-xl p-1">
                {(['Good', 'Damaged'] as const).map(c => (
                  <button key={c} onClick={() => setReturnCondition(c)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                    style={returnCondition === c
                      ? { background: '#fff', color: c === 'Good' ? '#15803D' : '#92400E', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                      : { color: '#8C7E6E' }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold uppercase tracking-wide text-[#8C7E6E] block mb-1">Notes (optional)</label>
              <textarea value={returnNotes} onChange={e => setReturnNotes(e.target.value)}
                rows={2} placeholder="Any remarks on the item's condition…"
                className="w-full rounded-xl border border-[#E2D9CC] px-3 py-2 text-sm focus:outline-none resize-none" />
            </div>

            {returnError   && <p className="text-sm text-red-600">{returnError}</p>}
            {returnSuccess && <p className="text-sm font-semibold text-green-700">{returnSuccess}</p>}

            <button onClick={submitReturn} disabled={returning}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: primary, opacity: returning ? 0.6 : 1 }}>
              {returning ? 'Recording…' : 'Record Return'}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
