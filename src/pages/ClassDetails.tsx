import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, FlaskConical, LoaderCircle, Plus, X, Lock, Send } from 'lucide-react';
import { clsx } from 'clsx';
import { Class, ClassSubject, LabRequirement, Settings, Staff, Subject, TimetableSlot } from '../types';
import { emitDataInvalidation } from '../utils/dataInvalidation';

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
  const [isGeneratingTimetable, setIsGeneratingTimetable] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Lab requirement request state
  const [labReqs, setLabReqs] = useState<LabRequirement[]>([]);
  const [showLabReqModal, setShowLabReqModal] = useState(false);
  const [labReqSubjectId, setLabReqSubjectId] = useState<number | null>(null);
  const [labReqSubjectName, setLabReqSubjectName] = useState('');
  const [labReqForm, setLabReqForm] = useState({ requirements: '' });
  const [labReqLoading, setLabReqLoading] = useState(false);
  const [deletingLabReqId, setDeletingLabReqId] = useState<number | null>(null);
  const [isEditingTimetable, setIsEditingTimetable] = useState(false);
  const [isFixingTimetable, setIsFixingTimetable] = useState(false);
  const [draftTimetable, setDraftTimetable] = useState<TimetableSlot[]>([]);
  const [draggingSlot, setDraggingSlot] = useState<TimetableSlot | null>(null);
  const [staffTimetableCache, setStaffTimetableCache] = useState<Record<number, TimetableSlot[]>>({});

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

  useEffect(() => {
    if (!isEditingTimetable) return;
    setDraftTimetable(timetable.filter(slot => slot.type !== 'placement'));
  }, [isEditingTimetable, timetable]);

  useEffect(() => {
    if (!isEditingTimetable) return;

    const allowedSubjectIds = new Set(classSubjects.map(subject => Number(subject.subject_id)));
    const subjectMeta = new Map<number, { staff_id: number | null; staff_name?: string; type: string }>(
      classSubjects.map(subject => [
        Number(subject.subject_id),
        {
          staff_id: subject.staff_id ?? null,
          staff_name: subject.staff_name || undefined,
          type: subject.is_lab_required ? 'lab' : 'core',
        },
      ])
    );

    setDraftTimetable(current =>
      current
        .filter(slot => !slot.subject_id || allowedSubjectIds.has(Number(slot.subject_id)))
        .map(slot => {
          if (!slot.subject_id) return slot;
          const meta = subjectMeta.get(Number(slot.subject_id));
          if (!meta) return slot;
          return {
            ...slot,
            staff_id: meta.staff_id,
            staff_name: meta.staff_name,
            type: meta.type,
          };
        })
    );
  }, [classSubjects, isEditingTimetable]);

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

  const getPendingHoursForStaff = (staffId: number, excludeClassSubjectId?: number) => {
    return classSubjects.reduce((total, subject) => {
      if (subject.id === excludeClassSubjectId) return total;
      if (subject.staff_id !== staffId) return total;
      return total + Number(subject.hours_per_week || 0);
    }, 0);
  };

  const getStaffWorkloadLabel = (staffId: number | null | undefined, pendingHours = 0) => {
    if (!staffId) return null;
    const member = allStaff.find(item => item.id === staffId);
    if (!member) return null;
    const current = Number(member.current_workload || 0);
    return `${current + pendingHours}h / ${member.max_workload}h`;
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
      emitDataInvalidation(['staff_workload', 'classes'], 'ClassDetails.handleAddSubject');
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
      emitDataInvalidation(['staff_workload', 'classes'], 'ClassDetails.handleCreateAndAssign');
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
      emitDataInvalidation(['staff_workload', 'classes'], 'ClassDetails.handleSaveSubjectEdit');
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
      if (isEditingTimetable) {
        setDraftTimetable(current =>
          current.filter(slot => slot.subject_id !== cs.subject_id)
        );
      }
      refreshData();
      emitDataInvalidation(['staff_workload', 'classes'], 'ClassDetails.handleUnassignStaff');
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
      const removedSubject = classSubjects.find(item => item.id === classSubjectId);
      if (isEditingTimetable && removedSubject) {
        setDraftTimetable(current =>
          current.filter(slot => slot.subject_id !== removedSubject.subject_id)
        );
      }
      refreshData();
      emitDataInvalidation(['staff_workload', 'classes', 'timetable'], 'ClassDetails.handleUnassignSubject');
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

  const handleGenerateClassTimetable = async () => {
    if (!id) return;
    setStatus(null);
    setIsGeneratingTimetable(true);

    try {
      const res = await fetch(`/api/classes/${id}/generate-timetable`, {
        method: 'POST',
      });
      const raw = await res.text();
      let data: any = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { error: raw || 'Unable to generate class timetable.' };
      }

      if (!res.ok) {
        const errorMessage = data.error || 'Unable to generate class timetable.';
        setStatus({ type: 'error', msg: errorMessage });
        window.alert(errorMessage);
        return;
      }

      refreshData();
      emitDataInvalidation(['staff_workload', 'timetable', 'classes'], 'ClassDetails.handleGenerateClassTimetable');
      setStatus({ type: 'success', msg: data.message || 'Class timetable generated successfully.' });
    } catch (err: any) {
      const errorMessage = err.message || 'Unable to generate class timetable.';
      setStatus({ type: 'error', msg: errorMessage });
      window.alert(errorMessage);
    } finally {
      setIsGeneratingTimetable(false);
    }
  };

  const isPtSubjectSlot = (slot: Pick<TimetableSlot, 'subject_code' | 'subject_name'>) => {
    const code = String(slot.subject_code || '').trim().toLowerCase();
    const name = String(slot.subject_name || '').trim().toLowerCase();
    return code === 'pt' || code.startsWith('pt ') || name === 'pt' || name.includes('physical education');
  };

  const getStaffTimetable = async (staffId: number) => {
    if (staffTimetableCache[staffId]) {
      return staffTimetableCache[staffId];
    }
    const res = await fetch(`/api/timetable/staff/${staffId}`);
    const data = await res.json();
    const next = Array.isArray(data) ? data : [];
    setStaffTimetableCache(current => ({ ...current, [staffId]: next }));
    return next;
  };

  const handleStartTimetableEdit = () => {
    setStatus(null);
    setDraftTimetable(timetable.filter(slot => slot.type !== 'placement'));
    setDraggingSlot(null);
    setIsEditingTimetable(true);
  };

  const handleCancelTimetableEdit = () => {
    setDraftTimetable([]);
    setDraggingSlot(null);
    setIsEditingTimetable(false);
  };

  const handleRemoveDraftSlot = (day: number, period: number) => {
    setDraftTimetable(current =>
      current.filter(slot => !(slot.day_order === day && slot.period === period))
    );
  };

  const handleFixTimetable = async () => {
    if (!id) return;
    setStatus(null);
    setIsFixingTimetable(true);

    try {
      const res = await fetch(`/api/classes/${id}/fix-timetable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slots: draftTimetable.map(slot => ({
            subject_id: slot.subject_id,
            staff_id: slot.staff_id,
            lab_id: slot.lab_id,
            day_order: slot.day_order,
            period: slot.period,
            type: slot.type,
            is_locked: slot.is_locked,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: 'error', msg: data.error || 'Unable to finalize class timetable.' });
        window.alert(data.error || 'Unable to finalize class timetable.');
        return;
      }
      refreshData();
      emitDataInvalidation(['staff_workload', 'timetable', 'classes'], 'ClassDetails.handleFixTimetable');
      setStatus({ type: 'success', msg: data.message || 'Class timetable updated successfully.' });
      setIsEditingTimetable(false);
      setDraggingSlot(null);
    } catch (err: any) {
      const errorMessage = err.message || 'Unable to finalize class timetable.';
      setStatus({ type: 'error', msg: errorMessage });
      window.alert(errorMessage);
    } finally {
      setIsFixingTimetable(false);
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

  const timetableOnlySubjects = useMemo(() => {
    const bySubjectId = new Map<number, { subject_id: number; subject_code: string; subject_name: string; staff_id: number | null; type: string | null }>();

    for (const slot of timetable) {
      if (!slot.subject_id) continue;
      if (classSubjects.some(subject => subject.subject_id === slot.subject_id)) continue;
      if (!bySubjectId.has(slot.subject_id)) {
        bySubjectId.set(slot.subject_id, {
          subject_id: slot.subject_id,
          subject_code: slot.subject_code || `SUB-${slot.subject_id}`,
          subject_name: slot.subject_name || slot.subject_code || `Subject ${slot.subject_id}`,
          staff_id: slot.staff_id ?? null,
          type: slot.type || 'core',
        });
      }
    }

    return Array.from(bySubjectId.values());
  }, [timetable, classSubjects]);

  if (!cls || !settings) {
    return <div className="text-slate-300">Loading class details...</div>;
  }

  const periods = Array.from({ length: parseInt(settings.periods_per_day, 10) }, (_, i) => i + 1);
  const days = [1, 2, 3, 4, 5, 6];
  const editingStaffId = resolveStaffId(editForm.staff_input);
  const editingStaffWorkload = editingSubjectId && editingStaffId
    ? getStaffWorkloadLabel(
        editingStaffId,
        getPendingHoursForStaff(editingStaffId, editingSubjectId) + Number(editForm.hours_per_week || 0)
      )
    : null;
  const placementSlots = timetable.filter(slot => slot.type === 'placement');
  const activeTimetable = isEditingTimetable ? [...placementSlots, ...draftTimetable] : timetable;
  const isProtectedDepartmentSlot = (slot: Pick<TimetableSlot, 'type' | 'subject_code' | 'subject_name'>) => {
    if (slot.type === 'placement') return true;
    const code = String(slot.subject_code || '').trim().toLowerCase();
    const name = String(slot.subject_name || '').trim().toLowerCase();
    return code === 'tam' || code === 'eng' || code === 'math' || code === 'mat' || name === 'tamil' || name === 'english' || name === 'mathematics';
  };
  const slotSubjectOptions = [
    ...classSubjects.map(cs => ({
      value: String(cs.subject_id),
      label: `${cs.subject_code} - ${cs.subject_name}`,
      subject_id: cs.subject_id,
      staff_id: cs.staff_id ?? null,
      type: cs.is_lab_required ? 'lab' : 'core',
    })),
    ...timetableOnlySubjects
      .filter(subject => !classSubjects.some(cs => cs.subject_id === subject.subject_id))
      .map(subject => ({
        value: String(subject.subject_id),
        label: `${subject.subject_code} - ${subject.subject_name}`,
        subject_id: subject.subject_id,
        staff_id: subject.staff_id,
        type: subject.type || 'core',
      })),
  ];

  return (
    <div className="relative max-w-6xl mx-auto space-y-6">
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
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Clock size={18} className="text-cyan-400" />
            <h2 className="text-lg font-semibold text-white">Weekly Timetable</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isEditingTimetable ? (
              <>
                <button
                  onClick={handleCancelTimetableEdit}
                  disabled={isFixingTimetable}
                  className="rounded-md border border-[#2a3a57] px-4 py-2 text-sm text-slate-200 hover:bg-[#141c2e]"
                >
                  Cancel Edit
                </button>
                <button
                  onClick={handleFixTimetable}
                  disabled={isFixingTimetable}
                  className={clsx(
                    'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                    isFixingTimetable
                      ? 'cursor-not-allowed bg-slate-700 text-slate-400'
                      : 'bg-emerald-600 text-white hover:bg-emerald-500'
                  )}
                >
                  {isFixingTimetable ? 'Fixing...' : 'Fix Timetable'}
                </button>
              </>
            ) : (
              <button
                onClick={handleStartTimetableEdit}
                disabled={timetable.length === 0}
                className={clsx(
                  'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                  timetable.length === 0
                    ? 'cursor-not-allowed bg-slate-700 text-slate-400'
                    : 'bg-[#141c2e] text-white hover:bg-[#1a2740]'
                )}
              >
                Edit Timetable
              </button>
            )}
            <button
              onClick={handleGenerateClassTimetable}
              disabled={isGeneratingTimetable || isEditingTimetable || classSubjects.length === 0}
              className={clsx(
                'rounded-md px-4 py-2 text-sm font-medium transition-colors',
                isGeneratingTimetable || isEditingTimetable || classSubjects.length === 0
                  ? 'cursor-not-allowed bg-slate-700 text-slate-400'
                  : 'bg-cyan-600 text-white hover:bg-cyan-500'
              )}
            >
              {isGeneratingTimetable ? 'Generating...' : 'Generate Timetable'}
            </button>
          </div>
        </div>

        <div className="mb-6 overflow-x-auto rounded-xl border border-[#243550] bg-[#141c2e]">
          <div className="flex items-center justify-between border-b border-[#243550] px-4 py-3">
            <h3 className="text-sm font-semibold text-white">Subject Tabulation</h3>
            <span className="text-xs text-slate-400">{classSubjects.length} assigned subjects</span>
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-[#101a2b]">
                <th className="p-3 text-left text-xs text-slate-400 border-b border-[#243550]">Code</th>
                <th className="p-3 text-left text-xs text-slate-400 border-b border-[#243550]">Subject</th>
                <th className="p-3 text-center text-xs text-slate-400 border-b border-[#243550]">Hours/Week</th>
                <th className="p-3 text-left text-xs text-slate-400 border-b border-[#243550]">Staff</th>
                <th className="p-3 text-center text-xs text-slate-400 border-b border-[#243550]">Type</th>
                <th className="p-3 text-center text-xs text-slate-400 border-b border-[#243550]">Status</th>
                <th className="p-3 text-right text-xs text-slate-400 border-b border-[#243550]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {classSubjects.map(cs => (
                  <tr key={`tabulation-${cs.id}`} className="border-b border-[#243550] last:border-b-0">
                    <td className="p-3 text-sm font-semibold text-cyan-300">{cs.subject_code}</td>
                    <td className="p-3 text-sm text-white">{cs.subject_name}</td>
                    <td className="p-3 text-center text-sm text-slate-200">
                      {editingSubjectId === cs.id ? (
                        <input
                          type="number"
                          min="1"
                          className="w-24 rounded-md border border-[#2a3a57] bg-[#0a0e17] px-2 py-1.5 text-center text-sm text-white"
                          value={editForm.hours_per_week}
                          onChange={e => setEditForm({ ...editForm, hours_per_week: parseInt(e.target.value, 10) || 1 })}
                        />
                      ) : (
                        cs.hours_per_week
                      )}
                    </td>
                    <td className="p-3 text-sm text-slate-300">
                      {editingSubjectId === cs.id ? (
                        <div className="flex items-center gap-2">
                          <input
                            list="staff-suggestions"
                            className="w-full min-w-[180px] rounded-md border border-[#2a3a57] bg-[#0a0e17] px-3 py-1.5 text-sm text-white"
                            value={editForm.staff_input}
                            onChange={e => setEditForm({ ...editForm, staff_input: e.target.value })}
                            placeholder="Assign staff"
                          />
                          {editingStaffWorkload && (
                            <div className="whitespace-nowrap rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-mono text-emerald-300">
                              {editingStaffWorkload}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span>{cs.staff_name || 'Unassigned'}</span>
                          {cs.staff_id && getStaffWorkloadLabel(cs.staff_id) && (
                            <div className="whitespace-nowrap rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-mono text-emerald-300">
                              {getStaffWorkloadLabel(cs.staff_id)}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      {editingSubjectId === cs.id ? (
                        <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                          <input
                            type="checkbox"
                            checked={editForm.is_lab_required}
                            onChange={e => setEditForm({ ...editForm, is_lab_required: e.target.checked })}
                          />
                          Lab
                        </label>
                      ) : (
                        <span className={clsx(
                          'inline-flex rounded px-2 py-1 text-[11px]',
                          cs.is_lab_required ? 'bg-cyan-500/15 text-cyan-300' : 'bg-slate-700/50 text-slate-300'
                        )}>
                          {cs.is_lab_required ? 'Lab' : 'Theory'}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <span className={clsx(
                        'inline-flex rounded px-2 py-1 text-[11px]',
                        cs.staff_id ? 'bg-emerald-500/15 text-emerald-300' : 'bg-[#223451] text-slate-200'
                      )}>
                        {cs.staff_id ? 'Assigned' : 'Unassigned'}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        {editingSubjectId === cs.id ? (
                          <>
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
                          </>
                        ) : (
                          <button
                            onClick={() => startEditing(cs)}
                            className="px-3 py-1.5 rounded border border-[#2a3a57] text-xs text-slate-200 hover:bg-[#0a0e17]"
                          >
                            Edit Assignment
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
              ))}
              {classSubjects.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-sm text-slate-400">
                    No subjects assigned yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
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
                    const slot = activeTimetable.find(s => s.day_order === day && s.period === period);

                    return (
                      <td key={period} className="p-2 border-b border-[#243550]">
                        <div className={clsx(
                          'min-h-[72px] rounded border p-2',
                          isEditingTimetable && !slot && 'border-cyan-500/30 bg-cyan-500/5',
                          slot ? 'border-[#2d4b6d] bg-[#122034]' : 'border-dashed border-[#2a3a57] bg-[#0a0e17]'
                        )}
                        onDragOver={isEditingTimetable && !slot ? e => e.preventDefault() : undefined}
                        onDrop={isEditingTimetable && !slot ? async e => {
                          e.preventDefault();
                          if (!draggingSlot) return;
                          if (draggingSlot.day_order === day && draggingSlot.period === period) return;
                          if (isPtSubjectSlot(draggingSlot) && ![4, 5, 6].includes(period)) {
                            window.alert('PT can only be moved to Periods 4, 5, or 6.');
                            return;
                          }
                          if (draggingSlot.staff_id) {
                            const staffSlots = await getStaffTimetable(draggingSlot.staff_id);
                            const clash = staffSlots.find(item =>
                              item.class_id !== Number(id) && item.day_order === day && item.period === period
                            );
                            if (clash) {
                              window.alert(`Staff already has another class at Day ${day} Period ${period}.`);
                              return;
                            }
                          }
                          setDraftTimetable(current => current.map(item =>
                            item.day_order === draggingSlot.day_order && item.period === draggingSlot.period
                              ? { ...item, day_order: day, period }
                              : item
                          ));
                          setDraggingSlot(null);
                        } : undefined}>
                          {slot ? (
                            <div
                              draggable={isEditingTimetable && !isProtectedDepartmentSlot(slot)}
                              onDragStart={() => {
                                if (isProtectedDepartmentSlot(slot)) return;
                                setDraggingSlot(slot);
                              }}
                              onDragEnd={() => setDraggingSlot(null)}
                              className={clsx(
                                'space-y-1',
                                isEditingTimetable && !isProtectedDepartmentSlot(slot) && 'cursor-grab active:cursor-grabbing'
                              )}
                            >
                              <div className="text-xs font-semibold text-white">{slot.subject_code || slot.type || 'Slot'}</div>
                              <div className="text-[11px] text-slate-400">{slot.staff_name || 'No staff'}</div>
                              {slot.lab_name && <div className="text-[11px] text-cyan-400">{slot.lab_name}</div>}
                              {isEditingTimetable && !isProtectedDepartmentSlot(slot) && (
                                <div className="flex justify-end pt-1">
                                  <button
                                    onClick={() => handleRemoveDraftSlot(day, period)}
                                    className="rounded border border-red-500/20 px-2 py-0.5 text-[10px] text-red-300 hover:bg-red-500/10"
                                  >
                                    Remove
                                  </button>
                                </div>
                              )}
                            </div>
                          ) : isEditingTimetable ? (
                            <div className="flex min-h-[56px] items-center justify-center text-[11px] font-mono uppercase tracking-wider text-cyan-300">
                              Drop Here
                            </div>
                          ) : (
                            <select
                              className="w-full text-xs bg-transparent text-slate-300 outline-none"
                              onChange={e => {
                                if (!e.target.value) return;
                                const selected = slotSubjectOptions.find(option => option.value === e.target.value);
                                if (selected) {
                                  handleAssignSlot(day, period, selected.subject_id, selected.staff_id, selected.type);
                                }
                              }}
                              value=""
                            >
                              <option value="">Assign</option>
                              {slotSubjectOptions.map(option => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
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

      {isGeneratingTimetable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-cyan-500/20 bg-[#0f1623] px-6 py-8 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-cyan-500/20 bg-cyan-500/10">
              <LoaderCircle size={30} className="animate-spin text-cyan-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Generating class timetable</h3>
            <p className="mt-2 text-sm text-slate-400">
              Scheduling subjects into free slots and checking staff conflicts.
            </p>
            <div className="mt-5 h-2 overflow-hidden rounded-full border border-cyan-500/20 bg-[#0a0e17]">
              <div className="h-full w-1/2 animate-pulse rounded-full bg-cyan-500" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
