import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Department, Class, Staff } from '../types';
import { Plus, Users, GraduationCap, ChevronRight, BarChart3 } from 'lucide-react';
import { clsx } from 'clsx';

export default function DepartmentDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [dept, setDept] = useState<Department | null>(null);
  const [classes, setClasses] = useState<Class[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [newClass, setNewClass] = useState({ name: '', year: 1, student_strength: 0 });

  useEffect(() => {
    fetch('/api/departments').then(res => res.json()).then(data => {
      const d = data.find((x: any) => x.id === parseInt(id!));
      setDept(d);
    });
    fetch('/api/classes').then(res => res.json()).then(data => {
      setClasses(data.filter((x: any) => x.dept_id === parseInt(id!)));
    });
    fetch('/api/staff').then(res => res.json()).then(data => {
      setStaff(data.filter((x: any) => x.dept_id === parseInt(id!)));
    });
  }, [id]);

  const handleAddClass = async () => {
    const res = await fetch('/api/classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...newClass, semester: 1, dept_id: parseInt(id!) })
    });
    const data = await res.json();
    setClasses([...classes, { ...newClass, semester: 1, id: data.id, dept_id: parseInt(id!) } as Class]);
    setNewClass({ name: '', year: 1, student_strength: 0 });
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
        {/* Classes Management */}
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden">
            <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47] flex justify-between items-center">
              <div className="flex items-center gap-3">
                <GraduationCap className="text-cyan-400" size={20} />
                <h2 className="font-mono font-bold text-white uppercase tracking-wider">Academic Classes</h2>
              </div>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-4 gap-2 mb-6">
                <input 
                  placeholder="Class Name" 
                  className="col-span-1 bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                  value={newClass.name}
                  onChange={e => setNewClass({...newClass, name: e.target.value})}
                />
                <select 
                  className="bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                  value={newClass.year || ''}
                  onChange={e => setNewClass({...newClass, year: parseInt(e.target.value) || 0})}
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
                  onChange={e => setNewClass({...newClass, student_strength: parseInt(e.target.value) || 0})}
                />
                <button onClick={handleAddClass} className="bg-cyan-600 p-2 rounded hover:bg-cyan-500 transition-colors flex items-center justify-center gap-2 font-mono text-xs font-bold">
                  <Plus size={18} /> ADD CLASS
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {classes.map(c => (
                  <div 
                    key={c.id}
                    onClick={() => navigate(`/class/${c.id}`)}
                    className="flex items-center justify-between p-4 bg-[#141c2e] border border-[#1e2d47] rounded-lg hover:border-cyan-500/50 cursor-pointer transition-all group"
                  >
                    <div>
                      <div className="font-bold text-white group-hover:text-cyan-400 transition-colors">{c.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono">Academic Year {c.year} • {c.student_strength} Students</div>
                    </div>
                    <ChevronRight size={18} className="text-slate-600 group-hover:text-cyan-400" />
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* Staff Workload Overview */}
        <div className="space-y-6">
          <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden">
            <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47] flex items-center gap-3">
              <BarChart3 className="text-emerald-400" size={20} />
              <h2 className="font-mono font-bold text-white uppercase tracking-wider">Faculty Workload</h2>
            </div>
            <div className="p-6 space-y-4">
              {staff.map(s => {
                const workloadPercent = Math.min(100, (s.current_workload || 0) / s.max_workload * 100);
                return (
                  <div key={s.id} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-slate-300">{s.name}</span>
                      <span className="font-mono text-emerald-400 text-xs">
                        {s.current_workload || 0}h / {s.max_workload}h Max
                      </span>
                    </div>
                    <div className="h-2 bg-[#0a0e17] rounded-full overflow-hidden border border-[#1e2d47]">
                      <div 
                        className={clsx(
                          "h-full transition-all duration-1000",
                          workloadPercent > 100 ? "bg-red-500" : "bg-emerald-500"
                        )}
                        style={{ width: `${workloadPercent}%` }}
                      ></div>
                    </div>
                    <button 
                      onClick={() => navigate(`/staff/${s.id}`)}
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
