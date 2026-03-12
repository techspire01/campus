import { useState, useEffect } from 'react';
import { Class, TimetableSlot, Settings } from '../types';
import { Search, Filter, Download, Calendar } from 'lucide-react';
import { clsx } from 'clsx';

export default function GlobalTimetables() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [timetable, setTimetable] = useState<TimetableSlot[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetch('/api/classes').then(res => res.json()).then(data => {
      setClasses(data);
      if (data.length > 0) setSelectedClassId(data[0].id);
    });
    fetch('/api/settings').then(res => res.json()).then(setSettings);
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      fetch(`/api/timetable/${selectedClassId}`).then(res => res.json()).then(setTimetable);
    }
  }, [selectedClassId]);

  const filteredClasses = classes.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.dept_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!settings) return <div className="text-cyan-400 font-mono">Loading timetables...</div>;

  const periods = Array.from({ length: parseInt(settings.periods_per_day) }, (_, i) => i + 1);
  const days = [1, 2, 3, 4, 5, 6];

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-[#1e2d47] pb-6 gap-4">
        <div>
          <h1 className="text-4xl font-mono font-bold text-white tracking-tighter uppercase">Global Timetables</h1>
          <p className="text-slate-500 mt-2">Browse and export timetables for all departments and classes.</p>
        </div>
        <div className="flex gap-3">
          <button className="bg-[#0f1623] border border-[#1e2d47] text-slate-400 hover:text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition-all">
            <Download size={18} /> Export PDF
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Class Selector */}
        <aside className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input 
              placeholder="Search classes..." 
              className="w-full bg-[#0f1623] border border-[#1e2d47] rounded-lg pl-10 pr-4 py-2 text-sm outline-none focus:border-cyan-500"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
              {filteredClasses.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedClassId(c.id)}
                  className={clsx(
                    "w-full text-left p-4 border-b border-[#1e2d47] transition-all hover:bg-[#141c2e]",
                    selectedClassId === c.id ? "bg-[#141c2e] border-l-4 border-l-cyan-500" : "bg-transparent"
                  )}
                >
                  <div className="font-bold text-white text-sm">{c.name}</div>
                  <div className="text-[10px] font-mono text-slate-500 uppercase">{c.dept_name}</div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Timetable View */}
        <main className="lg:col-span-3 space-y-6">
          {selectedClassId ? (
            <div className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden shadow-2xl">
              <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47] flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Calendar className="text-cyan-400" size={20} />
                  <h2 className="font-mono font-bold text-white uppercase tracking-wider">
                    {classes.find(c => c.id === selectedClassId)?.name} Schedule
                  </h2>
                </div>
              </div>
              <div className="p-6 overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="p-3 text-left text-[10px] font-mono text-slate-500 uppercase border-b border-[#1e2d47]">Day Order</th>
                      {periods.map(p => (
                        <>
                          <th key={p} className="p-3 text-center text-[10px] font-mono text-slate-500 uppercase border-b border-[#1e2d47]">
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
                        </>
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
                            <>
                              <td key={period} className="p-2">
                                <div className={clsx(
                                  "min-h-[80px] p-2 rounded border transition-all flex flex-col justify-center items-center text-center gap-1",
                                  slot ? "bg-cyan-500/5 border-cyan-500/20" : "bg-[#0a0e17] border-dashed border-[#1e2d47]"
                                )}>
                                  {slot ? (
                                    <>
                                      <div className="font-bold text-white text-xs">{slot.subject_name}</div>
                                      <div className="text-[10px] text-cyan-400 font-mono">{slot.subject_code}</div>
                                      <div className="text-[9px] text-slate-500">{slot.staff_name}</div>
                                    </>
                                  ) : (
                                    <span className="text-[10px] font-mono text-slate-800 uppercase tracking-widest">—</span>
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
                            </>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="h-[400px] border-2 border-dashed border-[#1e2d47] rounded-xl flex items-center justify-center text-slate-600 font-mono uppercase tracking-widest">
              Select a class to view timetable
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
