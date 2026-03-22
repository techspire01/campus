import { useState, useEffect, useMemo } from 'react';
import { Department, Staff } from '../types';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';
import { clsx } from 'clsx';

export default function StaffManagement() {
  const [depts, setDepts] = useState<Department[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const [newStaff, setNewStaff] = useState({ name: '', role: 'Staff', dept_id: '', max_workload: 18 });
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editData, setEditData] = useState({ name: '', role: 'Staff', dept_id: '', max_workload: 18 });
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<'combined' | 'Staff' | 'HOD'>('combined');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [deptsRes, staffRes] = await Promise.all([
        fetch('/api/departments'),
        fetch('/api/staff')
      ]);
      setDepts(await deptsRes.json());
      setStaff(await staffRes.json());
    } catch (e: any) {
      setStatus({ type: 'error', msg: 'Failed to load data' });
    }
  };

  const handleAddStaff = async () => {
    setStatus(null);
    if (!newStaff.name) {
      setStatus({ type: 'error', msg: 'Staff name is required' });
      return;
    }

    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStaff)
      });

      if (!res.ok) {
        const data = await res.json();
        setStatus({ type: 'error', msg: data.error || 'Failed to add staff' });
        return;
      }

      const data = await res.json();
      setStaff([...staff, { ...newStaff, id: data.id } as Staff]);
      setNewStaff({ name: '', role: 'Staff', dept_id: '', max_workload: 18 });
      setStatus({ type: 'success', msg: 'Staff added successfully' });
    } catch (e: any) {
      setStatus({ type: 'error', msg: e.message });
    }
  };

  const handleEditStart = (s: Staff) => {
    setEditingId(s.id);
    setEditData({
      name: s.name,
      role: s.role,
      dept_id: s.dept_id ? String(s.dept_id) : '',
      max_workload: s.max_workload
    });
  };

  const handleEditSave = async () => {
    setStatus(null);
    if (!editData.name) {
      setStatus({ type: 'error', msg: 'Staff name is required' });
      return;
    }

    try {
      const res = await fetch(`/api/staff/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData)
      });

      if (!res.ok) {
        const data = await res.json();
        setStatus({ type: 'error', msg: data.error || 'Failed to update staff' });
        return;
      }

      setStaff(staff.map(s => 
        s.id === editingId 
          ? { ...s, ...editData, dept_id: editData.dept_id ? Number(editData.dept_id) : null }
          : s
      ));
      setEditingId(null);
      setStatus({ type: 'success', msg: 'Staff updated successfully' });
    } catch (e: any) {
      setStatus({ type: 'error', msg: e.message });
    }
  };

  const handleDeleteStaff = async (staffId: number) => {
    const staffMember = staff.find(s => s.id === staffId);
    if (!window.confirm(`Delete ${staffMember?.name}? This action cannot be undone.`)) return;

    setStatus(null);
    try {
      const res = await fetch(`/api/staff/${staffId}`, { method: 'DELETE' });

      if (!res.ok) {
        const data = await res.json();
        setStatus({ type: 'error', msg: data.error || 'Failed to delete staff' });
        return;
      }

      setStaff(staff.filter(s => s.id !== staffId));
      setStatus({ type: 'success', msg: 'Staff deleted successfully' });
    } catch (e: any) {
      setStatus({ type: 'error', msg: e.message });
    }
  };

  const filteredStaff = useMemo(() => {
    return staff.filter(member => {
      const departmentMatch =
        departmentFilter === 'all' || member.dept_id === Number(departmentFilter);
      const roleMatch = roleFilter === 'combined' || member.role === roleFilter;
      return departmentMatch && roleMatch;
    });
  }, [staff, departmentFilter, roleFilter]);

  return (
    <div className="space-y-8">
      <header className="border-b border-[#1e2d47] pb-6">
        <div className="text-[10px] font-mono text-cyan-500 uppercase tracking-[0.2em] mb-1">Management</div>
        <h1 className="text-4xl font-mono font-bold text-white tracking-tighter uppercase">Staff Master</h1>
        <p className="text-slate-500 mt-2">Create, edit, and manage faculty members and their workload assignments.</p>
      </header>

      {status && (
        <div
          className={clsx(
            'rounded-lg border px-4 py-3 text-sm font-mono uppercase tracking-wider',
            status.type === 'success'
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
              : 'border-red-500/20 bg-red-500/10 text-red-300'
          )}
        >
          {status.msg}
        </div>
      )}

      {/* Add New Staff */}
      <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden">
        <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47] flex items-center gap-3">
          <Plus className="text-cyan-400" size={20} />
          <h2 className="font-mono font-bold text-white uppercase tracking-wider">Add New Staff</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <input
              placeholder="Staff Name"
              className="bg-[#0a0e17] border border-[#1e2d47] rounded p-3 text-sm outline-none focus:border-cyan-500/50"
              value={newStaff.name}
              onChange={e => setNewStaff({ ...newStaff, name: e.target.value })}
            />
            <select
              className="bg-[#0a0e17] border border-[#1e2d47] rounded p-3 text-sm outline-none focus:border-cyan-500/50"
              value={newStaff.dept_id}
              onChange={e => setNewStaff({ ...newStaff, dept_id: e.target.value })}
            >
              <option value="">Select Department</option>
              {depts.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <select
              className="bg-[#0a0e17] border border-[#1e2d47] rounded p-3 text-sm outline-none focus:border-cyan-500/50"
              value={newStaff.role}
              onChange={e => setNewStaff({ ...newStaff, role: e.target.value as any })}
            >
              <option value="Staff">Regular Staff</option>
              <option value="HOD">HOD</option>
            </select>
            <input
              type="number"
              placeholder="Max Working Hours"
              className="bg-[#0a0e17] border border-[#1e2d47] rounded p-3 text-sm outline-none focus:border-cyan-500/50"
              value={newStaff.max_workload || ''}
              onChange={e => setNewStaff({ ...newStaff, max_workload: parseInt(e.target.value) || 0 })}
            />
            <button
              onClick={handleAddStaff}
              className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-mono font-bold uppercase transition-colors flex items-center justify-center gap-2"
            >
              <Plus size={16} /> Add Staff
            </button>
          </div>
        </div>
      </section>

      {/* Staff List */}
      <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden">
        <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47] flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <span className="text-emerald-400 font-bold text-sm">{filteredStaff.length}</span>
          </div>
          <h2 className="font-mono font-bold text-white uppercase tracking-wider">Staff Directory</h2>
        </div>
        <div className="px-6 py-4 border-b border-[#1e2d47] bg-[#0c1320]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <select
              className="bg-[#0a0e17] border border-[#1e2d47] rounded p-3 text-sm outline-none focus:border-cyan-500/50"
              value={departmentFilter}
              onChange={e => setDepartmentFilter(e.target.value)}
            >
              <option value="all">All Departments</option>
              {depts.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            <select
              className="bg-[#0a0e17] border border-[#1e2d47] rounded p-3 text-sm outline-none focus:border-cyan-500/50"
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value as 'combined' | 'Staff' | 'HOD')}
            >
              <option value="combined">Combined (Regular + HOD)</option>
              <option value="Staff">Regular Staff</option>
              <option value="HOD">HOD</option>
            </select>
          </div>
        </div>
        <div className="divide-y divide-[#1e2d47] max-h-96 overflow-y-auto">
          {staff.length === 0 ? (
            <div className="p-6 text-center text-slate-500 font-mono text-sm">No staff members added yet</div>
          ) : filteredStaff.length === 0 ? (
            <div className="p-6 text-center text-slate-500 font-mono text-sm">No staff members match the selected filters</div>
          ) : (
            filteredStaff.map(s => (
              <div key={s.id} className="p-4 bg-[#0f1623] hover:bg-[#141c2e] transition-colors">
                {editingId === s.id ? (
                  /* Edit Mode */
                  <div className="space-y-3">
                    <input
                      className="w-full bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none focus:border-cyan-500/50"
                      value={editData.name}
                      onChange={e => setEditData({ ...editData, name: e.target.value })}
                    />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <select
                        className="bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none focus:border-cyan-500/50"
                        value={editData.dept_id}
                        onChange={e => setEditData({ ...editData, dept_id: e.target.value })}
                      >
                        <option value="">Select Department</option>
                        {depts.map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                      <select
                        className="bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none focus:border-cyan-500/50"
                        value={editData.role}
                        onChange={e => setEditData({ ...editData, role: e.target.value as any })}
                      >
                        <option value="Staff">Regular Staff</option>
                        <option value="HOD">HOD</option>
                      </select>
                      <input
                        type="number"
                        className="bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none focus:border-cyan-500/50"
                        value={editData.max_workload}
                        onChange={e => setEditData({ ...editData, max_workload: parseInt(e.target.value) || 0 })}
                      />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1 rounded bg-[#141c2e] border border-[#1e2d47] text-slate-300 text-xs font-mono uppercase hover:border-slate-500 transition-colors flex items-center gap-1"
                      >
                        <X size={14} /> Cancel
                      </button>
                      <button
                        onClick={handleEditSave}
                        className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-mono font-bold uppercase transition-colors flex items-center gap-1"
                      >
                        <Check size={14} /> Save
                      </button>
                    </div>
                  </div>
                ) : (
                  /* View Mode */
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="font-bold text-white">{s.name}</div>
                        <span className="text-[9px] font-mono uppercase tracking-wider bg-cyan-500/10 text-cyan-400 px-2 py-1 rounded">
                          {s.role}
                        </span>
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 space-y-1">
                        <div>Department: <span className="text-slate-400">{s.dept_name || 'Not assigned'}</span></div>
                        <div>Max Workload: <span className="text-emerald-400 font-bold">{s.max_workload} hours</span></div>
                        <div>Current Workload: <span className="text-cyan-400 font-bold">{s.current_workload || 0} hours</span></div>
                      </div>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => handleEditStart(s)}
                        className="p-2 rounded bg-[#141c2e] border border-[#1e2d47] text-orange-400 hover:bg-orange-500/10 transition-colors"
                        title="Edit staff"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteStaff(s.id)}
                        className="p-2 rounded bg-[#141c2e] border border-[#1e2d47] text-red-400 hover:bg-red-500/10 transition-colors"
                        title="Delete staff"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
