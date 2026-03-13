import React, { useState, useEffect, Fragment } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Monitor, Calendar, ArrowLeft } from 'lucide-react';
import { clsx } from 'clsx';
import { Settings } from '../../types';

export default function LabTimetable() {
  const { labId } = useParams();
  const [lab, setLab] = useState<any | null>(null);
  const [timetable, setTimetable] = useState<any[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [spec, setSpec] = useState('');
  const [osInstalled, setOsInstalled] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const loadData = () => {
    Promise.all([
      fetch(`/api/labs/${labId}`).then(r => r.json()),
      fetch(`/api/timetable/lab/${labId}`).then(r => r.json()),
      fetch('/api/settings').then(r => r.json()),
    ]).then(([labData, slots, s]) => {
      setLab(labData ?? null);
      setSpec(labData?.systems_specification || '');
      setOsInstalled(labData?.os_installed || '');
      setTimetable(Array.isArray(slots) ? slots : []);
      setSettings(s);
    });
  };

  useEffect(() => {
    loadData();
  }, [labId]);

  const handleSave = async () => {
    if (!labId) return;
    setSaving(true);
    setStatus(null);
    const res = await fetch(`/api/labs/${labId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systems_specification: spec || null,
        os_installed: osInstalled || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      setStatus({ type: 'error', msg: data.error || 'Failed to save lab details.' });
      return;
    }
    setStatus({ type: 'success', msg: 'Lab details saved successfully.' });
    loadData();
  };

  if (!settings) return <div className="text-cyan-400 font-mono">Loading lab timetable...</div>;

  const periods = Array.from({ length: parseInt(settings.periods_per_day) }, (_, i) => i + 1);
  const days = [1, 2, 3, 4, 5, 6];

  return (
    <div className="space-y-12">
      <header className="flex justify-between items-end border-b border-[#1e2d47] pb-6">
        <div>
          <Link to="/labs" className="inline-flex items-center gap-1.5 text-[10px] font-mono text-slate-500 hover:text-cyan-400 uppercase tracking-[0.2em] mb-2 transition-colors">
            <ArrowLeft size={12} /> Lab Management
          </Link>
          <div className="text-[10px] font-mono text-emerald-500 uppercase tracking-[0.2em] mb-1">Lab Schedule</div>
          <h1 className="text-4xl font-mono font-bold text-white tracking-tighter uppercase">
            {lab?.name ?? `Lab #${labId}`}
          </h1>
          <p className="text-slate-500 mt-2">
            {lab?.systems_count != null ? `${lab.systems_count} systems` : ''} · Usage timetable
          </p>
        </div>
        <div className="bg-[#0f1623] border border-[#1e2d47] p-4 rounded-lg flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-400">
            <Monitor size={24} />
          </div>
          <div>
            <div className="text-[10px] font-mono text-slate-500 uppercase">Occupied Slots</div>
            <div className="text-lg font-bold text-white">{timetable.length}</div>
          </div>
        </div>
      </header>

      <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden">
        <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47]">
          <h2 className="font-mono font-bold text-white uppercase tracking-wider">Lab System Details</h2>
        </div>
        <div className="p-6 space-y-4">
          {status && (
            <div className={status.type === 'success'
              ? 'rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300'
              : 'rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300'}
            >
              {status.msg}
            </div>
          )}
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">System Specification</label>
            <textarea
              rows={3}
              placeholder="e.g. Intel i5, 16GB RAM, 512GB SSD, RTX 3050"
              className="w-full bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none resize-none"
              value={spec}
              onChange={e => setSpec(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">OS Installed</label>
            <input
              placeholder="e.g. Windows 11 + Ubuntu 22.04 dual boot"
              className="w-full bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
              value={osInstalled}
              onChange={e => setOsInstalled(e.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-mono font-bold uppercase tracking-wider"
            >
              {saving ? 'Saving…' : 'Save Details'}
            </button>
          </div>
        </div>
      </section>

      <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden">
        <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47] flex items-center gap-3">
          <Calendar className="text-emerald-400" size={20} />
          <h2 className="font-mono font-bold text-white uppercase tracking-wider">Lab Timetable</h2>
        </div>
        <div className="p-6 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="p-3 text-left text-[10px] font-mono text-slate-500 uppercase border-b border-[#1e2d47]">Day Order</th>
                {periods.map(p => (
                  <Fragment key={`ph-${p}`}>
                    <th className="p-3 text-center text-[10px] font-mono text-slate-500 uppercase border-b border-[#1e2d47]">
                      Period {p}
                    </th>
                    {p === parseInt(settings.break_after_period) && (
                      <th className="p-3 text-center text-[10px] font-mono text-orange-500 uppercase border-b border-[#1e2d47] bg-orange-500/5">
                        Break
                      </th>
                    )}
                    {p === parseInt(settings.lunch_after_period) && (
                      <th className="p-3 text-center text-[10px] font-mono text-cyan-500 uppercase border-b border-[#1e2d47] bg-cyan-500/5">
                        Lunch
                      </th>
                    )}
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map(day => (
                <tr key={day} className="border-b border-[#1e2d47]/50 hover:bg-[#141c2e]/30 transition-colors">
                  <td className="p-4 font-mono font-bold text-emerald-500">DAY {day}</td>
                  {periods.map(period => {
                    const slot = timetable.find(s => s.day_order === day && s.period === period);
                    return (
                      <Fragment key={`cell-${day}-${period}`}>
                        <td className="p-2">
                          <div className={clsx(
                            'min-h-[80px] p-2 rounded border transition-all flex flex-col justify-center items-center text-center gap-1',
                            slot
                              ? 'bg-emerald-500/5 border-emerald-500/20'
                              : 'bg-[#0a0e17] border-dashed border-[#1e2d47]'
                          )}>
                            {slot ? (
                              <>
                                <div className="font-bold text-white text-xs">{slot.class_name}</div>
                                <div className="text-[10px] text-emerald-400 font-mono">{slot.subject_code}</div>
                                {slot.staff_name && (
                                  <div className="text-[9px] text-slate-500">{slot.staff_name}</div>
                                )}
                              </>
                            ) : (
                              <span className="text-[10px] font-mono text-slate-700 uppercase tracking-widest">FREE</span>
                            )}
                          </div>
                        </td>
                        {period === parseInt(settings.break_after_period) && (
                          <td className="p-2">
                            <div className="min-h-[80px] p-2 rounded border border-orange-500/20 bg-orange-500/5 flex items-center justify-center">
                              <span className="text-[10px] font-mono text-orange-500 uppercase tracking-[0.3em] rotate-90 md:rotate-0">Break</span>
                            </div>
                          </td>
                        )}
                        {period === parseInt(settings.lunch_after_period) && (
                          <td className="p-2">
                            <div className="min-h-[80px] p-2 rounded border border-cyan-500/20 bg-cyan-500/5 flex items-center justify-center">
                              <span className="text-[10px] font-mono text-cyan-500 uppercase tracking-[0.3em] rotate-90 md:rotate-0">Lunch</span>
                            </div>
                          </td>
                        )}
                      </Fragment>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
