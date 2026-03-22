import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Department, Class, Staff, Subject } from '../types';
import { Plus, GraduationCap, ChevronRight, BarChart3, Lock, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import { subscribeDataInvalidation } from '../utils/dataInvalidation';

// Departments where class creation is disabled
const RESTRICTED_DEPARTMENTS = ['tamil', 'english', 'mathematics'];

export default function DepartmentDashboard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const deptId = Number(id);
  const [dept, setDept] = useState<Department | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [allClasses, setAllClasses] = useState<Class[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [newClass, setNewClass] = useState({
    name: '',
    year: 1,
    student_strength: 0,
    tutor_staff_id: '',
  });
  const [strengthDrafts, setStrengthDrafts] = useState<Record<number, string>>({});
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [activeTamilView, setActiveTamilView] = useState<'staff' | 'assign'>('staff');
  const [selectedTamilClassIds, setSelectedTamilClassIds] = useState<number[]>([]);
  const [tamilClassFilterYear, setTamilClassFilterYear] = useState<string>('all');
  const [tamilClassFilterDeptId, setTamilClassFilterDeptId] = useState<string>('all');
  const [defaultTamilHours, setDefaultTamilHours] = useState<string>('1');
  const [hoursByTamilClass, setHoursByTamilClass] = useState<Record<number, string>>({});
  const [staffByTamilClass, setStaffByTamilClass] = useState<Record<number, string>>({});

  const loadStaff = useCallback(() => {
    fetch('/api/staff', {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    }).then(res => res.json()).then(data => {
      setStaff(data as Staff[]);
    });
  }, []);

  const departmentStaff = useMemo(() => {
    const scoped = staff.filter(member => member.dept_id === deptId);
    const unique = new Map<string, Staff>();

    for (const member of scoped) {
      const key = `${member.name.trim().toLowerCase()}|${member.role}|${member.dept_id ?? 'none'}`;
      if (!unique.has(key)) {
        unique.set(key, member);
      }
    }

    return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [staff, deptId]);

  useEffect(() => {
    fetch('/api/departments').then(res => res.json()).then(data => {
      setDepartments(data as Department[]);
      const department = data.find((item: Department) => item.id === deptId);
      setDept(department || null);
    });
    fetch('/api/classes').then(res => res.json()).then(data => {
      setAllClasses(data as Class[]);
      setClasses((data as Class[]).filter((item: Class) => item.dept_id === deptId));
    });
    loadStaff();
    fetch('/api/subjects').then(res => res.json()).then(data => {
      setSubjects(data as Subject[]);
    });
  }, [deptId, loadStaff]);

  useEffect(() => {
    return subscribeDataInvalidation(({ scopes }) => {
      if (
        scopes.includes('staff_workload') ||
        scopes.includes('tamil') ||
        scopes.includes('classes') ||
        scopes.includes('timetable') ||
        scopes.includes('staff')
      ) {
        loadStaff();
      }
    });
  }, [loadStaff]);

  useEffect(() => {
    const handlePageShow = () => {
      loadStaff();
    };

    const handleWindowFocus = () => {
      loadStaff();
    };

    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('focus', handleWindowFocus);

    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handleWindowFocus);
    };
  }, [loadStaff]);

  useEffect(() => {
    setSelectedTamilClassIds([]);
    setHoursByTamilClass({});
    setStaffByTamilClass({});
    setTamilClassFilterYear('all');
    setTamilClassFilterDeptId('all');
    setDefaultTamilHours('1');
    setActiveTamilView('staff');
  }, [deptId]);

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
        dept_id: deptId,
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

  const isClassCreationDisabled = RESTRICTED_DEPARTMENTS.includes(dept.name.toLowerCase());
  const isTamilDepartment = dept.name.trim().toLowerCase() === 'tamil';
  const isTamilAssignView = isTamilDepartment && activeTamilView === 'assign';

  const tamilSubject = subjects.find(subject => {
    if (subject.dept_id !== deptId) return false;
    const subjectName = subject.name.trim().toLowerCase();
    return subjectName === 'tamil' || subjectName.includes('tamil');
  });

  const filteredTamilClasses = allClasses.filter(item => {
    const departmentMatch = tamilClassFilterDeptId === 'all' || item.dept_id === Number(tamilClassFilterDeptId);
    const yearMatch = tamilClassFilterYear === 'all' || item.year === Number(tamilClassFilterYear);
    return departmentMatch && yearMatch;
  });

  const selectedTamilClasses = allClasses.filter(item => selectedTamilClassIds.includes(item.id));

  const getPendingTamilHoursForStaff = (staffId: number) => {
    return selectedTamilClassIds.reduce((total, classId) => {
      const assignedStaffId = Number(staffByTamilClass[classId] || 0);
      if (assignedStaffId !== staffId) return total;
      const parsedHours = parseInt(hoursByTamilClass[classId] ?? '0', 10);
      if (Number.isNaN(parsedHours) || parsedHours <= 0) return total;
      return total + parsedHours;
    }, 0);
  };

  const getTamilStaffWorkload = (staffId: string) => {
    if (!staffId) return null;
    const selected = departmentStaff.find(member => member.id === Number(staffId));
    if (!selected) return null;
    const current = selected.current_workload || 0;
    const pending = getPendingTamilHoursForStaff(selected.id);
    return `${current + pending}h / ${selected.max_workload}h`;
  };

  const handleTamilClassToggle = (classId: number) => {
    setSelectedTamilClassIds(current => {
      if (current.includes(classId)) {
        setHoursByTamilClass(hours => {
          const next = { ...hours };
          delete next[classId];
          return next;
        });
        setStaffByTamilClass(staffMap => {
          const next = { ...staffMap };
          delete next[classId];
          return next;
        });
        return current.filter(id => id !== classId);
      }

      setHoursByTamilClass(hours => ({ ...hours, [classId]: hours[classId] ?? defaultTamilHours }));
      return [...current, classId];
    });
  };

  const handleAssignTamilToSelectedClasses = async () => {
    setStatus(null);

    if (!tamilSubject) {
      setStatus({ type: 'error', msg: 'Tamil subject is not available for this department.' });
      return;
    }

    if (selectedTamilClassIds.length === 0) {
      setStatus({ type: 'error', msg: 'Select at least one class to add Tamil.' });
      return;
    }

    const invalidClass = selectedTamilClassIds.find(classId => {
      const parsedHours = parseInt(hoursByTamilClass[classId] ?? '0', 10);
      return Number.isNaN(parsedHours) || parsedHours <= 0;
    });

    if (invalidClass) {
      setStatus({ type: 'error', msg: 'Hours/week must be greater than 0 for every selected class.' });
      return;
    }

    const staffAssignments: Record<number, number> = {};
    const hoursAssignments: Record<number, number> = {};

    for (const classId of selectedTamilClassIds) {
      hoursAssignments[classId] = parseInt(hoursByTamilClass[classId], 10);
      if (staffByTamilClass[classId]) {
        staffAssignments[classId] = Number(staffByTamilClass[classId]);
      }
    }

    try {
      const scheduleRes = await fetch('/api/tamil/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedClassIds: selectedTamilClassIds,
          staffAssignments,
          hoursAssignments,
          subjectId: tamilSubject.id,
        })
      });

      const scheduleData = await scheduleRes.json();

      if (!scheduleRes.ok) {
        setStatus({ type: 'error', msg: scheduleData.error || 'Failed to schedule Tamil' });
        return;
      }

      setStatus({ type: 'success', msg: `Tamil schedule generated. Redirecting to preview...` });
      setTimeout(() => navigate(`/tamil/preview/${scheduleData.sessionId}`), 1000);
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.message });
    }
  };

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
            <div className="text-2xl font-bold text-white">{departmentStaff.length}</div>
          </div>
        </div>
      </header>

      {isTamilDepartment && (
        <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl p-4">
          <div className="text-[10px] font-mono text-cyan-500 uppercase tracking-[0.2em] mb-3">Tamil Department Options</div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setActiveTamilView('staff')}
              className={clsx(
                'px-4 py-2 rounded text-xs font-mono uppercase tracking-wider border transition-colors',
                activeTamilView === 'staff'
                  ? 'bg-cyan-600 border-cyan-500 text-white'
                  : 'bg-[#141c2e] border-[#1e2d47] text-slate-300 hover:border-cyan-500/40'
              )}
            >
              Manage Staff & Workload
            </button>
            <button
              onClick={() => setActiveTamilView('assign')}
              className={clsx(
                'px-4 py-2 rounded text-xs font-mono uppercase tracking-wider border transition-colors',
                activeTamilView === 'assign'
                  ? 'bg-cyan-600 border-cyan-500 text-white'
                  : 'bg-[#141c2e] border-[#1e2d47] text-slate-300 hover:border-cyan-500/40'
              )}
            >
              Select Classes & Add Tamil
            </button>
          </div>
        </section>
      )}

      <div className={clsx('grid grid-cols-1 gap-8', !isTamilAssignView && 'lg:grid-cols-3')}>
        <div className={clsx('space-y-6', !isTamilAssignView && 'lg:col-span-2')}>
          <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden">
            <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47] flex justify-between items-center">
              <div className="flex items-center gap-3">
                <GraduationCap className="text-cyan-400" size={20} />
                <h2 className="font-mono font-bold text-white uppercase tracking-wider">
                  {isTamilAssignView ? 'Tamil Class Allocation' : 'Academic Classes'}
                </h2>
              </div>
            </div>
            <div className="p-6">
              {isTamilAssignView ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">Filter by Department</div>
                      <select
                        className="w-full bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                        value={tamilClassFilterDeptId}
                        onChange={e => setTamilClassFilterDeptId(e.target.value)}
                      >
                        <option value="all">All Departments</option>
                        {departments.map(item => (
                          <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">Filter by Year</div>
                      <select
                        className="w-full bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                        value={tamilClassFilterYear}
                        onChange={e => setTamilClassFilterYear(e.target.value)}
                      >
                        <option value="all">All Years</option>
                        <option value="1">Year 1</option>
                        <option value="2">Year 2</option>
                        <option value="3">Year 3</option>
                      </select>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500 mb-1">Default Hours / Week</div>
                      <input
                        type="number"
                        min={1}
                        className="w-full bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                        value={defaultTamilHours}
                        onChange={e => setDefaultTamilHours(e.target.value)}
                      />
                    </div>
                    <div className="flex items-end">
                      <button
                        onClick={() => {
                          setSelectedTamilClassIds(current => {
                            const idSet = new Set(current);
                            filteredTamilClasses.forEach(item => idSet.add(item.id));
                            return Array.from(idSet);
                          });
                          setHoursByTamilClass(current => {
                            const next = { ...current };
                            filteredTamilClasses.forEach(item => {
                              if (!next[item.id]) next[item.id] = defaultTamilHours;
                            });
                            return next;
                          });
                          setStaffByTamilClass(current => {
                            const next = { ...current };
                            filteredTamilClasses.forEach(item => {
                              if (next[item.id] === undefined) next[item.id] = '';
                            });
                            return next;
                          });
                        }}
                        className="w-full px-4 py-2 rounded bg-[#141c2e] border border-[#1e2d47] text-xs font-mono uppercase tracking-wider text-slate-300 hover:border-cyan-500/40"
                      >
                        Add Filtered Classes
                      </button>
                    </div>
                  </div>

                  <div className="max-h-56 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-3">
                    {filteredTamilClasses.map(item => {
                      const checked = selectedTamilClassIds.includes(item.id);
                      return (
                        <label
                          key={item.id}
                          className={clsx(
                            'rounded-lg border p-3 cursor-pointer',
                            checked
                              ? 'border-cyan-500/40 bg-cyan-500/10'
                              : 'border-[#1e2d47] bg-[#141c2e]'
                          )}
                        >
                          <div className="flex items-start gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleTamilClassToggle(item.id)}
                              className="mt-1"
                            />
                            <div>
                              <div className="font-semibold text-white text-sm">{item.name}</div>
                              <div className="text-[10px] font-mono text-slate-500">{item.dept_name} • Year {item.year}</div>
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  <div className="rounded-lg border border-[#1e2d47] overflow-hidden">
                    <div className="grid grid-cols-3 bg-[#141c2e] border-b border-[#1e2d47] text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      <div className="px-4 py-3">Class Name</div>
                      <div className="px-4 py-3">Tamil Staff</div>
                      <div className="px-4 py-3">Hours / Week</div>
                    </div>
                    <div className="divide-y divide-[#1e2d47]">
                      {selectedTamilClasses.length === 0 ? (
                        <div className="px-4 py-4 text-sm text-slate-500">No classes selected.</div>
                      ) : (
                        selectedTamilClasses.map(item => (
                          <div key={item.id} className="grid grid-cols-3 items-center bg-[#0f1623]">
                            <div className="px-4 py-3 text-sm text-white">{item.name}</div>
                            <div className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <select
                                  className="w-full bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                                  value={staffByTamilClass[item.id] ?? ''}
                                  onChange={e => setStaffByTamilClass(current => ({ ...current, [item.id]: e.target.value }))}
                                >
                                  <option value="">Not assigned</option>
                                  {departmentStaff.map(member => (
                                    <option key={member.id} value={member.id}>{member.name}</option>
                                  ))}
                                </select>
                                {staffByTamilClass[item.id] && (
                                  <div className="whitespace-nowrap rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-mono text-emerald-300">
                                    {getTamilStaffWorkload(staffByTamilClass[item.id])}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="px-4 py-2">
                              <input
                                type="number"
                                min={1}
                                className="w-full bg-[#0a0e17] border border-[#1e2d47] rounded p-2 text-sm outline-none"
                                value={hoursByTamilClass[item.id] ?? defaultTamilHours}
                                onChange={e => setHoursByTamilClass(current => ({ ...current, [item.id]: e.target.value }))}
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {!tamilSubject && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-mono uppercase tracking-wider text-red-300">
                      Tamil subject not found for this department. Create a subject named Tamil first.
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      onClick={handleAssignTamilToSelectedClasses}
                      className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-xs font-mono font-bold text-white uppercase tracking-wider"
                    >
                      Add Tamil To Selected Classes
                    </button>
                  </div>
                </div>
              ) : isClassCreationDisabled ? (
                <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-4 flex items-center gap-3">
                  <Lock className="text-amber-500" size={20} />
                  <div>
                    <div className="text-sm font-mono font-bold text-amber-400 uppercase">Class Creation Disabled</div>
                    <p className="text-xs text-amber-300 mt-1">This department cannot create new classes.</p>
                  </div>
                </div>
              ) : (
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
                    {departmentStaff.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
                  </select>
                  <button onClick={handleAddClass} className="bg-cyan-600 p-2 rounded hover:bg-cyan-500 transition-colors flex items-center justify-center gap-2 font-mono text-xs font-bold">
                    <Plus size={18} /> ADD CLASS
                  </button>
                </div>
              )}

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

              {!isTamilAssignView && (
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
                        {departmentStaff.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
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
              )}
            </div>
          </section>
        </div>

        {!isTamilAssignView && (
        <div className="space-y-6">
          <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden">
            <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47] flex items-center gap-3">
              <BarChart3 className="text-emerald-400" size={20} />
              <h2 className="font-mono font-bold text-white uppercase tracking-wider">Faculty Workload</h2>
              <button
                onClick={loadStaff}
                className="ml-auto inline-flex items-center gap-2 rounded border border-[#1e2d47] px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-300 hover:border-cyan-500/40"
              >
                <RefreshCw size={12} />
                Refresh
              </button>
            </div>
            <div className="p-6 space-y-4">
              {departmentStaff.map(member => {
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
        )}
      </div>
    </div>
  );
}
