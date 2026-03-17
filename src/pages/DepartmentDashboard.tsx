import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Department, Class, Staff } from '../types';
import { Plus, GraduationCap, ChevronRight, BarChart3 } from 'lucide-react';
import { clsx } from 'clsx';

export default function DepartmentDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [dept, setDept] = useState<Department | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [newClass, setNewClass] = useState({
    name: '',
    year: 1,
    student_strength: 0,
    tutor_staff_id: '',
  });
  const [strengthDrafts, setStrengthDrafts] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    fetch('/api/departments').then(res => res.json()).then(data => {
      const department = data.find((item: Department) => item.id === parseInt(id!));
      setDept(department || null);
    });
    fetch('/api/classes').then(res => res.json()).then(data => {
      setClasses(data.filter((item: Class) => item.dept_id === parseInt(id!)));
    });
    fetch('/api/staff').then(res => res.json()).then(data => {
      setStaff(data.filter((item: Staff) => item.dept_id === parseInt(id!)));
    });
  }, [id]);

  const handleAddClass = async () => {
    setStatus(null);
    const res = await fetch('/api/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newClass.name,
        year: newClass.year,
        semester: 1,
        student_strength: newClass.student_strength,
        tutor_staff_id: newClass.tutor_staff_id ? parseInt(newClass.tutor_staff_id) : null,
        dept_id: parseInt(id!),
      })
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus({ type: 'error', msg: data.error || 'Failed to save class' });
      return;
    }
    setClasses(current => [...current, data as Class]);
    setNewClass({ name: '', year: 1, student_strength: 0, tutor_staff_id: '' });
    setStatus({ type: 'success', msg: 'Class saved to database' });
  };

  const handleClassUpdate = async (classId: number, tutorStaffId: string, studentStrength: number) => {
    setStatus(null);
    const res = await fetch(`/api/classes/${classId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tutor_staff_id: tutorStaffId ? parseInt(tutorStaffId) : null,
        student_strength: studentStrength,
      })
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus({ type: 'error', msg: data.error || 'Failed to update class details' });
      return false;
    }
    setClasses(current => current.map(item => item.id === classId ? data as Class : item));
    setStatus({ type: 'success', msg: 'Class details updated' });
    return true;
  };

  if (!dept) return <div className="text-cyan-400 font-mono">Loading department data...</div>;

  return (
    <div className="space-y-12">
      <header className="flex justify-between items-end border-b border-[#1e2d47] pb-6">
        <div>
          <div className="text-[10px] font-mono text-cyan-500 uppercase tracking-[0.2em] mb-1">Department View</div>
          <h1 className="text-4xl font-mono font-bold text-white tracking-tighter uppercase">{dept.name}</h1>
          <p className="text-slate-500 mt-2">Manage academic classes, faculty workload, and department schedules.</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-[#0f1623] border border-[#1e2d47] p-4 rounded-lg text-center min-w-[120px]">
            <div className="text-[10px] font-mono text-slate-500 uppercase mb-1">Total Classes</div>
            <div className="text-2xl font-bold text-white">{classes.length}</div>
          </div>
          <div className="bg-[#0f1623] border border-[#1e2d47] p-4 rounded-lg text-center min-w-[120px]">
            <div className="text-[10px] font-mono text-slate-500 uppercase mb-1">Faculty Count</div>
            <div className="text-2xl font-bold text-white">{staff.length}</div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden">
            <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47] flex justify-between items-center">
              <div className="flex items-center gap-3">
                <GraduationCap className="text-cyan-400" size={20} />
                <h2 className="font-mono font-bold text-white uppercase tracking-wider">Academic Classes</h2>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2 mb-6">
                <input
                  placeholder="Class Name"
                  className="bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                  value={newClass.name}
                  onChange={e => setNewClass({ ...newClass, name: e.target.value })}
                />
                <select
                  className="bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                  value={newClass.year}
                  onChange={e => setNewClass({ ...newClass, year: parseInt(e.target.value) || 1 })}
                >
                  <option value={1}>Year 1</option>
                  <option value={2}>Year 2</option>
                  <option value={3}>Year 3</option>
                </select>
                <input
                  type="number"
                  placeholder="Strength"
                  className="bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                  value={newClass.student_strength || ''}
                  onChange={e => setNewClass({ ...newClass, student_strength: parseInt(e.target.value) || 0 })}
                />
                <select
                  className="bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                  value={newClass.tutor_staff_id}
                  onChange={e => setNewClass({ ...newClass, tutor_staff_id: e.target.value })}
                >
                  <option value="">Assign Tutor</option>
                  {staff.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
                </select>
                <button onClick={handleAddClass} className="bg-cyan-600 p-2 rounded hover:bg-cyan-500 transition-colors flex items-center justify-center gap-2 font-mono text-xs font-bold">
                  <Plus size={18} /> ADD CLASS
                </button>
              </div>

              {status && (
                <div className={clsx(
                  "mb-6 rounded-lg border px-4 py-3 text-xs font-mono uppercase tracking-wider",
                  status.type === 'success'
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-400"
                    : "border-red-500/20 bg-red-500/10 text-red-400"
                )}>
                  {status.msg}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {classes.map(item => (
                  <div key={item.id} className="p-4 bg-[#141c2e] border border-[#1e2d47] rounded-lg transition-all hover:border-cyan-500/50">
                    <button
                      onClick={() => navigate(`/class/${item.id}`)}
                      className="mb-4 flex w-full items-center justify-between text-left"
                    >
                      <div>
                        <div className="font-bold text-white">{item.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">Academic Year {item.year} • {item.student_strength} Students</div>
                      </div>
                      <ChevronRight size={18} className="text-slate-600" />
                    </button>
                    <div className="space-y-2">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Class Tutor</div>
                      <select
                        className="w-full bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                        value={item.tutor_staff_id || ''}
                        onChange={e => handleClassUpdate(item.id, e.target.value, item.student_strength)}
                      >
                        <option value="">Not assigned</option>
                        {staff.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
                      </select>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mt-3">Class Strength</div>
                      {(() => {
                        const draft = strengthDrafts[item.id];
                        const currentStrength = item.student_strength;
                        const parsedDraft = draft === undefined ? currentStrength : (parseInt(draft, 10) || 0);
                        const hasStrengthChange = draft !== undefined && parsedDraft !== currentStrength;

                        return (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          className="w-full bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                          value={draft ?? String(currentStrength)}
                          onChange={e => {
                            setStrengthDrafts(current => ({ ...current, [item.id]: e.target.value }));
                          }}
                        />
                        {hasStrengthChange && (
                          <button
                            onClick={async () => {
                              const ok = await handleClassUpdate(
                                item.id,
                                item.tutor_staff_id ? String(item.tutor_staff_id) : '',
                                parsedDraft
                              );
                              if (ok) {
                                setStrengthDrafts(current => {
                                  const next = { ...current };
                                  delete next[item.id];
                                  return next;
                                });
                              }
                            }}
                            className="px-3 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-xs font-mono font-bold text-white uppercase"
                          >
                            Save
                          </button>
                        )}
                      </div>
                        );
                      })()}
                      <div className="text-[10px] text-slate-500 font-mono">
                        {item.tutor_name ? `Tutor: ${item.tutor_name}` : 'Tutor not assigned'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden">
            <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47] flex items-center gap-3">
              <BarChart3 className="text-emerald-400" size={20} />
              <h2 className="font-mono font-bold text-white uppercase tracking-wider">Faculty Workload</h2>
            </div>
            <div className="p-6 space-y-4">
              {staff.map(member => {
                const workloadPercent = Math.min(100, ((member.current_workload || 0) / member.max_workload) * 100);
                return (
                  <div key={member.id} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-slate-300">{member.name}</span>
                      <span className="font-mono text-emerald-400 text-xs">
                        {member.current_workload || 0}h / {member.max_workload}h Max
                      </span>
                    </div>
                    <div className="h-2 bg-[#0a0e17] rounded-full overflow-hidden border border-[#1e2d47]">
                      <div
                        className={clsx(
                          "h-full transition-all duration-1000",
                          workloadPercent > 100 ? "bg-red-500" : "bg-emerald-500"
                        )}
                        style={{ width: `${workloadPercent}%` }}
                      />
                    </div>
                    <button
                      onClick={() => navigate(`/staff/${member.id}`)}
                      className="text-[10px] font-mono text-cyan-500 hover:text-cyan-400 uppercase tracking-wider"
                    >
                      View Timetable →
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
