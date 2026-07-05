'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface Stats {
  total_students: number; active_students: number; total_classes: number;
  current_term: { id: string; name: string } | null;
  attendance_today: number;
  classes: { class_name: string; student_count: number }[];
}

function StatCard({ label, value, sub, color, href }: { label: string; value: number; sub?: string; color: string; href?: string }) {
  const content = (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 hover:shadow-md transition-shadow cursor-pointer">
      <p className="text-3xl font-black" style={{ color }}>{value.toLocaleString()}</p>
      <p className="text-sm font-semibold text-slate-700 mt-1">{label}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function QuickLink({ href, label, d }: { href: string; label: string; d: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 bg-white hover:border-green-200 hover:bg-green-50 transition-all group shadow-sm">
      <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
        <svg viewBox="0 0 24 24" fill="none" stroke="#15803D" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d={d} />
        </svg>
      </div>
      <span className="text-sm font-medium text-slate-700 group-hover:text-green-700">{label}</span>
    </Link>
  );
}

export default function PrimaryAdminDashboard() {
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Stats>('/api/primary/dashboard-stats')
      .then(r => setStats(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 rounded-full border-4 border-t-transparent animate-spin" style={{ borderColor: '#15803D', borderTopColor: 'transparent' }} />
    </div>
  );

  const total = stats?.active_students ?? 0;
  const present = stats?.attendance_today ?? 0;
  const attendancePct = total > 0 ? Math.round(present / total * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
          {stats?.current_term ? (
            <p className="text-sm text-slate-500 mt-0.5">
              Current term: <span className="font-semibold text-slate-700">{stats.current_term.name}</span>
            </p>
          ) : (
            <p className="text-sm text-amber-600 mt-0.5">
              No current term set — <Link href="/primary/admin/terms" className="underline">set one now</Link>
            </p>
          )}
        </div>
        <div className="text-right text-xs text-slate-400">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Students"  value={stats?.active_students ?? 0}  color="#15803D" href="/primary/admin/students" />
        <StatCard label="Total Students"   value={stats?.total_students  ?? 0}  color="#0F172A" href="/primary/admin/students" />
        <StatCard label="Classes"          value={stats?.total_classes   ?? 0}  color="#1D4ED8" href="/primary/admin/classes" />
        <StatCard label="Present Today"    value={stats?.attendance_today ?? 0} color="#D97706" sub="students marked present" href="/primary/admin/student-attendance" />
      </div>

      {/* Attendance snapshot */}
      {total > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-bold text-slate-700 mb-4">Today&apos;s Attendance</h2>
          <div className="flex items-center gap-4 mb-3">
            <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${attendancePct}%`, backgroundColor: '#15803D' }} />
            </div>
            <span className="text-sm font-bold" style={{ color: '#15803D' }}>{attendancePct}%</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded-xl py-3 bg-green-50">
              <p className="text-2xl font-black text-green-700">{present}</p>
              <p className="text-xs font-medium text-slate-500 mt-0.5">Present</p>
            </div>
            <div className="rounded-xl py-3 bg-red-50">
              <p className="text-2xl font-black text-red-600">{total - present > 0 ? total - present : 0}</p>
              <p className="text-xs font-medium text-slate-500 mt-0.5">Not yet marked / Absent</p>
            </div>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Class breakdown */}
        {stats?.classes && stats.classes.length > 0 && (
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-700">Students by Class</h2>
              <Link href="/primary/admin/students" className="text-xs font-semibold hover:underline" style={{ color: '#15803D' }}>View all</Link>
            </div>
            <div className="divide-y divide-gray-50">
              {stats.classes.map(c => {
                const pct = total ? Math.round(c.student_count / total * 100) : 0;
                return (
                  <div key={c.class_name} className="flex items-center gap-4 px-5 py-2.5">
                    <span className="text-sm font-medium text-slate-800 w-28 flex-shrink-0">{c.class_name}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: '#15803D' }} />
                    </div>
                    <span className="text-sm font-bold w-10 text-right" style={{ color: '#15803D' }}>{c.student_count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick links */}
        <div className="space-y-2.5">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Quick Actions</p>
          <QuickLink href="/primary/admin/student-attendance" label="Mark Student Attendance"
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          <QuickLink href="/primary/admin/teacher-attendance" label="Mark Teacher Attendance"
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          <QuickLink href="/primary/admin/scores" label="Enter Scores"
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          <QuickLink href="/primary/admin/reports" label="Report Card Approvals"
            d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          <QuickLink href="/primary/admin/students" label="Add New Student"
            d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          <QuickLink href="/primary/admin/teachers" label="Manage Teachers"
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </div>
      </div>
    </div>
  );
}
