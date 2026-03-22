import { useEffect, useMemo, useState } from 'react';
import { BookOpen, Plus, Users, X } from 'lucide-react';
import { Class, Staff, Subject } from '../types';
import { emitDataInvalidation } from '../utils/dataInvalidation';

type SubjectForm = {
  name: string;
  code: string;
  type: 'core' | 'common' | 'lab';
  is_addon: boolean;
};

export default function CommonSubjects() {
  const [allClasses, setAllClasses] = useState<Class[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [allStaff, setAllStaff] = useState<Staff[]>([]);

  const [selectedClassIds, setSelectedClassIds] = useState<number[]>([]);
  const [subjectInput, setSubjectInput] = useState('');
  const [staffInput, setStaffInput] = useState('');
  const [hoursPerWeek, setHoursPerWeek] = useState(4);
  const [isLabRequired, setIsLabRequired] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSubject, setNewSubject] = useState<SubjectForm>({
    name: '',
    code: '',
    type: 'common',
    is_addon: false
  });

  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const refreshData = () => {
    fetch('/api/classes').then(res => res.json()).then(setAllClasses);
    fetch('/api/subjects').then(res => res.json()).then(setAllSubjects);
    fetch('/api/staff').then(res => res.json()).then(setAllStaff);
  };

  useEffect(() => {
    refreshData();
  }, []);

  const subjectSuggestions = useMemo(
    () => allSubjects.map(subject => `${subject.code} - ${subject.name}`),
    [allSubjects]
  );

  const staffSuggestions = useMemo(
    () => allStaff.map(staff => staff.name),
    [allStaff]
  );

  const selectedClasses = useMemo(
    () => allClasses.filter(cls => selectedClassIds.includes(cls.id)),
    [allClasses, selectedClassIds]
  );

  const resolveSubjectId = (value: string): number | null => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;

    const exactLabel = allSubjects.find(
      s => `${s.code} - ${s.name}`.toLowerCase() === normalized
    );
    if (exactLabel) return exactLabel.id;

    const exactCode = allSubjects.find(s => s.code.toLowerCase() === normalized);
    if (exactCode) return exactCode.id;

    const exactName = allSubjects.find(s => s.name.toLowerCase() === normalized);
    if (exactName) return exactName.id;

    return null;
  };

  const resolveStaffId = (value: string): number | null => {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;

    const exactName = allStaff.find(s => s.name.toLowerCase() === normalized);
    return exactName ? exactName.id : null;
  };

  const toggleClassSelection = (classId: number) => {
    setSelectedClassIds(prev =>
      prev.includes(classId) ? prev.filter(id => id !== classId) : [...prev, classId]
    );
  };

  const selectAllClasses = () => {
    setSelectedClassIds(allClasses.map(cls => cls.id));
  };

  const clearSelectedClasses = () => {
    setSelectedClassIds([]);
  };

  const assignSubjectToSelectedClasses = async (subjectId: number, assignedStaffId: number | null) => {
    const requests = selectedClassIds.map(classId =>
      fetch(`/api/classes/${classId}/subjects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject_id: subjectId,
          staff_id: assignedStaffId,
          hours_per_week: hoursPerWeek,
          is_lab_required: isLabRequired
        })
      })
    );

    const results = await Promise.all(requests);
    const hasFailure = results.some(res => !res.ok);

    if (hasFailure) {
      setStatus({ type: 'error', msg: 'Some class assignments failed. Please retry.' });
      return;
    }

    emitDataInvalidation(['staff_workload', 'classes'], 'CommonSubjects.assignSubjectToSelectedClasses');
    setStatus({ type: 'success', msg: `Assigned to ${selectedClassIds.length} class(es).` });
  };

  const handleAssign = async () => {
    setStatus(null);

    if (selectedClassIds.length === 0) {
      setStatus({ type: 'error', msg: 'Select at least one class.' });
      return;
    }

    const subjectId = resolveSubjectId(subjectInput);
    if (!subjectId) {
      setStatus({ type: 'error', msg: 'Choose a valid subject from suggestions.' });
      return;
    }

    const assignedStaffId = resolveStaffId(staffInput);
    await assignSubjectToSelectedClasses(subjectId, assignedStaffId);
  };

  const handleCreateSubjectOnly = async () => {
    setStatus(null);

    const createRes = await fetch('/api/subjects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newSubject.name,
        code: newSubject.code,
        type: newSubject.type,
        dept_id: null,
        is_addon: newSubject.is_addon
      })
    });

    const createData = await createRes.json();

    if (!createRes.ok) {
      setStatus({ type: 'error', msg: createData.error || 'Unable to create subject.' });
      return;
    }

    setShowCreateModal(false);
    setNewSubject({ name: '', code: '', type: 'common', is_addon: false });
    setStatus({ type: 'success', msg: 'Subject created successfully. Now enter/select it in the subject box and assign manually.' });
    refreshData();
  };

  return (
    <div className="space-y-8">
      <header className="border-b border-[#1e2d47] pb-6">
        <h1 className="text-4xl font-mono font-bold text-white tracking-tighter uppercase">Common Subject Assignment</h1>
        <p className="text-slate-500 mt-2">Select one or more classes and assign common subjects directly from this page.</p>
      </header>

      <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Users size={18} className="text-cyan-400" />
            <h2 className="text-lg font-semibold text-white">Selected Classes ({selectedClassIds.length})</h2>
          </div>
          <div className="flex gap-2">
            <button
              onClick={selectAllClasses}
              className="px-3 py-2 rounded-md border border-[#2a3a57] text-sm text-slate-200 hover:bg-[#141c2e]"
            >
              Select All
            </button>
            <button
              onClick={clearSelectedClasses}
              className="px-3 py-2 rounded-md border border-[#2a3a57] text-sm text-slate-200 hover:bg-[#141c2e]"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {allClasses.map(cls => {
            const checked = selectedClassIds.includes(cls.id);
            return (
              <label
                key={cls.id}
                className={
                  checked
                    ? 'rounded-lg border border-cyan-500/40 bg-cyan-500/10 p-3 cursor-pointer'
                    : 'rounded-lg border border-[#243550] bg-[#141c2e] p-3 cursor-pointer'
                }
              >
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleClassSelection(cls.id)}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-sm font-semibold text-white">{cls.name}</div>
                    <div className="text-xs text-slate-400">Year {cls.year} • {cls.dept_name}</div>
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        {selectedClasses.length > 0 && (
          <div className="text-xs text-slate-400">
            {selectedClasses.map(cls => cls.name).join(', ')}
          </div>
        )}
      </section>

      <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <BookOpen size={18} className="text-emerald-400" />
            <h2 className="text-lg font-semibold text-white">Assign Subject to Selected Classes</h2>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[#2a3a57] text-sm text-slate-200 hover:bg-[#141c2e]"
          >
            <Plus size={14} />
            Create New Subject
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-5">
            <label className="text-xs text-slate-400">Subject</label>
            <input
              list="common-subject-suggestions"
              value={subjectInput}
              onChange={e => setSubjectInput(e.target.value)}
              placeholder="Type subject code or name"
              className="w-full mt-1 px-3 py-2 rounded-md border border-[#2a3a57] bg-[#0a0e17] text-sm"
            />
            <datalist id="common-subject-suggestions">
              {subjectSuggestions.map(value => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </div>

          <div className="md:col-span-3">
            <label className="text-xs text-slate-400">Assign Staff</label>
            <input
              list="common-staff-suggestions"
              value={staffInput}
              onChange={e => setStaffInput(e.target.value)}
              placeholder="Optional"
              className="w-full mt-1 px-3 py-2 rounded-md border border-[#2a3a57] bg-[#0a0e17] text-sm"
            />
            <datalist id="common-staff-suggestions">
              {staffSuggestions.map(value => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </div>

          <div className="md:col-span-2">
            <label className="text-xs text-slate-400">Hours / Week</label>
            <input
              type="number"
              min="1"
              value={hoursPerWeek}
              onChange={e => setHoursPerWeek(parseInt(e.target.value, 10) || 1)}
              className="w-full mt-1 px-3 py-2 rounded-md border border-[#2a3a57] bg-[#0a0e17] text-sm"
            />
          </div>

          <div className="md:col-span-2 flex items-center gap-2">
            <label className="inline-flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={isLabRequired}
                onChange={e => setIsLabRequired(e.target.checked)}
              />
              Lab
            </label>
            <button
              onClick={handleAssign}
              className="ml-auto px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
            >
              Assign
            </button>
          </div>
        </div>

        {status && (
          <div
            className={
              status.type === 'success'
                ? 'rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300'
                : 'rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300'
            }
          >
            {status.msg}
          </div>
        )}
      </section>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl border border-[#2a3a57] bg-[#0f1623] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Create New Subject</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400">Subject Name</label>
                <input
                  value={newSubject.name}
                  onChange={e => setNewSubject({ ...newSubject, name: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-[#2a3a57] bg-[#0a0e17] text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Subject Code</label>
                <input
                  value={newSubject.code}
                  onChange={e => setNewSubject({ ...newSubject, code: e.target.value })}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-[#2a3a57] bg-[#0a0e17] text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Type</label>
                <select
                  value={newSubject.type}
                  onChange={e => setNewSubject({ ...newSubject, type: e.target.value as SubjectForm['type'] })}
                  className="w-full mt-1 px-3 py-2 rounded-md border border-[#2a3a57] bg-[#0a0e17] text-sm"
                >
                  <option value="common">Common</option>
                  <option value="core">Core</option>
                  <option value="lab">Lab</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={newSubject.is_addon}
                    onChange={e => setNewSubject({ ...newSubject, is_addon: e.target.checked })}
                  />
                  Add-on Subject
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-md border border-[#2a3a57] text-sm text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateSubjectOnly}
                className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-sm text-white"
              >
                Create Subject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
