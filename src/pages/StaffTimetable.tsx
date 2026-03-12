import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Staff, TimetableSlot, Settings } from '../types';
import { Clock, User, Calendar, CheckCircle2 } from 'lucide-react';
import { clsx } from 'clsx';

export default function StaffTimetable() {
  const { id } = useParams();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [timetable, setTimetable] = useState<any[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    fetch('/api/staff').then(res => res.json()).then(data => {
      setStaff(data.find((x: any) => x.id === parseInt(id!)));
    });
    // For staff, we need to fetch all slots across all classes where they are assigned
    // I'll add a specific endpoint for this in server.ts later, but for now I'll fetch all and filter
    fetch('/api/settings').then(res => res.json()).then(setSettings);
    
    // Fetching all timetable slots for this staff
    // In a real app, I'd have /api/timetable/staff/:id
    // I'll simulate it by fetching all classes and their slots
    const fetchStaffData = async () => {
      const classesRes = await fetch('/api/classes');
      const classes = await classesRes.json();
      const allSlots: any[] = [];
      for (const cls of classes) {
        const slotsRes = await fetch(`/api/timetable/${cls.id}`);
        const slots = await slotsRes.json();
        allSlots.push(...slots.filter((s: any) => s.staff_id === parseInt(id!)).map((s: any) => ({ ...s, class_name: cls.name })));
      }
      setTimetable(allSlots);
    };
    fetchStaffData();
  }, [id]);

  if (!staff || !settings) return <div className="text-cyan-400 font-mono">Loading staff timetable...</div>;

  const periods = Array.from({ length: parseInt(settings.periods_per_day) }, (_, i) => i + 1);
  const days = [1, 2, 3, 4, 5, 6];

  return (
    <div className="space-y-12">
      <header className="flex justify-between items-end border-b border-[#1e2d47] pb-6">
        <div>
          <div className="text-[10px] font-mono text-emerald-500 uppercase tracking-[0.2em] mb-1">Faculty Schedule</div>
          <h1 className="text-4xl font-mono font-bold text-white tracking-tighter uppercase">{staff.name}</h1>
          <p className="text-slate-500 mt-2">{staff.dept_name} • {staff.role}</p>
        </div>
        <div className="bg-[#0f1623] border border-[#1e2d47] p-4 rounded-lg flex items-center gap-4">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-400">
            <CheckCircle2 size={24} />
          </div>
          <div>
            <div className="text-[10px] font-mono text-slate-500 uppercase">Workload Status</div>
            <div className="text-lg font-bold text-white">{timetable.length} / {staff.max_workload} Hours</div>
          </div>
        </div>
      </header>

      <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden">
        <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47] flex items-center gap-3">
          <Calendar className="text-emerald-400" size={20} />
          <h2 className="font-mono font-bold text-white uppercase tracking-wider">Personal Timetable</h2>
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
                  <td className="p-4 font-mono font-bold text-emerald-500">DAY {day}</td>
                  {periods.map(period => {
                    const slot = timetable.find(s => s.day_order === day && s.period === period);
                    return (
                      <>
                        <td key={period} className="p-2">
                          <div className={clsx(
                            "min-h-[80px] p-2 rounded border transition-all flex flex-col justify-center items-center text-center gap-1",
                            slot ? "bg-emerald-500/5 border-emerald-500/20" : "bg-[#0a0e17] border-dashed border-[#1e2d47]"
                          )}>
                            {slot ? (
                              <>
                                <div className="font-bold text-white text-xs">{slot.class_name}</div>
                                <div className="text-[10px] text-emerald-400 font-mono">{slot.subject_code}</div>
                                {slot.lab_name && <div className="text-[9px] text-slate-500">{slot.lab_name}</div>}
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
                      </>
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
