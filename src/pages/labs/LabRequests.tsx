import { useState, useEffect, useMemo } from 'react';
import {
  FlaskConical, ArrowLeft, CheckCircle2, Clock, Trash2,
  FlaskRound, Lock, Bell, AlertCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LabOverviewItem } from '../../types';

type FilterTab = 'all' | 'not_submitted' | 'pending' | 'assigned';

export default function LabRequests() {
  const navigate = useNavigate();
  const [items, setItems] = useState<LabOverviewItem[]>([]);
  const [labs, setLabs] = useState<any[]>([]);
  const [assigningKey, setAssigningKey] = useState<string | null>(null);
  const [selectedLab, setSelectedLab] = useState<Record<string, string>>({});
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  const loadData = () => {
    fetch('/api/lab-requirements/overview').then(r => r.json()).then(setItems);
    fetch('/api/labs').then(r => r.json()).then(setLabs);
  };

  const itemKey = (item: LabOverviewItem) => `${item.class_id}-${item.subject_id}`;

  useEffect(() => { loadData(); }, []);

  const handleAssign = async (item: LabOverviewItem) => {
    if (!item.req_id) return;
    const labId = selectedLab[itemKey(item)];
    if (!labId) {
      setStatus({ type: 'error', msg: 'Select a lab before assigning.' });
      return;
    }
    setAssigningKey(itemKey(item));
    setStatus(null);
    const res = await fetch(`/api/lab-requirements/${item.req_id}/assign`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lab_id: parseInt(labId, 10) })
    });
    setAssigningKey(null);
    const data = await res.json();
    if (!res.ok) {
      setStatus({ type: 'error', msg: data.error || 'Failed to assign lab.' });
      return;
    }
    setStatus({ type: 'success', msg: `Lab assigned to ${item.class_name} — ${item.subject_name}.` });
    loadData();
  };

  const handleDelete = async (item: LabOverviewItem) => {
    if (!item.req_id) return;
    if (!window.confirm(`Delete the lab request for "${item.subject_name}" (${item.class_name})? This will also free any assigned lab.`)) return;
    setDeletingId(item.req_id);
    setStatus(null);
    const res = await fetch(`/api/lab-requirements/${item.req_id}`, { method: 'DELETE' });
    setDeletingId(null);
    if (!res.ok) {
      const data = await res.json();
      setStatus({ type: 'error', msg: data.error || 'Failed to delete.' });
      return;
    }
    setStatus({ type: 'success', msg: 'Lab request deleted.' });
    loadData();
  };

  const counts = {
    all: items.length,
    not_submitted: items.filter(i => i.status === 'not_submitted').length,
    pending: items.filter(i => i.status === 'pending').length,
    assigned: items.filter(i => i.status === 'assigned').length,
  };

  const departments = useMemo(() => {
    return Array.from(new Set(items.map(i => i.dept_name).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const years = useMemo(() => {
    return Array.from(new Set(items.map(i => i.year).filter(y => y != null) as number[])).sort((a, b) => a - b);
  }, [items]);

  const displayed = items.filter(item => {
    if (filter !== 'all' && item.status !== filter) return false;
    if (departmentFilter !== 'all' && item.dept_name !== departmentFilter) return false;
    if (yearFilter !== 'all' && String(item.year ?? '') !== yearFilter) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      item.subject_name.toLowerCase().includes(q) ||
      item.subject_code.toLowerCase().includes(q)
    );
  });

  const tabLabel: Record<FilterTab, string> = {
    all: 'All',
    not_submitted: 'Not Submitted',
    pending: 'Pending',
    assigned: 'Assigned',
  };

  return (
    <div className="space-y-8">
      <header className="border-b border-[#1e2d47] pb-6">
        <button
          onClick={() => navigate('/labs')}
          className="inline-flex items-center gap-2 text-xs font-mono text-slate-500 hover:text-slate-200 mb-4 transition-colors uppercase tracking-wider"
        >
          <ArrowLeft size={14} /> Lab Management
        </button>
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-mono font-bold text-white tracking-tighter uppercase">Lab Requests</h1>
            <p className="text-slate-500 mt-2">
              All lab subjects across every class — review, track, and assign physical labs.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="text-center px-4 py-2 rounded-lg bg-slate-500/10 border border-slate-500/20">
              <div className="text-xl font-bold text-slate-300">{counts.not_submitted}</div>
              <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Awaiting</div>
            </div>
            <div className="text-center px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <div className="text-xl font-bold text-amber-400">{counts.pending}</div>
              <div className="text-[10px] font-mono text-amber-500/70 uppercase tracking-wider">Pending</div>
            </div>
            <div className="text-center px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <div className="text-xl font-bold text-emerald-400">{counts.assigned}</div>
              <div className="text-[10px] font-mono text-emerald-500/70 uppercase tracking-wider">Assigned</div>
            </div>
          </div>
        </div>
      </header>

      {counts.not_submitted > 0 && (
        <div className="rounded-xl border border-slate-500/20 bg-slate-500/5 px-4 py-3 flex items-start gap-3">
          <Bell size={16} className="text-slate-400 mt-0.5 shrink-0" />
          <p className="text-sm text-slate-300">
            <span className="font-semibold">{counts.not_submitted}</span> lab subject{counts.not_submitted !== 1 ? 's' : ''} across classes have not yet submitted a formal request. The class teacher must click{' '}
            <span className="italic text-slate-400">"Request Lab"</span> on the class details page to begin the assignment process.
          </p>
        </div>
      )}

      {status && (
        <div className={
          status.type === 'success'
            ? 'rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300'
            : 'rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300'
        }>
          {status.msg}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-[#1e2d47]">
        {(['all', 'not_submitted', 'pending', 'assigned'] as FilterTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`relative px-4 py-2.5 text-xs font-mono uppercase tracking-widest rounded-t transition-colors ${
              filter === tab
                ? 'text-cyan-400 border border-b-0 border-[#1e2d47] bg-[#0f1623] -mb-px'
                : 'text-slate-500 hover:text-slate-200'
            }`}
          >
            {tabLabel[tab]}
            {tab !== 'all' && counts[tab] > 0 && (
              <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                tab === 'not_submitted' ? 'bg-slate-600 text-slate-200'
                : tab === 'pending'     ? 'bg-amber-500/30 text-amber-300'
                :                        'bg-emerald-500/30 text-emerald-300'
              }`}>
                {counts[tab]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <select
          value={departmentFilter}
          onChange={e => setDepartmentFilter(e.target.value)}
          className="bg-[#0a0e17] border border-[#2a3a57] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500"
        >
          <option value="all">All Departments</option>
          {departments.map(dep => (
            <option key={dep} value={dep}>{dep}</option>
          ))}
        </select>

        <select
          value={yearFilter}
          onChange={e => setYearFilter(e.target.value)}
          className="bg-[#0a0e17] border border-[#2a3a57] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500"
        >
          <option value="all">All Years</option>
          {years.map(y => (
            <option key={y} value={String(y)}>Year {y}</option>
          ))}
        </select>

        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search subject or code..."
          className="bg-[#0a0e17] border border-[#2a3a57] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-500"
        />
      </div>

      {displayed.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <FlaskConical size={44} className="mb-4 opacity-30" />
          <p className="font-mono text-sm uppercase tracking-wider">
            {filter === 'not_submitted' ? 'All lab subjects have been submitted'
              : filter === 'pending'    ? 'No pending requests'
              : filter === 'assigned'   ? 'No labs assigned yet'
              :                          'No lab subjects found'}
          </p>
        </div>
      )}

      <div className="space-y-3">
        {displayed.map(item => (
          <div
            key={itemKey(item)}
            className={`rounded-xl border p-4 ${
              item.status === 'assigned'      ? 'border-emerald-500/20 bg-emerald-500/5'
              : item.status === 'pending'     ? 'border-amber-500/20  bg-amber-500/5'
              :                                 'border-[#1e2d47]      bg-[#0f1623]'
            }`}
          >
            <div className="flex flex-col lg:flex-row lg:items-center gap-4">
              {/* Icon + info */}
              <div className="flex-1 flex items-start gap-3 min-w-0">
                <div className={`mt-0.5 p-2 rounded-lg shrink-0 ${
                  item.status === 'assigned'  ? 'bg-emerald-500/10 text-emerald-400'
                  : item.status === 'pending' ? 'bg-amber-500/10   text-amber-400'
                  :                             'bg-slate-500/10   text-slate-400'
                }`}>
                  <FlaskRound size={18} />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-white truncate">
                    {item.subject_name}
                    <span className="ml-2 text-xs text-slate-500 font-normal">{item.subject_code}</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {item.class_name}
                    <span className="text-slate-600 mx-1">·</span>
                    {item.dept_name || 'Unknown Department'}
                    <span className="text-slate-600 mx-1">·</span>
                    Year {item.year ?? '-'}
                    <span className="text-slate-600 mx-1">·</span>
                    {item.hours_per_week}h/week
                    {item.duration && (
                      <><span className="text-slate-600 mx-1">·</span>{item.duration} periods/session</>
                    )}
                  </p>
                  {item.requirements && (
                    <p className="text-xs text-slate-500 mt-1 italic">"{item.requirements}"</p>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-wrap justify-end">
                {item.status === 'not_submitted' && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-500/20 bg-slate-500/10">
                    <AlertCircle size={13} className="text-slate-400" />
                    <span className="text-xs font-mono text-slate-400">Awaiting class submission</span>
                  </div>
                )}

                {item.status === 'pending' && (
                  <>
                    <div className="flex items-center gap-1 px-2 py-1 rounded bg-amber-700/20 text-amber-300 text-xs font-mono">
                      <Clock size={11} /> Pending
                    </div>
                    <select
                      className="bg-[#0a0e17] border border-[#2a3a57] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-cyan-500"
                      value={selectedLab[itemKey(item)] || ''}
                      onChange={e => setSelectedLab(prev => ({ ...prev, [itemKey(item)]: e.target.value }))}
                    >
                      <option value="">Select Lab</option>
                      {labs.map(l => (
                        <option key={l.id} value={l.id}>{l.name} ({l.systems_count} systems)</option>
                      ))}
                    </select>
                    <button
                      onClick={() => handleAssign(item)}
                      disabled={assigningKey === itemKey(item) || !selectedLab[itemKey(item)]}
                      className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white text-xs font-mono font-bold uppercase tracking-wider transition-colors"
                    >
                      {assigningKey === itemKey(item) ? 'Assigning…' : 'Assign'}
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      disabled={deletingId === item.req_id}
                      className="p-2 rounded text-slate-600 hover:text-red-400 transition-colors disabled:opacity-50"
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}

                {item.status === 'assigned' && (
                  <>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                      <Lock size={12} className="text-emerald-400" />
                      <span className="text-sm font-mono font-bold text-emerald-300">{item.lab_name}</span>
                    </div>
                    <div className="flex items-center gap-1 px-2 py-1 rounded bg-emerald-700/20 text-emerald-300 text-xs font-mono">
                      <CheckCircle2 size={11} /> Assigned
                    </div>
                    <button
                      onClick={() => handleDelete(item)}
                      disabled={deletingId === item.req_id}
                      className="p-2 rounded text-slate-600 hover:text-red-400 transition-colors disabled:opacity-50"
                      title="Delete request & free the lab"
                    >
                      <Trash2 size={15} />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
