import { useState, useEffect } from 'react';
import { Settings, Department, Staff, Subject } from '../types';
import { Plus, Trash2, Save, Settings as SettingsIcon, Users, BookOpen, Building2, Calendar, Loader2 } from 'lucide-react';

export default function AdminDashboard() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [depts, setDepts] = useState<Department[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

  const [newDept, setNewDept] = useState({ name: '', type: 'core' });
  const [newStaff, setNewStaff] = useState({ name: '', role: 'Staff', dept_id: '', max_workload: 18 });
  const [newSubject, setNewSubject] = useState({ name: '', code: '', type: 'core', dept_id: '', is_addon: false });

  useEffect(() => {
    fetch('/api/settings').then(res => res.json()).then(setSettings);
    fetch('/api/departments').then(res => res.json()).then(setDepts);
    fetch('/api/staff').then(res => res.json()).then(setStaff);
    fetch('/api/subjects').then(res => res.json()).then(setSubjects);
  }, []);

  const handleSaveSettings = async () => {
    if (!settings) return;
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    alert('Settings saved successfully');
  };

  const handleAddDept = async () => {
    const res = await fetch('/api/departments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDept)
    });
    const data = await res.json();
    setDepts([...depts, { ...newDept, id: data.id } as Department]);
    setNewDept({ name: '', type: 'core' });
  };

  const handleDeleteDept = async (deptId: number) => {
    const shouldDelete = window.confirm('Delete this department? This will delete its classes and unlink staff from the department.');
    if (!shouldDelete) return;

    const res = await fetch(`/api/departments/${deptId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      setStatus({ type: 'error', msg: data.error || 'Failed to delete department' });
      return;
    }

    setStatus({ type: 'success', msg: 'Department deleted. Staff unlinked and classes removed.' });
    fetch('/api/departments').then(r => r.json()).then(setDepts);
    fetch('/api/staff').then(r => r.json()).then(setStaff);
  };

  const handleAddStaff = async () => {
    const res = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newStaff)
    });
    const data = await res.json();
    setStaff([...staff, { ...newStaff, id: data.id } as Staff]);
    setNewStaff({ name: '', role: 'Staff', dept_id: '', max_workload: 18 });
  };

  const handleAddSubject = async () => {
    const res = await fetch('/api/subjects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newSubject,
        dept_id: newSubject.dept_id ? parseInt(newSubject.dept_id) : null
      })
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus({ type: 'error', msg: data.error || 'Failed to save subject' });
      return;
    }
    setSubjects([...subjects, data as Subject]);
    setNewSubject({ name: '', code: '', type: 'core', dept_id: '', is_addon: false });
    setStatus({ type: 'success', msg: 'Subject saved to database' });
  };

  const handleDeleteSubject = async (subjectId: number) => {
    const shouldDelete = window.confirm('Delete this subject? It will be unassigned from all classes automatically.');
    if (!shouldDelete) return;

    try {
      const res = await fetch(`/api/subjects/${subjectId}`, { method: 'DELETE' });
      const raw = await res.text();
      const data = raw ? JSON.parse(raw) : {};

      if (!res.ok) {
        setStatus({ type: 'error', msg: data.error || 'Failed to delete subject. Restart dev server and try again.' });
        return;
      }

      setSubjects(current => current.filter(item => item.id !== subjectId));
      setStatus({ type: 'success', msg: 'Subject deleted and removed from all class assignments.' });
    } catch {
      setStatus({ type: 'error', msg: 'Delete request failed. Restart dev server and try again.' });
    }
  };

  const handleGenerateTimetable = async () => {
    setIsProcessing(true);
    setStatus(null);
    try {
      const res = await fetch('/api/timetable/generate', { method: 'POST' });
      const data = await res.json();
      if (res.ok) setStatus({ type: 'success', msg: data.message });
      else setStatus({ type: 'error', msg: data.error || 'Generation failed' });
    } catch (e) {
      setStatus({ type: 'error', msg: 'Network error' });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClearTimetable = async () => {
    setIsProcessing(true);
    setStatus(null);
    try {
      const res = await fetch('/api/timetable/clear', { method: 'POST' });
      const data = await res.json();
      if (res.ok) setStatus({ type: 'success', msg: data.message });
      else setStatus({ type: 'error', msg: data.error || 'Clear failed' });
    } catch (e) {
      setStatus({ type: 'error', msg: 'Network error' });
    } finally {
      setIsProcessing(false);
    }
  };

  if (!settings) return <div className="text-cyan-400 font-mono">Loading system configuration...</div>;

  return (
    <div className="space-y-12">
      <header className="flex justify-between items-end border-b border-[#1e2d47] pb-6">
        <div>
          <h1 className="text-4xl font-mono font-bold text-white tracking-tighter uppercase">Admin Control Panel</h1>
          <p className="text-slate-500 mt-2">Configure global college settings and manage master data.</p>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-mono text-cyan-500 uppercase tracking-[0.2em] mb-1">System Status</div>
          <div className="flex items-center gap-2 text-emerald-400 font-mono text-sm">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
            OPERATIONAL
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* College Settings */}
        <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden">
          <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47] flex items-center gap-3">
            <SettingsIcon className="text-cyan-400" size={20} />
            <h2 className="font-mono font-bold text-white uppercase tracking-wider">College Configuration</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input label="Start Time" value={settings.college_start_time} onChange={v => setSettings({...settings, college_start_time: v})} type="time" />
              <Input label="End Time" value={settings.college_end_time} onChange={v => setSettings({...settings, college_end_time: v})} type="time" />
              <Input label="Periods Per Day" value={settings.periods_per_day} onChange={v => setSettings({...settings, periods_per_day: v})} type="number" />
              <Input label="Break Duration (min)" value={settings.break_duration} onChange={v => setSettings({...settings, break_duration: v})} type="number" />
              <Input label="Break After Period" value={settings.break_after_period} onChange={v => setSettings({...settings, break_after_period: v})} type="number" />
              <Input label="Lunch Duration (min)" value={settings.lunch_duration} onChange={v => setSettings({...settings, lunch_duration: v})} type="number" />
              <Input label="Lunch After Period" value={settings.lunch_after_period} onChange={v => setSettings({...settings, lunch_after_period: v})} type="number" />
            </div>
            <button 
              onClick={handleSaveSettings}
              className="w-full mt-4 bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all"
            >
              <Save size={18} /> SAVE CONFIGURATION
            </button>
          </div>
        </section>

        {/* Departments */}
        <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden">
          <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47] flex items-center gap-3">
            <Building2 className="text-orange-400" size={20} />
            <h2 className="font-mono font-bold text-white uppercase tracking-wider">Departments</h2>
          </div>
          <div className="p-6">
            <div className="flex gap-2 mb-6">
              <input 
                placeholder="Dept Name" 
                className="flex-1 bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm focus:border-cyan-500 outline-none"
                value={newDept.name}
                onChange={e => setNewDept({...newDept, name: e.target.value})}
              />
              <select 
                className="bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                value={newDept.type}
                onChange={e => setNewDept({...newDept, type: e.target.value})}
              >
                <option value="core">Core</option>
                <option value="common">Common</option>
              </select>
              <button onClick={handleAddDept} className="bg-orange-600 p-2 rounded hover:bg-orange-500 transition-colors"><Plus size={20} /></button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              {depts.map(d => (
                <div key={d.id} className="flex justify-between items-center p-3 bg-[#141c2e] border border-[#1e2d47] rounded">
                  <div>
                    <span className="font-medium">{d.name}</span>
                    <div className="text-[10px] font-mono text-slate-500 uppercase">{d.type}</div>
                  </div>
                  <button
                    onClick={() => handleDeleteDept(d.id)}
                    className="text-slate-500 hover:text-red-400 transition-colors"
                    title="Delete department"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Staff Management */}
        <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden">
          <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47] flex items-center gap-3">
            <Users className="text-emerald-400" size={20} />
            <h2 className="font-mono font-bold text-white uppercase tracking-wider">Staff Master</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 gap-2 mb-6">
              <input 
                placeholder="Staff Name" 
                className="bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                value={newStaff.name}
                onChange={e => setNewStaff({...newStaff, name: e.target.value})}
              />
              <select 
                className="bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                value={newStaff.dept_id}
                onChange={e => setNewStaff({...newStaff, dept_id: e.target.value})}
              >
                <option value="">Select Dept</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select 
                className="bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                value={newStaff.role}
                onChange={e => setNewStaff({...newStaff, role: e.target.value as any})}
              >
                <option value="Staff">Regular Staff</option>
                <option value="HOD">HOD</option>
              </select>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  placeholder="Max WL" 
                  className="flex-1 bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                  value={newStaff.max_workload || ''}
                  onChange={e => setNewStaff({...newStaff, max_workload: parseInt(e.target.value) || 0})}
                />
                <button onClick={handleAddStaff} className="bg-emerald-600 p-2 rounded hover:bg-emerald-500 transition-colors"><Plus size={20} /></button>
              </div>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
              {staff.map(s => (
                <div key={s.id} className="flex justify-between items-center p-3 bg-[#141c2e] border border-[#1e2d47] rounded">
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{s.dept_name} • {s.role}</div>
                  </div>
                  <div className="text-xs font-mono text-emerald-400">{s.max_workload}h</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Subjects */}
        <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden">
          <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47] flex items-center gap-3">
            <BookOpen className="text-violet-400" size={20} />
            <h2 className="font-mono font-bold text-white uppercase tracking-wider">Subject Catalogue</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-2 gap-2 mb-6">
              <input 
                placeholder="Subject Name" 
                className="bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                value={newSubject.name}
                onChange={e => setNewSubject({...newSubject, name: e.target.value})}
              />
              <input 
                placeholder="Code (e.g. TAM)" 
                className="bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                value={newSubject.code}
                onChange={e => setNewSubject({...newSubject, code: e.target.value})}
              />
              <select 
                className="bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                value={newSubject.type}
                onChange={e => setNewSubject({...newSubject, type: e.target.value as any})}
              >
                <option value="core">Core</option>
                <option value="common">Common</option>
                <option value="lab">Lab</option>
              </select>
              <div className="flex gap-2">
                <select 
                  className="flex-1 bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                  value={newSubject.dept_id}
                  onChange={e => setNewSubject({...newSubject, dept_id: e.target.value})}
                >
                  <option value="">Select Dept</option>
                  {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <button onClick={handleAddSubject} className="bg-violet-600 p-2 rounded hover:bg-violet-500 transition-colors"><Plus size={20} /></button>
              </div>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
              {subjects.map(s => (
                <div key={s.id} className="flex justify-between items-center p-3 bg-[#141c2e] border border-[#1e2d47] rounded">
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{s.code} • {s.type}</div>
                  </div>
                  <button
                    onClick={() => handleDeleteSubject(s.id)}
                    className="text-slate-500 hover:text-red-400 transition-colors"
                    title="Delete subject"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Timetable Controls */}
        <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden lg:col-span-2">
          <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47] flex items-center gap-3">
            <Calendar className="text-cyan-400" size={20} />
            <h2 className="font-mono font-bold text-white uppercase tracking-wider">Timetable Engine Controls</h2>
          </div>
          <div className="p-6">
            <div className="flex flex-col md:flex-row gap-4">
              <button 
                onClick={handleGenerateTimetable}
                disabled={isProcessing}
                className="flex-1 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white font-mono font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all shadow-lg shadow-cyan-500/10"
              >
                {isProcessing ? <Loader2 className="animate-spin" size={20} /> : <Calendar size={20} />} 
                GENERATE ALL TIMETABLES
              </button>
              <button 
                onClick={handleClearTimetable}
                disabled={isProcessing}
                className="flex-1 bg-red-600/10 hover:bg-red-600/20 disabled:bg-slate-700/10 text-red-500 border border-red-500/20 font-mono font-bold py-4 rounded-xl flex items-center justify-center gap-3 transition-all"
              >
                {isProcessing ? <Loader2 className="animate-spin" size={20} /> : <Trash2 size={20} />} 
                CLEAR ALL SLOTS
              </button>
            </div>
            {status && (
              <div className={`mt-4 p-4 rounded-lg font-mono text-xs uppercase tracking-widest border ${
                status.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
              }`}>
                {status.msg}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text" }: { label: string, value: string, onChange: (v: string) => void, type?: string }) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{label}</label>
      <input 
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm focus:border-cyan-500 outline-none transition-colors"
      />
    </div>
  );
}
