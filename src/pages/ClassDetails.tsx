import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Class, ClassSubject, Subject, Staff, TimetableSlot, Settings } from '../types';
import { Plus, BookOpen, User, Clock, FlaskConical, Lock, Unlock, Save } from 'lucide-react';
import { clsx } from 'clsx';

export default function ClassDetails() {
  const { id } = useParams();
  const [cls, setCls] = useState<Class | null>(null);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [allStaff, setAllStaff] = useState<Staff[]>([]);
  const [timetable, setTimetable] = useState<TimetableSlot[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  const [newCS, setNewCS] = useState({ subject_id: '', staff_id: '', hours_per_week: 3, is_lab_required: false });

  useEffect(() => {
    fetch('/api/classes').then(res => res.json()).then(data => {
      setCls(data.find((x: any) => x.id === parseInt(id!)));
    });
    fetch(`/api/classes/${id}/subjects`).then(res => res.json()).then(setClassSubjects);
    fetch('/api/subjects').then(res => res.json()).then(setAllSubjects);
    fetch('/api/staff').then(res => res.json()).then(setAllStaff);
    fetch(`/api/timetable/${id}`).then(res => res.json()).then(setTimetable);
    fetch('/api/settings').then(res => res.json()).then(setSettings);
  }, [id]);

  const handleAddSubject = async () => {
    const res = await fetch(`/api/classes/${id}/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newCS,
        subject_id: parseInt(newCS.subject_id),
        staff_id: newCS.staff_id ? parseInt(newCS.staff_id) : null
      })
    });
    const data = await res.json();
    // Refresh subjects
    fetch(`/api/classes/${id}/subjects`).then(res => res.json()).then(setClassSubjects);
    setNewCS({ subject_id: '', staff_id: '', hours_per_week: 3, is_lab_required: false });
  };

  const handleAssignSlot = async (day: number, period: number, subjectId: number | null, staffId: number | null, type: string) => {
    const res = await fetch('/api/timetable/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        class_id: parseInt(id!),
        day_order: day,
        period: period,
        subject_id: subjectId,
        staff_id: staffId,
        type: type,
        is_locked: false
      })
    });
    if (res.ok) {
      fetch(`/api/timetable/${id}`).then(res => res.json()).then(setTimetable);
    } else {
      const err = await res.json();
      alert(err.error);
    }
  };

  if (!cls || !settings) return <div className="text-cyan-400 font-mono">Loading class details...</div>;

  const periods = Array.from({ length: parseInt(settings.periods_per_day) }, (_, i) => i + 1);
  const days = [1, 2, 3, 4, 5, 6];

  return (
    <div className="space-y-12">
      <header className="flex justify-between items-end border-b border-[#1e2d47] pb-6">
        <div>
          <div className="text-[10px] font-mono text-cyan-500 uppercase tracking-[0.2em] mb-1">{cls.dept_name}</div>
          <h1 className="text-4xl font-mono font-bold text-white tracking-tighter uppercase">{cls.name}</h1>
          <p className="text-slate-500 mt-2">Configure subjects and manage the weekly timetable grid.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
        {/* Subject Configuration */}
        <div className="xl:col-span-1 space-y-6">
          <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden">
            <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47] flex items-center gap-3">
              <BookOpen className="text-violet-400" size={20} />
              <h2 className="font-mono font-bold text-white uppercase tracking-wider">Class Subjects</h2>
            </div>
            <div className="p-6 space-y-6">
              <div className="space-y-3">
                <select 
                  className="w-full bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                  value={newCS.subject_id}
                  onChange={e => setNewCS({...newCS, subject_id: e.target.value})}
                >
                  <option value="">Select Subject</option>
                  {allSubjects.map(s => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
                </select>
                <select 
                  className="w-full bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                  value={newCS.staff_id}
                  onChange={e => setNewCS({...newCS, staff_id: e.target.value})}
                >
                  <option value="">Select Staff</option>
                  {allStaff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <div className="flex gap-2">
                  <input 
                    type="number" 
                    placeholder="Hrs/Wk" 
                    className="flex-1 bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                    value={newCS.hours_per_week || ''}
                    onChange={e => setNewCS({...newCS, hours_per_week: parseInt(e.target.value) || 0})}
                  />
                  <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={newCS.is_lab_required}
                      onChange={e => setNewCS({...newCS, is_lab_required: e.target.checked})}
                    />
                    Lab?
                  </label>
                </div>
                <button 
                  onClick={handleAddSubject}
                  className="w-full bg-violet-600 hover:bg-violet-500 text-white font-mono font-bold py-2 rounded transition-all flex items-center justify-center gap-2"
                >
                  <Plus size={16} /> ADD SUBJECT
                </button>
              </div>

              <div className="space-y-2">
                {classSubjects.map(cs => (
                  <div key={cs.id} className="p-3 bg-[#141c2e] border border-[#1e2d47] rounded text-sm group">
                    <div className="flex justify-between items-start">
                      <span className="font-bold text-white">{cs.subject_name}</span>
                      <span className="text-[10px] font-mono text-cyan-500">{cs.subject_code}</span>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <span className="text-xs text-slate-500">{cs.staff_name || 'No staff'}</span>
                      <span className="text-xs text-slate-400 font-mono">{cs.hours_per_week}h</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Timetable Grid */}
        <div className="xl:col-span-3 space-y-6">
          <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden">
            <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47] flex justify-between items-center">
              <div className="flex items-center gap-3">
                <Clock className="text-cyan-400" size={20} />
                <h2 className="font-mono font-bold text-white uppercase tracking-wider">Weekly Schedule</h2>
              </div>
              <div className="flex gap-4 text-[10px] font-mono uppercase tracking-widest">
                <span className="flex items-center gap-1 text-orange-400"><Lock size={10} /> Locked</span>
                <span className="flex items-center gap-1 text-cyan-400"><Unlock size={10} /> Editable</span>
              </div>
            </div>
            <div className="p-6 overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="p-3 text-left text-[10px] font-mono text-slate-500 uppercase border-b border-[#1e2d47]">Day Order</th>
                    {periods.map(p => (
                      <th key={p} className="p-3 text-center text-[10px] font-mono text-slate-500 uppercase border-b border-[#1e2d47]">
                        Period {p}
                        {p === parseInt(settings.break_after_period) && <div className="text-orange-500 mt-1">BREAK</div>}
                        {p === parseInt(settings.lunch_after_period) && <div className="text-cyan-500 mt-1">LUNCH</div>}
                      </th>
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
                          <td key={period} className="p-2">
                            <div className={clsx(
                              "min-h-[80px] p-2 rounded border transition-all flex flex-col justify-center items-center text-center gap-1",
                              slot ? (slot.is_locked ? "bg-orange-500/5 border-orange-500/20" : "bg-cyan-500/5 border-cyan-500/20") : "bg-[#0a0e17] border-dashed border-[#1e2d47]"
                            )}>
                              {slot ? (
                                <>
                                  <div className="font-bold text-white text-xs">{slot.subject_code}</div>
                                  <div className="text-[10px] text-slate-500">{slot.staff_name}</div>
                                  {slot.lab_name && <div className="text-[9px] text-emerald-400 font-mono">{slot.lab_name}</div>}
                                </>
                              ) : (
                                <select 
                                  className="w-full bg-transparent text-[10px] text-slate-600 outline-none cursor-pointer hover:text-cyan-400"
                                  onChange={(e) => {
                                    const cs = classSubjects.find(x => x.id === parseInt(e.target.value));
                                    if (cs) handleAssignSlot(day, period, cs.subject_id, cs.staff_id, cs.is_lab_required ? 'lab' : 'core');
                                  }}
                                >
                                  <option value="">+</option>
                                  {classSubjects.map(cs => <option key={cs.id} value={cs.id}>{cs.subject_code}</option>)}
                                </select>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
