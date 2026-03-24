import React, { Fragment, useEffect, useState } from 'react';
import { BookOpen, Calendar } from 'lucide-react';
import { clsx } from 'clsx';
import { Settings } from '../types';

type LibrarySlot = {
  id: number;
  class_id: number;
  class_name: string;
  subject_id: number | null;
  subject_name: string | null;
  subject_code: string | null;
  staff_id: number | null;
  staff_name: string | null;
  day_order: number;
  period: number;
  type: string | null;
};

export default function LibraryManagement() {
  const [slots, setSlots] = useState<LibrarySlot[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/timetable/library').then(res => res.json()),
      fetch('/api/settings').then(res => res.json()),
    ]).then(([slotData, settingsData]) => {
      setSlots(Array.isArray(slotData) ? slotData : []);
      setSettings(settingsData);
    });
  }, []);

  if (!settings) {
    return <div className="text-cyan-400 font-mono">Loading library timetable...</div>;
  }

  const periods = Array.from({ length: parseInt(settings.periods_per_day, 10) }, (_, i) => i + 1);
  const days = [1, 2, 3, 4, 5, 6];
  const breakAfter = parseInt(settings.break_after_period, 10);
  const lunchAfter = parseInt(settings.lunch_after_period, 10);

  return (
    <div className="space-y-12">
      <header className="flex justify-between items-end border-b border-[#1e2d47] pb-6">
        <div>
          <div className="text-[10px] font-mono text-emerald-500 uppercase tracking-[0.2em] mb-1">Library Schedule</div>
          <h1 className="text-4xl font-mono font-bold text-white tracking-tighter uppercase">Library Management</h1>
          <p className="text-slate-500 mt-2">View library timetable usage across all classes.</p>
        </div>
        <div className="bg-[#0f1623] border border-[#1e2d47] p-4 rounded-lg flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-400">
            <BookOpen size={24} />
          </div>
          <div>
            <div className="text-[10px] font-mono text-slate-500 uppercase">Occupied Slots</div>
            <div className="text-lg font-bold text-white">{slots.length}</div>
          </div>
        </div>
      </header>

      <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden">
        <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47] flex items-center gap-3">
          <Calendar className="text-emerald-400" size={20} />
          <h2 className="font-mono font-bold text-white uppercase tracking-wider">Library Timetable</h2>
        </div>
        <div className="p-6 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="p-3 text-left text-[10px] font-mono text-slate-500 uppercase border-b border-[#1e2d47]">Day Order</th>
                {periods.map(period => (
                  <Fragment key={`head-${period}`}>
                    <th className="p-3 text-center text-[10px] font-mono text-slate-500 uppercase border-b border-[#1e2d47]">
                      Period {period}
                    </th>
                    {period === breakAfter && (
                      <th className="p-3 text-center text-[10px] font-mono text-orange-500 uppercase border-b border-[#1e2d47] bg-orange-500/5">
                        Break
                      </th>
                    )}
                    {period === lunchAfter && (
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
                    const slot = slots.find(item => item.day_order === day && item.period === period);
                    return (
                      <Fragment key={`cell-${day}-${period}`}>
                        <td className="p-2">
                          <div
                            className={clsx(
                              'min-h-[88px] p-2 rounded border transition-all flex flex-col justify-center items-center text-center gap-1',
                              slot ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-[#0a0e17] border-dashed border-[#1e2d47]'
                            )}
                          >
                            {slot ? (
                              <>
                                <div className="font-bold text-white text-xs">{slot.class_name}</div>
                                <div className="text-[10px] text-emerald-400 font-mono">{slot.subject_code || slot.subject_name || 'LIB'}</div>
                                {slot.staff_name && <div className="text-[9px] text-slate-500">{slot.staff_name}</div>}
                              </>
                            ) : (
                              <span className="text-[10px] font-mono text-slate-700 uppercase tracking-widest">FREE</span>
                            )}
                          </div>
                        </td>
                        {period === breakAfter && (
                          <td className="p-2">
                            <div className="min-h-[88px] p-2 rounded border border-orange-500/20 bg-orange-500/5 flex items-center justify-center">
                              <span className="text-[10px] font-mono text-orange-500 uppercase tracking-[0.3em] rotate-90 md:rotate-0">Break</span>
                            </div>
                          </td>
                        )}
                        {period === lunchAfter && (
                          <td className="p-2">
                            <div className="min-h-[88px] p-2 rounded border border-cyan-500/20 bg-cyan-500/5 flex items-center justify-center">
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
          {slots.length === 0 && (
            <div className="mt-6 rounded-lg border border-[#1e2d47] bg-[#0a0e17] px-4 py-6 text-center text-sm text-slate-500">
              No library timetable slots found.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
