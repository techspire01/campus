import { useState, useEffect } from 'react';
import { FlaskConical, Plus, Trash2, Monitor, Building2, ClipboardList, Calendar } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Department, LabOverviewItem } from '../../types';

export default function LabManagement() {
  const navigate = useNavigate();
  const [labs, setLabs] = useState<any[]>([]);
  const [depts, setDepts] = useState<Department[]>([]);
  const [actionCount, setActionCount] = useState(0); // not_submitted + pending
  const [newLab, setNewLab] = useState({
    name: '',
    dept_id: '',
    systems_count: 30,
    systems_specification: '',
    os_installed: '',
  });
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const loadData = () => {
    fetch('/api/labs').then(res => res.json()).then(setLabs);
    fetch('/api/departments').then(res => res.json()).then(setDepts);
    fetch('/api/lab-requirements/overview')
      .then(res => res.json())
      .then((items: LabOverviewItem[]) =>
        setActionCount(items.filter(i => i.status !== 'assigned').length)
      );
  };

  useEffect(() => { loadData(); }, []);

  const handleAddLab = async () => {
    setStatus(null);
    const res = await fetch('/api/labs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...newLab,
        dept_id: newLab.dept_id ? parseInt(newLab.dept_id) : null
      })
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus({ type: 'error', msg: data.error || 'Failed to create lab.' });
      return;
    }
    setLabs(prev => [...prev, { ...newLab, id: data.id } as any]);
    setNewLab({ name: '', dept_id: '', systems_count: 30, systems_specification: '', os_installed: '' });
    setStatus({ type: 'success', msg: 'Lab created successfully.' });
  };

  const handleDeleteLab = async (labId: number) => {
    setStatus(null);
    if (!window.confirm('Delete this lab?')) return;
    const res = await fetch(`/api/labs/${labId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      setStatus({ type: 'error', msg: data.error || 'Failed to delete lab.' });
      return;
    }
    setLabs(prev => prev.filter(l => l.id !== labId));
    setStatus({ type: 'success', msg: 'Lab deleted successfully.' });
  };

  return (
    <div className="space-y-12">
      <header className="flex justify-between items-end border-b border-[#1e2d47] pb-6">
        <div>
          <h1 className="text-4xl font-mono font-bold text-white tracking-tighter uppercase">Laboratory Management</h1>
          <p className="text-slate-500 mt-2">Define lab resources and manage system availability for practical sessions.</p>
        </div>
        <button
          onClick={() => navigate('/labs/requests')}
          className="relative inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#141c2e] border border-[#1e2d47] text-sm font-mono font-bold text-slate-200 hover:border-cyan-500/50 hover:text-cyan-400 transition-all uppercase tracking-wider"
        >
          <ClipboardList size={16} />
          Lab Requests
          {actionCount > 0 && (
            <span className="absolute -top-2 -right-2 min-w-[20px] h-5 px-1 rounded-full bg-amber-500 text-[10px] font-bold text-black flex items-center justify-center">
              {actionCount}
            </span>
          )}
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Add New Lab */}
        <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden h-fit">
          <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47] flex items-center gap-3">
            <Plus className="text-emerald-400" size={20} />
            <h2 className="font-mono font-bold text-white uppercase tracking-wider">Register New Lab</h2>
          </div>
          <div className="p-6 space-y-4">
            {status && (
              <div className={
                status.type === 'success'
                  ? 'rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300'
                  : 'rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300'
              }>
                {status.msg}
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Lab Name</label>
              <input
                placeholder="e.g. CS Lab 1"
                className="w-full bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none focus:border-emerald-500"
                value={newLab.name}
                onChange={e => setNewLab({ ...newLab, name: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Department</label>
              <select
                className="w-full bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                value={newLab.dept_id}
                onChange={e => setNewLab({ ...newLab, dept_id: e.target.value })}
              >
                <option value="">Common Lab</option>
                {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Systems Available</label>
              <input
                type="number"
                className="w-full bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                value={newLab.systems_count || ''}
                onChange={e => setNewLab({ ...newLab, systems_count: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">System Specification</label>
              <textarea
                rows={2}
                placeholder="e.g. i5 / 16GB RAM / 512GB SSD"
                className="w-full bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none resize-none"
                value={newLab.systems_specification}
                onChange={e => setNewLab({ ...newLab, systems_specification: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">OS Installed</label>
              <input
                placeholder="e.g. Windows 11 + Ubuntu 22.04"
                className="w-full bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                value={newLab.os_installed}
                onChange={e => setNewLab({ ...newLab, os_installed: e.target.value })}
              />
            </div>
            <button
              onClick={handleAddLab}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all mt-4"
            >
              <Plus size={18} /> REGISTER LAB
            </button>
          </div>
        </section>

        {/* Labs List */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          {labs.length === 0 && (
            <div className="md:col-span-2 flex flex-col items-center justify-center py-16 text-slate-500">
              <FlaskConical size={40} className="mb-3 opacity-30" />
              <p className="font-mono text-sm uppercase tracking-wider">No labs registered yet</p>
            </div>
          )}
          {labs.map(lab => (
            <div
              key={lab.id}
              onClick={() => navigate(`/labs/${lab.id}`)}
              className="bg-[#0f1623] border border-[#1e2d47] p-6 rounded-xl relative group cursor-pointer hover:border-cyan-500/30 transition-colors"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-emerald-500/10 rounded-lg text-emerald-400">
                  <Monitor size={24} />
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-mono text-slate-500 uppercase">Systems</div>
                  <div className="text-xl font-bold text-white">{lab.systems_count}</div>
                </div>
              </div>
              <h3 className="text-xl font-bold text-white mb-1">{lab.name}</h3>
              <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500 uppercase">
                <Building2 size={12} />
                {depts.find(d => d.id === lab.dept_id)?.name || 'Common'}
              </div>
              <div className="mt-6 pt-6 border-t border-[#1e2d47] flex justify-between items-center">
                <button
                  onClick={e => {
                    e.stopPropagation();
                    navigate(`/labs/${lab.id}`);
                  }}
                  className="flex items-center gap-2 text-cyan-400 text-xs font-mono hover:text-cyan-300 transition-colors"
                >
                  <Calendar size={14} /> OPEN LAB PAGE
                </button>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    handleDeleteLab(lab.id);
                  }}
                  className="text-slate-600 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
