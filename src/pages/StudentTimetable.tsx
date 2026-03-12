import React, { useState, useEffect, Fragment } from 'react';
import { useParams } from 'react-router-dom';
import { Class, TimetableSlot, Settings } from '../types';
import { Calendar, Clock, GraduationCap } from 'lucide-react';
import { clsx } from 'clsx';

export default function StudentTimetable() {
  const { id } = useParams();
  const [cls, setCls] = useState<Class | null>(null);
  const [timetable, setTimetable] = useState<TimetableSlot[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    fetch('/api/classes').then(res => res.json()).then(data => {
      setCls(data.find((x: any) => x.id === parseInt(id!)));
    });
    fetch(`/api/timetable/${id}`).then(res => res.json()).then(setTimetable);
    fetch('/api/settings').then(res => res.json()).then(setSettings);
  }, [id]);

  if (!cls || !settings) return <div className="text-cyan-400 font-mono">Loading class timetable...</div>;

  const periods = Array.from({ length: parseInt(settings.periods_per_day) }, (_, i) => i + 1);
  const days = [1, 2, 3, 4, 5, 6];

  return (
    <div className="space-y-12">
      <header className="flex justify-between items-end border-b border-[#1e2d47] pb-6">
        <div>
          <div className="text-[10px] font-mono text-cyan-500 uppercase tracking-[0.2em] mb-1">Student View</div>
          <h1 className="text-4xl font-mono font-bold text-white tracking-tighter uppercase">{cls.name}</h1>
          <p className="text-slate-500 mt-2">Academic Year {cls.year} • {cls.dept_name}</p>
        </div>
      </header>

      <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden shadow-2xl">
        <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47] flex items-center gap-3">
          <Calendar className="text-cyan-400" size={20} />
          <h2 className="font-mono font-bold text-white uppercase tracking-wider">Class Schedule</h2>
        </div>
        <div className="p-6 overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="p-3 text-left text-[10px] font-mono text-slate-500 uppercase border-b border-[#1e2d47]">Day Order</th>
                {periods.map(p => (
                  <Fragment key={`p-header-${p}`}>
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
                  <td className="p-4 font-mono font-bold text-cyan-500">DAY {day}</td>
                  {periods.map(period => {
                    const slot = timetable.find(s => s.day_order === day && s.period === period);
                    return (
                      <Fragment key={`cell-${day}-${period}`}>
                        <td className="p-2">
                          <div className={clsx(
                            "min-h-[80px] p-2 rounded border transition-all flex flex-col justify-center items-center text-center gap-1",
                            slot ? (
                              slot.type === 'placement'
                                ? "bg-emerald-500/10 border-emerald-500/30 shadow-[inset_0_0_10px_rgba(16,185,129,0.05)]"
                                : "bg-cyan-500/5 border-cyan-500/20"
                            ) : "bg-transparent border-transparent"
                          )}>
                            {slot ? (
                              <>
                                <div className={clsx(
                                  "font-bold text-xs",
                                  slot.type === 'placement' ? "text-emerald-400" : "text-white"
                                )}>
                                  {slot.type === 'placement' ? 'PLACEMENT' : slot.subject_name}
                                </div>
                                <div className="text-[10px] text-cyan-400 font-mono">{slot.type === 'placement' ? 'TRAINING' : slot.subject_code}</div>
                                {slot.lab_name && <div className="text-[9px] text-emerald-400 font-mono uppercase tracking-tighter">{slot.lab_name}</div>}
                              </>
                            ) : (
                              <div className="text-[10px] text-slate-800">—</div>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-[#0f1623] border border-[#1e2d47] p-6 rounded-xl">
          <h3 className="text-sm font-mono font-bold text-white uppercase mb-4 flex items-center gap-2">
            <Clock size={16} className="text-orange-400" /> Timing Reference
          </h3>
          <div className="space-y-2 text-sm text-slate-400 font-mono">
            <div className="flex justify-between border-b border-[#1e2d47] pb-1">
              <span>College Start</span>
              <span className="text-white">{settings.college_start_time}</span>
            </div>
            <div className="flex justify-between border-b border-[#1e2d47] pb-1">
              <span>Morning Break</span>
              <span className="text-orange-400">{settings.break_duration} mins</span>
            </div>
            <div className="flex justify-between border-b border-[#1e2d47] pb-1">
              <span>Lunch Break</span>
              <span className="text-cyan-400">{settings.lunch_duration} mins</span>
            </div>
            <div className="flex justify-between">
              <span>College End</span>
              <span className="text-white">{settings.college_end_time}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
