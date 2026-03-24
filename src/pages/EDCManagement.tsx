import { useEffect, useState } from 'react';
import { BookOpen, CheckSquare, LoaderCircle, Plus, Square, Trash2 } from 'lucide-react';
import { Class, Department } from '../types';

export default function EDCManagement() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);
  const [hours, setHours] = useState(1);
  const [filterYear, setFilterYear] = useState<number | 'all'>('all');
  const [filterDept, setFilterDept] = useState<number | 'all'>('all');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUnallocating, setIsUnallocating] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    fetch('/api/classes').then(res => res.json()).then(setClasses);
    fetch('/api/departments').then(res => res.json()).then(setDepartments);
  }, []);

  const filteredClasses = classes.filter(item => {
    const yearMatch = filterYear === 'all' || item.year === filterYear;
    const deptMatch = filterDept === 'all' || item.dept_id === filterDept;
    return yearMatch && deptMatch;
  });

  const toggleClass = (classId: number) => {
    setSelectedClassIds(current =>
      current.includes(classId) ? current.filter(id => id !== classId) : [...current, classId]
    );
  };

  const handleGenerate = async () => {
    setStatus(null);
    setIsGenerating(true);

    try {
      const res = await fetch('/api/edc/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_ids: selectedClassIds,
          hours,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: 'error', msg: data.error || 'Failed to generate EDC timetable.' });
        return;
      }
      setStatus({ type: 'success', msg: data.message || 'EDC timetable generated successfully.' });
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.message || 'Failed to generate EDC timetable.' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUnallocate = async () => {
    setStatus(null);
    setIsUnallocating(true);

    try {
      const res = await fetch('/api/edc/unallocate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_ids: selectedClassIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: 'error', msg: data.error || 'Failed to unallocate EDC.' });
        return;
      }
      setStatus({ type: 'success', msg: data.message || 'EDC unallocated successfully.' });
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.message || 'Failed to unallocate EDC.' });
    } finally {
      setIsUnallocating(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="border-b border-[#1e2d47] pb-6">
        <h1 className="text-4xl font-mono font-bold text-white tracking-tighter uppercase">EDC Scheduler</h1>
        <p className="text-slate-500 mt-2">Assign EDC to selected classes and generate aligned slots across them.</p>
      </header>

      <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Filter by Year</label>
            <select
              className="mt-1 w-full rounded-md border border-[#2a3a57] bg-[#0a0e17] px-3 py-2 text-sm"
              value={filterYear}
              onChange={e => setFilterYear(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))}
            >
              <option value="all">All Years</option>
              <option value={1}>Year 1</option>
              <option value={2}>Year 2</option>
              <option value={3}>Year 3</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-slate-500">Filter by Department</label>
            <select
              className="mt-1 w-full rounded-md border border-[#2a3a57] bg-[#0a0e17] px-3 py-2 text-sm"
              value={filterDept}
              onChange={e => setFilterDept(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))}
            >
              <option value="all">All Departments</option>
              {departments.map(item => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-mono uppercase tracking-wider text-slate-500">EDC Hours / Week</label>
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-md border border-[#2a3a57] bg-[#0a0e17] px-3 py-2 text-sm"
              value={hours}
              onChange={e => setHours(parseInt(e.target.value, 10) || 1)}
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-cyan-400" />
            <h2 className="text-lg font-semibold text-white">Selected Classes ({selectedClassIds.length})</h2>
          </div>
          <button
            onClick={() => {
              const filteredIds = filteredClasses.map(item => item.id);
              const allSelected = filteredIds.every(id => selectedClassIds.includes(id));
              setSelectedClassIds(allSelected ? selectedClassIds.filter(id => !filteredIds.includes(id)) : [...new Set([...selectedClassIds, ...filteredIds])]);
            }}
            className="text-[10px] font-mono uppercase tracking-wider text-cyan-400"
          >
            Select Filtered
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto rounded-xl border border-[#1e2d47] bg-[#0a0e17] p-2 space-y-1">
          {filteredClasses.map(item => {
            const checked = selectedClassIds.includes(item.id);
            return (
              <div
                key={item.id}
                onClick={() => toggleClass(item.id)}
                className={checked
                  ? 'flex cursor-pointer items-center gap-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3'
                  : 'flex cursor-pointer items-center gap-3 rounded-lg border border-[#243550] bg-[#141c2e] p-3'}
              >
                {checked ? <CheckSquare size={18} className="text-cyan-400" /> : <Square size={18} className="text-slate-500" />}
                <div>
                  <div className="text-sm font-semibold text-white">{item.name}</div>
                  <div className="text-[10px] font-mono text-slate-500 uppercase">{item.dept_name} • Year {item.year}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <button
            onClick={handleGenerate}
            disabled={isGenerating || isUnallocating || selectedClassIds.length === 0}
            className={isGenerating || isUnallocating || selectedClassIds.length === 0
              ? 'w-full cursor-not-allowed rounded-lg bg-slate-700 px-4 py-3 text-sm font-medium text-slate-400'
              : 'w-full rounded-lg bg-cyan-600 px-4 py-3 text-sm font-medium text-white hover:bg-cyan-500'}
          >
            <span className="inline-flex items-center gap-2">
              {isGenerating ? <LoaderCircle size={16} className="animate-spin" /> : <Plus size={16} />}
              {isGenerating ? 'Generating EDC Timetable...' : 'Generate EDC Timetable'}
            </span>
          </button>

          <button
            onClick={handleUnallocate}
            disabled={isGenerating || isUnallocating}
            className={isGenerating || isUnallocating
              ? 'w-full cursor-not-allowed rounded-lg bg-slate-700 px-4 py-3 text-sm font-medium text-slate-400'
              : 'w-full rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300 hover:bg-red-500/15'}
          >
            <span className="inline-flex items-center gap-2">
              {isUnallocating ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} />}
              {isUnallocating
                ? 'Unallocating EDC...'
                : selectedClassIds.length > 0
                  ? 'Unallocate EDC From Selected Classes'
                  : 'Unallocate EDC From All Assigned Classes'}
            </span>
          </button>
        </div>

        {status && (
          <div className={status.type === 'success'
            ? 'rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300'
            : 'rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300'}>
            {status.msg}
          </div>
        )}
      </section>
    </div>
  );
}
