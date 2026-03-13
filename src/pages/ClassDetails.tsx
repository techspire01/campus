import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, FlaskConical, Plus, X, Lock, Send } from 'lucide-react';
import { clsx } from 'clsx';
import { Class, ClassSubject, LabRequirement, Settings, Staff, Subject, TimetableSlot } from '../types';

type CreateSubjectForm = {
  name: string;
  code: string;
  type: 'core' | 'common' | 'lab';
  staff_input: string;
  hours_per_week: number;
  is_lab_required: boolean;
};

type EditSubjectForm = {
  staff_input: string;
  hours_per_week: number;
  is_lab_required: boolean;
};

export default function ClassDetails() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [cls, setCls] = useState<Class | null>(null);
  const [classSubjects, setClassSubjects] = useState<ClassSubject[]>([]);
  const [allSubjects, setAllSubjects] = useState<Subject[]>([]);
  const [allStaff, setAllStaff] = useState<Staff[]>([]);
  const [timetable, setTimetable] = useState<TimetableSlot[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);

  const [subjectInput, setSubjectInput] = useState('');
  const [staffInput, setStaffInput] = useState('');
  const [newCS, setNewCS] = useState({ hours_per_week: 4, is_lab_required: false });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createSubjectForm, setCreateSubjectForm] = useState<CreateSubjectForm>({
    name: '',
    code: '',
    type: 'core',
    staff_input: '',
    hours_per_week: 4,
    is_lab_required: false
  });

  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditSubjectForm>({
    staff_input: '',
    hours_per_week: 4,
    is_lab_required: false
  });
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Lab requirement request state
  const [labReqs, setLabReqs] = useState<LabRequirement[]>([]);
  const [showLabReqModal, setShowLabReqModal] = useState(false);
  const [labReqSubjectId, setLabReqSubjectId] = useState<number | null>(null);
  const [labReqSubjectName, setLabReqSubjectName] = useState('');
  const [labReqForm, setLabReqForm] = useState({ requirements: '' });
  const [labReqLoading, setLabReqLoading] = useState(false);
  const [deletingLabReqId, setDeletingLabReqId] = useState<number | null>(null);

  const refreshData = () => {
    fetch('/api/classes').then(res => res.json()).then(data => {
      setCls(data.find((x: Class) => x.id === parseInt(id || '0', 10)) || null);
    });
    fetch(`/api/classes/${id}/subjects`).then(res => res.json()).then(setClassSubjects);
    fetch('/api/subjects').then(res => res.json()).then(setAllSubjects);
    fetch('/api/staff').then(res => res.json()).then(setAllStaff);
    fetch(`/api/timetable/${id}`).then(res => res.json()).then(setTimetable);
    fetch('/api/settings').then(res => res.json()).then(setSettings);
    fetch(`/api/lab-requirements?class_id=${id}`).then(res => res.json()).then(setLabReqs);
  };

  useEffect(() => {
    refreshData();
  }, [id]);

  const subjectSuggestionValues = useMemo(
    () => allSubjects.map(subject => `${subject.code} - ${subject.name}`),
    [allSubjects]
  );

  const staffSuggestionValues = useMemo(
    () => allStaff.map(staff => staff.name),
    [allStaff]
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

  const handleAddSubject = async () => {
    if (!id) return;
    setStatus(null);

    const subjectId = resolveSubjectId(subjectInput);
    if (!subjectId) {
      setStatus({ type: 'error', msg: 'Select a valid subject from suggestions.' });
      return;
    }

    const staffId = resolveStaffId(staffInput);
    if (staffInput.trim() && staffId === null) {
      setStatus({ type: 'error', msg: 'Select a valid staff member from suggestions.' });
      return;
    }

    const res = await fetch(`/api/classes/${id}/subjects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject_id: subjectId,
        staff_id: staffId,
        hours_per_week: newCS.hours_per_week,
        is_lab_required: newCS.is_lab_required
      })
    });

    if (res.ok) {
      setSubjectInput('');
      setStaffInput('');
      setNewCS({ hours_per_week: 4, is_lab_required: false });
      refreshData();
      setStatus({ type: 'success', msg: 'Subject assigned successfully.' });
    } else {
      const err = await res.json();
      setStatus({ type: 'error', msg: err.error || 'Unable to assign subject.' });
    }
  };

  const handleCreateAndAssign = async () => {
    if (!id || !cls) return;
    setStatus(null);

    const staffId = resolveStaffId(createSubjectForm.staff_input);
    if (createSubjectForm.staff_input.trim() && staffId === null) {
      setStatus({ type: 'error', msg: 'Select a valid staff member from suggestions.' });
      return;
    }

    const res = await fetch('/api/subjects-and-assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: createSubjectForm.name,
        code: createSubjectForm.code,
        type: createSubjectForm.type,
        dept_id: cls.dept_id,
        class_id: parseInt(id, 10),
        staff_id: staffId,
        hours_per_week: createSubjectForm.hours_per_week,
        is_lab_required: createSubjectForm.is_lab_required
      })
    });

    if (res.ok) {
      setShowCreateModal(false);
      setCreateSubjectForm({
        name: '',
        code: '',
        type: 'core',
        staff_input: '',
        hours_per_week: 4,
        is_lab_required: false
      });
      refreshData();
      setStatus({ type: 'success', msg: 'Subject created and assigned successfully.' });
    } else {
      const err = await res.json();
      setStatus({ type: 'error', msg: err.error || 'Unable to create subject.' });
    }
  };

  const handleAssignSlot = async (
    day: number,
    period: number,
    subjectId: number | null,
    assignedStaffId: number | null,
    type: string | null
  ) => {
    if (!id) return;

    const res = await fetch('/api/timetable/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        class_id: parseInt(id, 10),
        day_order: day,
        period,
        subject_id: subjectId,
        staff_id: assignedStaffId,
        lab_id: null,
        type,
        is_locked: false
      })
    });

    if (res.ok) {
      fetch(`/api/timetable/${id}`).then(response => response.json()).then(setTimetable);
    } else {
      const err = await res.json();
      alert(err.error || 'Unable to assign slot.');
    }
  };

  const startEditing = (cs: ClassSubject) => {
    setEditingSubjectId(cs.id);
    setEditForm({
      staff_input: cs.staff_name || '',
      hours_per_week: cs.hours_per_week,
      is_lab_required: cs.is_lab_required
    });
  };

  const handleSaveSubjectEdit = async (classSubjectId: number) => {
    if (!id) return;
    setStatus(null);

    const staffId = resolveStaffId(editForm.staff_input);
    if (editForm.staff_input.trim() && staffId === null) {
      setStatus({ type: 'error', msg: 'Select a valid staff member from suggestions before saving.' });
      return;
    }

    const res = await fetch(`/api/classes/${id}/subjects/${classSubjectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staff_id: staffId,
        hours_per_week: editForm.hours_per_week,
        is_lab_required: editForm.is_lab_required
      })
    });

    if (res.ok) {
      setEditingSubjectId(null);
      refreshData();
      setStatus({ type: 'success', msg: 'Subject assignment updated successfully.' });
    } else {
      const err = await res.json();
      setStatus({ type: 'error', msg: err.error || 'Unable to save subject assignment.' });
    }
  };

  const handleUnassignStaff = async (classSubjectId: number) => {
    if (!id) return;
    setStatus(null);

    const cs = classSubjects.find(x => x.id === classSubjectId);
    if (!cs) return;

    const res = await fetch(`/api/classes/${id}/subjects/${classSubjectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staff_id: null,
        hours_per_week: cs.hours_per_week,
        is_lab_required: cs.is_lab_required
      })
    });

    if (res.ok) {
      refreshData();
      setStatus({ type: 'success', msg: 'Staff unassigned successfully.' });
    } else {
      const err = await res.json();
      setStatus({ type: 'error', msg: err.error || 'Unable to unassign staff.' });
    }
  };

  const handleUnassignSubject = async (classSubjectId: number) => {
    if (!id) return;
    setStatus(null);

    const shouldDelete = window.confirm('Unassign this subject from this class?');
    if (!shouldDelete) return;

    const res = await fetch(`/api/classes/${id}/subjects/${classSubjectId}`, {
      method: 'DELETE'
    });

    if (res.ok) {
      setEditingSubjectId(null);
      refreshData();
      setStatus({ type: 'success', msg: 'Subject unassigned successfully.' });
    } else {
      const err = await res.json();
      setStatus({ type: 'error', msg: err.error || 'Unable to unassign subject.' });
    }
  };

  const handleOpenLabReqModal = (cs: ClassSubject) => {
    setLabReqSubjectId(cs.subject_id);
    setLabReqSubjectName(cs.subject_name);
    setLabReqForm({ requirements: '' });
    setShowLabReqModal(true);
  };

  const handleSubmitLabReq = async () => {
    if (!id || !labReqSubjectId) return;
    setLabReqLoading(true);
    setStatus(null);
    const res = await fetch('/api/lab-requirements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        class_id: parseInt(id, 10),
        subject_id: labReqSubjectId,
        requirements: labReqForm.requirements || null
      })
    });
    setLabReqLoading(false);
    if (res.ok) {
      setShowLabReqModal(false);
      refreshData();
      setStatus({ type: 'success', msg: 'Lab request submitted to lab management.' });
    } else {
      const err = await res.json();
      setStatus({ type: 'error', msg: err.error || 'Failed to submit lab request.' });
    }
  };

  const handleDeleteLabReq = async (reqId: number) => {
    if (!window.confirm('Cancel this lab request?')) return;
    setDeletingLabReqId(reqId);
    setStatus(null);
    const res = await fetch(`/api/lab-requirements/${reqId}`, { method: 'DELETE' });
    setDeletingLabReqId(null);
    if (res.ok) {
      refreshData();
      setStatus({ type: 'success', msg: 'Lab request cancelled.' });
    } else {
      const err = await res.json();
      setStatus({ type: 'error', msg: err.error || 'Failed to cancel lab request.' });
    }
  };

  // Lab subjects from classSubjects with their request status
  const labSubjects = useMemo(() => {
    return classSubjects
      .filter(cs => cs.is_lab_required)
      .map(cs => ({
        ...cs,
        labReq: labReqs.find(r => r.subject_id === cs.subject_id) ?? null
      }));
  }, [classSubjects, labReqs]);

  if (!cls || !settings) {
    return <div className="text-slate-300">Loading class details...</div>;
  }

  const periods = Array.from({ length: parseInt(settings.periods_per_day, 10) }, (_, i) => i + 1);
  const days = [1, 2, 3, 4, 5, 6];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft size={14} />
        Back to Classes
      </button>

      <header>
        <h1 className="text-3xl font-bold text-white">Class Subject Management</h1>
        <p className="text-sm text-slate-400 mt-1">
          {cls.name} - Year {cls.year} - {cls.dept_name || 'Department'}
        </p>
      </header>

      <section className="rounded-xl border border-[#1e2d47] bg-[#0f1623] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Assign Subject</h2>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[#2a3a57] text-sm text-slate-200 hover:bg-[#141c2e]"
          >
            <Plus size={14} />
            Create Subject
          </button>
        </div>

        {status && (
          <div className={
            status.type === 'success'
              ? 'rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300'
              : 'rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300'
          }>
            {status.msg}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-4">
            <label className="text-xs text-slate-400">Subject</label>
            <input
              list="subject-suggestions"
              placeholder="Type subject code or name"
              className="w-full mt-1 px-3 py-2 rounded-md border border-[#2a3a57] bg-[#0a0e17] text-sm"
              value={subjectInput}
              onChange={e => setSubjectInput(e.target.value)}
            />
            <datalist id="subject-suggestions">
              {subjectSuggestionValues.map(value => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </div>

          <div className="lg:col-span-3">
            <label className="text-xs text-slate-400">Assign Staff</label>
            <input
              list="staff-suggestions"
              placeholder="Type staff name or leave empty"
              className="w-full mt-1 px-3 py-2 rounded-md border border-[#2a3a57] bg-[#0a0e17] text-sm"
              value={staffInput}
              onChange={e => setStaffInput(e.target.value)}
            />
            <datalist id="staff-suggestions">
              {staffSuggestionValues.map(value => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </div>

          <div className="lg:col-span-2">
            <label className="text-xs text-slate-400">Hours / Week</label>
            <input
              type="number"
              min="1"
              className="w-full mt-1 px-3 py-2 rounded-md border border-[#2a3a57] bg-[#0a0e17] text-sm"
              value={newCS.hours_per_week}
              onChange={e => setNewCS({ ...newCS, hours_per_week: parseInt(e.target.value, 10) || 1 })}
            />
          </div>

          <div className="lg:col-span-3 flex gap-2 items-center">
            <label className="inline-flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={newCS.is_lab_required}
                onChange={e => setNewCS({ ...newCS, is_lab_required: e.target.checked })}
              />
              Lab
            </label>
            <button
              onClick={handleAddSubject}
              className="ml-auto px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium"
            >
              Assign
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-[#1e2d47] bg-[#0f1623] p-5">
        <h2 className="text-lg font-semibold text-white mb-4">Assigned Subjects ({classSubjects.length})</h2>
        <div className="space-y-2">
          {classSubjects.map(cs => (
            <div key={cs.id} className="rounded-lg border border-[#243550] bg-[#141c2e] p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{cs.subject_code} {cs.subject_name}</p>
                  <p className="text-xs text-slate-400">
                    {cs.hours_per_week}h/week - {cs.staff_name || 'Unassigned'}
                  </p>
                </div>
                <span className="text-xs px-2 py-1 rounded bg-[#223451] text-slate-200">
                  {cs.staff_id ? 'Assigned' : 'Unassigned'}
                </span>
              </div>

              {editingSubjectId === cs.id ? (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mt-3">
                  <input
                    list="staff-suggestions"
                    className="md:col-span-2 px-3 py-2 rounded-md border border-[#2a3a57] bg-[#0a0e17] text-sm"
                    value={editForm.staff_input}
                    onChange={e => setEditForm({ ...editForm, staff_input: e.target.value })}
                    placeholder="Assign staff"
                  />
                  <input
                    type="number"
                    min="1"
                    className="px-3 py-2 rounded-md border border-[#2a3a57] bg-[#0a0e17] text-sm"
                    value={editForm.hours_per_week}
                    onChange={e => setEditForm({ ...editForm, hours_per_week: parseInt(e.target.value, 10) || 1 })}
                  />
                  <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={editForm.is_lab_required}
                      onChange={e => setEditForm({ ...editForm, is_lab_required: e.target.checked })}
                    />
                    Lab
                  </label>
                  <div className="md:col-span-4 flex gap-2 justify-end">
                    <button
                      onClick={() => setEditingSubjectId(null)}
                      className="px-3 py-1.5 rounded border border-[#2a3a57] text-xs text-slate-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => handleSaveSubjectEdit(cs.id)}
                      className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-xs"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => handleUnassignStaff(cs.id)}
                      className="px-3 py-1.5 rounded border border-[#2a3a57] text-xs text-slate-200"
                    >
                      Unassign Staff
                    </button>
                    <button
                      onClick={() => handleUnassignSubject(cs.id)}
                      className="px-3 py-1.5 rounded bg-red-600 hover:bg-red-700 text-white text-xs"
                    >
                      Unassign Subject
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end mt-3">
                  <button
                    onClick={() => startEditing(cs)}
                    className="px-3 py-1.5 rounded border border-[#2a3a57] text-xs text-slate-200 hover:bg-[#0a0e17]"
                  >
                    Edit Assignment
                  </button>
                </div>
              )}
            </div>
          ))}

          {classSubjects.length === 0 && (
            <p className="text-sm text-slate-400">No subjects assigned yet.</p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-[#1e2d47] bg-[#0f1623] p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FlaskConical size={18} className="text-cyan-400" />
            <h2 className="text-lg font-semibold text-white">Lab Requirements</h2>
          </div>
        </div>

        {labSubjects.length === 0 && (
          <p className="text-sm text-slate-400">No lab subjects assigned to this class.</p>
        )}

        <div className="space-y-3">
          {labSubjects.map(cs => {
            const req = cs.labReq;
            return (
              <div
                key={cs.id}
                className={clsx(
                  'rounded-lg border p-4',
                  req?.status === 'assigned'
                    ? 'border-emerald-500/25 bg-emerald-500/5'
                    : req?.status === 'pending'
                    ? 'border-amber-500/25 bg-amber-500/5'
                    : 'border-[#243550] bg-[#141c2e]'
                )}
              >
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3">
                    <FlaskConical
                      size={17}
                      className={clsx(
                        'mt-0.5',
                        req?.status === 'assigned' ? 'text-emerald-400' : req?.status === 'pending' ? 'text-amber-400' : 'text-cyan-400'
                      )}
                    />
                    <div>
                      <p className="text-sm font-semibold text-white">{cs.subject_name} <span className="text-slate-500 font-normal">({cs.subject_code})</span></p>
                      {req && (
                        <p className="text-xs text-slate-400 mt-0.5">
                          {cs.hours_per_week}h/week
                          {req.requirements && <span className="ml-2 italic text-slate-500">· {req.requirements}</span>}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {req?.status === 'assigned' && (
                      <>
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/20">
                          <Lock size={11} className="text-emerald-400" />
                          <span className="text-xs font-mono font-bold text-emerald-300">{req.lab_name}</span>
                        </div>
                        <span className="text-xs px-2 py-1 rounded bg-emerald-700/20 text-emerald-300">Assigned</span>
                        <button
                          onClick={() => handleDeleteLabReq(req.id)}
                          disabled={deletingLabReqId === req.id}
                          className="text-xs px-2 py-1 rounded border border-red-500/20 text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                        >
                          {deletingLabReqId === req.id ? '…' : 'Release'}
                        </button>
                      </>
                    )}
                    {req?.status === 'pending' && (
                      <>
                        <span className="text-xs px-2 py-1 rounded bg-amber-700/20 text-amber-300">Pending Assignment</span>
                        <button
                          onClick={() => handleDeleteLabReq(req.id)}
                          disabled={deletingLabReqId === req.id}
                          className="text-xs px-2 py-1 rounded border border-[#2a3a57] text-slate-400 hover:text-white disabled:opacity-50 transition-colors"
                        >
                          {deletingLabReqId === req.id ? '…' : 'Cancel'}
                        </button>
                      </>
                    )}
                    {!req && (
                      <button
                        onClick={() => handleOpenLabReqModal(cs)}
                        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-medium transition-colors"
                      >
                        <Send size={11} /> Request Lab
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-[#1e2d47] bg-[#0f1623] p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={18} className="text-cyan-400" />
          <h2 className="text-lg font-semibold text-white">Weekly Timetable</h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="p-2 text-left text-xs text-slate-400 border-b border-[#243550]">Day</th>
                {periods.map(period => (
                  <th key={period} className="p-2 text-center text-xs text-slate-400 border-b border-[#243550]">
                    P{period}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map(day => (
                <tr key={day}>
                  <td className="p-2 text-sm font-medium text-slate-200 border-b border-[#243550]">Day {day}</td>
                  {periods.map(period => {
                    const slot = timetable.find(s => s.day_order === day && s.period === period);

                    return (
                      <td key={period} className="p-2 border-b border-[#243550]">
                        <div className={clsx(
                          'min-h-[72px] rounded border p-2',
                          slot ? 'border-[#2d4b6d] bg-[#122034]' : 'border-dashed border-[#2a3a57] bg-[#0a0e17]'
                        )}>
                          {slot ? (
                            <div className="space-y-1">
                              <div className="text-xs font-semibold text-white">{slot.subject_code || slot.type || 'Slot'}</div>
                              <div className="text-[11px] text-slate-400">{slot.staff_name || 'No staff'}</div>
                              {slot.lab_name && <div className="text-[11px] text-cyan-400">{slot.lab_name}</div>}
                            </div>
                          ) : (
                            <select
                              className="w-full text-xs bg-transparent text-slate-300 outline-none"
                              onChange={e => {
                                if (!e.target.value) return;
                                const cs = classSubjects.find(x => x.id === parseInt(e.target.value, 10));
                                if (cs) {
                                  handleAssignSlot(day, period, cs.subject_id, cs.staff_id, cs.is_lab_required ? 'lab' : 'core');
                                }
                              }}
                              value=""
                            >
                              <option value="">Assign</option>
                              {classSubjects.map(cs => (
                                <option key={cs.id} value={cs.id}>
                                  {cs.subject_code}
                                </option>
                              ))}
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

      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl border border-[#2a3a57] bg-[#0f1623] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Create Subject</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400">Subject Name</label>
                <input
                  className="w-full mt-1 px-3 py-2 rounded-md border border-[#2a3a57] bg-[#0a0e17] text-sm"
                  value={createSubjectForm.name}
                  onChange={e => setCreateSubjectForm({ ...createSubjectForm, name: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Subject Code</label>
                <input
                  className="w-full mt-1 px-3 py-2 rounded-md border border-[#2a3a57] bg-[#0a0e17] text-sm"
                  value={createSubjectForm.code}
                  onChange={e => setCreateSubjectForm({ ...createSubjectForm, code: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Type</label>
                <select
                  className="w-full mt-1 px-3 py-2 rounded-md border border-[#2a3a57] bg-[#0a0e17] text-sm"
                  value={createSubjectForm.type}
                  onChange={e => setCreateSubjectForm({ ...createSubjectForm, type: e.target.value as CreateSubjectForm['type'] })}
                >
                  <option value="core">Core</option>
                  <option value="common">Common</option>
                  <option value="lab">Lab</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400">Assign Staff</label>
                <input
                  list="staff-suggestions"
                  className="w-full mt-1 px-3 py-2 rounded-md border border-[#2a3a57] bg-[#0a0e17] text-sm"
                  value={createSubjectForm.staff_input}
                  onChange={e => setCreateSubjectForm({ ...createSubjectForm, staff_input: e.target.value })}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400">Hours / Week</label>
                <input
                  type="number"
                  min="1"
                  className="w-full mt-1 px-3 py-2 rounded-md border border-[#2a3a57] bg-[#0a0e17] text-sm"
                  value={createSubjectForm.hours_per_week}
                  onChange={e => setCreateSubjectForm({ ...createSubjectForm, hours_per_week: parseInt(e.target.value, 10) || 1 })}
                />
              </div>
              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={createSubjectForm.is_lab_required}
                    onChange={e => setCreateSubjectForm({ ...createSubjectForm, is_lab_required: e.target.checked })}
                  />
                  Lab Required
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
                onClick={handleCreateAndAssign}
                className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-sm text-white"
              >
                Create & Assign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Lab Modal */}
      {showLabReqModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl border border-[#2a3a57] bg-[#0f1623] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Request Lab Assignment</h3>
                <p className="text-xs text-slate-400 mt-0.5">{labReqSubjectName}</p>
              </div>
              <button onClick={() => setShowLabReqModal(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <p className="text-xs text-slate-500 rounded-lg bg-cyan-500/5 border border-cyan-500/10 px-3 py-2">
              This request will appear in <strong className="text-slate-300">Lab Management → Lab Requests</strong> where an admin can assign a physical lab.
              Once assigned, the lab cannot be changed without deleting this request.
            </p>
            <div>
              <label className="text-xs text-slate-400">Special Requirements <span className="text-slate-600">(optional)</span></label>
              <textarea
                rows={2}
                placeholder="e.g. requires 60 systems, projector needed..."
                className="w-full mt-1 px-3 py-2 rounded-md border border-[#2a3a57] bg-[#0a0e17] text-sm resize-none"
                value={labReqForm.requirements}
                onChange={e => setLabReqForm(f => ({ ...f, requirements: e.target.value }))}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowLabReqModal(false)}
                className="px-4 py-2 rounded-md border border-[#2a3a57] text-sm text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitLabReq}
                disabled={labReqLoading}
                className="px-4 py-2 rounded-md bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-sm text-white flex items-center gap-2"
              >
                {labReqLoading ? 'Submitting…' : <><Send size={14} /> Submit Request</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
