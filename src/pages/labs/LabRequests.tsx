import { useState, useEffect, useMemo } from 'react';
import {
  FlaskConical, ArrowLeft, CheckCircle2, Clock, Trash2,
  FlaskRound, Lock, Bell, AlertCircle, Cpu, Eye, Plus, X, LoaderCircle
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { LabOverviewItem } from '../../types';

type FilterTab = 'all' | 'not_submitted' | 'pending' | 'assigned';

type LabPreviewSlot = {
  id: number;
  lab_requirement_id: number;
  class_id: number;
  class_name: string;
  subject_id: number;
  subject_name: string;
  subject_code: string;
  lab_id: number;
  lab_name: string;
  day_order: number;
  period: number;
  preview_group: string;
};

type LabGridSlot = {
  id: number;
  class_id: number;
  class_name: string;
  subject_id: number;
  subject_name: string;
  subject_code: string;
  lab_id: number;
  lab_name: string;
  day_order: number;
  period: number;
  type?: string;
  lab_requirement_id?: number;
  preview_group?: string;
};

type PreferenceRuleDraft = {
  id: string;
  match_text: string;
  preferred_lab: string;
};

type PreferenceNote = {
  lab_requirement_id: number;
  class_name: string;
  subject_name: string;
  preferred_lab: string;
  allocated_lab: string | null;
  reason: string;
};

type GridAssignTarget = {
  lab_id: number;
  day_order: number;
  period: number;
};

const createPreferenceRule = (): PreferenceRuleDraft => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  match_text: '',
  preferred_lab: '',
});

const LAB_PREF_STORAGE_KEY = 'campusgrid.labPreferences.v1';
const MAX_PREFERENCES = 3;
const GENERATION_STAGES = [
  'Reading preferences',
  'Running lab solver',
  'Resolving conflicts',
  'Building preview timetable',
];

export default function LabRequests() {
  const navigate = useNavigate();
  const [items, setItems] = useState<LabOverviewItem[]>([]);
  const [labs, setLabs] = useState<any[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [showAutoAssignModal, setShowAutoAssignModal] = useState(false);
  const [preferenceRules, setPreferenceRules] = useState<PreferenceRuleDraft[]>([createPreferenceRule()]);
  const [preferenceNotes, setPreferenceNotes] = useState<PreferenceNote[]>([]);
  const [preferenceWarnings, setPreferenceWarnings] = useState<string[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [fixingPreview, setFixingPreview] = useState(false);
  const [unassigningAll, setUnassigningAll] = useState(false);
  const [preview, setPreview] = useState<LabPreviewSlot[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [hasPreviewChanges, setHasPreviewChanges] = useState(false);
  const [moveDrafts, setMoveDrafts] = useState<Record<number, { to_day: number; to_period: number; to_lab_id: number | null }>>({});
  const [movingId, setMovingId] = useState<number | null>(null);
  const [draggingRowId, setDraggingRowId] = useState<number | null>(null);
  const [showScheduleGrid, setShowScheduleGrid] = useState(false);
  const [allLabSlots, setAllLabSlots] = useState<LabGridSlot[]>([]);
  const [periodsPerDay, setPeriodsPerDay] = useState(6);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStageIndex, setGenerationStageIndex] = useState(0);
  const [activeGridAssign, setActiveGridAssign] = useState<GridAssignTarget | null>(null);
  const [gridAssignInput, setGridAssignInput] = useState('');
  const [gridAssignHours, setGridAssignHours] = useState('1');
  const [assigningGridCellKey, setAssigningGridCellKey] = useState<string | null>(null);
  const [removingGridCellKey, setRemovingGridCellKey] = useState<string | null>(null);

  const loadData = () => {
    fetch('/api/lab-requirements/overview').then(r => r.json()).then(setItems);
    fetch('/api/labs').then(r => r.json()).then(setLabs);
  };

  const loadAllLabSlots = async () => {
    const [slotsRes, settingsRes] = await Promise.all([
      fetch('/api/timetable/labs'),
      fetch('/api/settings'),
    ]);

    const slotsData = await slotsRes.json();
    const settingsData = await settingsRes.json();

    if (slotsRes.ok) {
      setAllLabSlots(Array.isArray(slotsData) ? slotsData : []);
    }
    if (settingsRes.ok) {
      const p = parseInt(settingsData.periods_per_day || '6', 10);
      setPeriodsPerDay(Number.isFinite(p) && p > 0 ? p : 6);
    }
  };

  const itemKey = (item: LabOverviewItem) => `${item.class_id}-${item.subject_id}`;
  const gridCellKey = (labId: number, day: number, period: number) => `${labId}-${day}-${period}`;

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LAB_PREF_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;

      const restored = parsed
        .map((entry: any) => ({
          id: String(entry?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
          match_text: String(entry?.match_text || ''),
          preferred_lab: String(entry?.preferred_lab || ''),
        }))
        .filter((entry: PreferenceRuleDraft) => entry.match_text.trim() || entry.preferred_lab.trim());

      if (restored.length > 0) {
        setPreferenceRules(restored);
      }
    } catch {
      // Ignore malformed saved preferences and continue with default row.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(LAB_PREF_STORAGE_KEY, JSON.stringify(preferenceRules));
    } catch {
      // Ignore storage write failures.
    }
  }, [preferenceRules]);

  useEffect(() => {
    if (showScheduleGrid) {
      loadAllLabSlots();
    }
  }, [showScheduleGrid]);

  useEffect(() => {
    if (!autoAssigning) return;

    setGenerationProgress(8);
    setGenerationStageIndex(0);

    const timer = window.setInterval(() => {
      setGenerationProgress(prev => {
        const next = prev >= 96 ? 70 : prev + Math.floor(Math.random() * 5) + 1;

        if (next >= 75) setGenerationStageIndex(3);
        else if (next >= 50) setGenerationStageIndex(2);
        else if (next >= 25) setGenerationStageIndex(1);
        else setGenerationStageIndex(0);

        return next;
      });
    }, 240);

    return () => window.clearInterval(timer);
  }, [autoAssigning]);

  const loadPreview = async () => {
    setLoadingPreview(true);
    const res = await fetch('/api/labs/preview');
    const data = await res.json();
    setLoadingPreview(false);
    if (!res.ok) {
      setStatus({ type: 'error', msg: data.error || 'Failed to load preview.' });
      return;
    }
    setPreview(Array.isArray(data) ? data : []);
    setHasPreviewChanges(false);
  };

  const handleAutoAssign = async () => {
    const partiallyFilled = preferenceRules.some(rule => {
      const left = rule.match_text.trim();
      const right = rule.preferred_lab.trim();
      return (left && !right) || (!left && right);
    });
    if (partiallyFilled) {
      setStatus({ type: 'error', msg: 'Complete both preference boxes or delete the incomplete row.' });
      return;
    }

    const preferences = preferenceRules
      .map(rule => ({
        match_text: rule.match_text.trim(),
        preferred_lab: rule.preferred_lab.trim(),
      }))
      .filter(rule => rule.match_text && rule.preferred_lab);

    if (preferences.length > MAX_PREFERENCES) {
      setStatus({ type: 'error', msg: 'Only up to 3 preferences are allowed.' });
      return;
    }

    setAutoAssigning(true);
    setGenerationProgress(10);
    setGenerationStageIndex(0);
    const startedAt = Date.now();
    setStatus(null);
    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 120000);
      const res = await fetch('/api/labs/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: [1, 2, 3, 4, 5, 6], preferences }),
        signal: controller.signal,
      });
      window.clearTimeout(timeout);

      const data = await res.json();
      if (!res.ok) {
        setAutoAssigning(false);
        setGenerationProgress(0);
        setStatus({ type: 'error', msg: data.error || 'Auto assign failed.' });
        return;
      }

      setGenerationStageIndex(3);
      setGenerationProgress(100);
      const elapsed = Date.now() - startedAt;
      const minimumVisibleMs = 1800;
      if (elapsed < minimumVisibleMs) {
        await new Promise(resolve => window.setTimeout(resolve, minimumVisibleMs - elapsed));
      }
      setAutoAssigning(false);
      setGenerationProgress(0);
      setPreferenceNotes(Array.isArray(data.preference_notes) ? data.preference_notes : []);
      setPreferenceWarnings(Array.isArray(data.preference_warnings) ? data.preference_warnings : []);
      setShowAutoAssignModal(false);
      setShowPreview(true);
      await loadPreview();
      loadData();
      if (showScheduleGrid) await loadAllLabSlots();
      const unassignedCount = Array.isArray(data.unassigned_requirements) ? data.unassigned_requirements.length : 0;
      setStatus({
        type: 'success',
        msg: `Preview generated (${data.total_assigned_slots || 0} slots${unassignedCount ? `, ${unassignedCount} requests unassigned` : ''}).`
      });
    } catch (error: any) {
      setAutoAssigning(false);
      setGenerationProgress(0);
      if (error?.name === 'AbortError') {
        setStatus({ type: 'error', msg: 'Auto assign timed out. Please try again with fewer constraints.' });
      } else {
        setStatus({ type: 'error', msg: error?.message || 'Auto assign failed due to a network error.' });
      }
    }
  };

  const updatePreferenceRule = (id: string, key: 'match_text' | 'preferred_lab', value: string) => {
    setPreferenceRules(prev => prev.map(rule => (rule.id === id ? { ...rule, [key]: value } : rule)));
  };

  const addPreferenceRule = () => {
    setPreferenceRules(prev => {
      if (prev.length >= MAX_PREFERENCES) {
        setStatus({ type: 'error', msg: 'You can add up to 3 preferences only.' });
        return prev;
      }
      return [...prev, createPreferenceRule()];
    });
  };

  const deletePreferenceRule = (id: string) => {
    setPreferenceRules(prev => {
      const next = prev.filter(rule => rule.id !== id);
      return next.length > 0 ? next : [createPreferenceRule()];
    });
  };

  const handleFixPreview = async () => {
    setFixingPreview(true);
    setStatus(null);
    const res = await fetch('/api/labs/fix', { method: 'POST' });
    const data = await res.json();
    setFixingPreview(false);
    if (!res.ok) {
      setStatus({ type: 'error', msg: data.error || 'Failed to fix preview.' });
      return;
    }
    await loadPreview();
    loadData();
    if (showScheduleGrid) await loadAllLabSlots();
    setHasPreviewChanges(false);
    setStatus({ type: 'success', msg: `Lab timetable fixed (${data.applied || 0} slots committed).` });
  };

  const handleEditTimetable = async () => {
    setStatus(null);
    setShowScheduleGrid(true);
    if (!showPreview) {
      setShowPreview(true);
      await loadPreview();
    }
    setStatus({ type: 'success', msg: 'Timetable loaded in edit mode. Make changes and click Fix All to save.' });
  };

  const handleAssignGridCell = async (target: GridAssignTarget) => {
    const reqId = resolveReqIdFromGridInput(gridAssignInput);
    if (!reqId) {
      setStatus({ type: 'error', msg: 'Pick one subject from suggestions before assigning to a slot.' });
      return;
    }

    const cellKey = gridCellKey(target.lab_id, target.day_order, target.period);
    const parsedHours = Number(gridAssignHours || 1);
    const requestedHours = Number.isFinite(parsedHours) ? Math.max(1, Math.trunc(parsedHours)) : 1;
    setAssigningGridCellKey(cellKey);
    setStatus(null);
    try {
      const res = await fetch('/api/labs/preview/assign-manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lab_requirement_id: reqId,
          day_order: target.day_order,
          period: target.period,
          lab_id: target.lab_id,
          hours: requestedHours,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: 'error', msg: data.error || 'Failed to assign selected subject to this slot.' });
        return;
      }

      await loadPreview();
      setHasPreviewChanges(true);
      setGridAssignInput('');
      setGridAssignHours('1');
      setActiveGridAssign(null);
      setStatus({
        type: 'success',
        msg: `Added ${data.added_slots || 1} hour(s) from Day ${target.day_order} P${target.period}. (${data.assigned_slots || 0}/${data.required_slots || 0})`,
      });
    } catch (error: any) {
      setStatus({ type: 'error', msg: error?.message || 'Network error while assigning slot.' });
    } finally {
      setAssigningGridCellKey(null);
    }
  };

  const handleRemoveGridSlot = async (slot: LabGridSlot) => {
    const confirmed = window.confirm('Remove this assigned preview subject block from the grid?');
    if (!confirmed) return;

    const key = gridCellKey(slot.lab_id, slot.day_order, slot.period);
    setRemovingGridCellKey(key);
    setStatus(null);
    try {
      const res = await fetch('/api/labs/preview/remove-manual', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview_slot_id: slot.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: 'error', msg: data.error || 'Failed to remove assigned subject.' });
        return;
      }

      await loadPreview();
      setHasPreviewChanges(true);
      setStatus({ type: 'success', msg: `Removed ${data.removed_slots || 0} slot(s) from preview.` });
    } catch (error: any) {
      setStatus({ type: 'error', msg: error?.message || 'Network error while removing assigned subject.' });
    } finally {
      setRemovingGridCellKey(null);
    }
  };

  const handleUnassignAll = async () => {
    const confirmed = window.confirm('Unassign all lab slots across all labs? This will clear preview and committed lab timetable slots.');
    if (!confirmed) return;

    setUnassigningAll(true);
    setStatus(null);
    try {
      const res = await fetch('/api/labs/unassign-all', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: 'error', msg: data.error || 'Failed to unassign lab slots.' });
        return;
      }

      setPreview([]);
      setPreferenceNotes([]);
      setPreferenceWarnings([]);
      setShowPreview(false);
      loadData();
      if (showScheduleGrid) await loadAllLabSlots();
      setStatus({
        type: 'success',
        msg: `Unassigned ${data.slots_unassigned || 0} lab slots and reset ${data.requirements_reset || 0} lab requests.`,
      });
    } catch (error: any) {
      setStatus({ type: 'error', msg: error?.message || 'Failed to unassign lab slots due to a network error.' });
    } finally {
      setUnassigningAll(false);
    }
  };

  const handleMovePreview = async (row: LabPreviewSlot) => {
    const draft = moveDrafts[row.id];
    if (!draft) {
      setStatus({ type: 'error', msg: 'Choose day/period before moving.' });
      return;
    }

    setMovingId(row.id);
    setStatus(null);
    const res = await fetch('/api/labs/preview/move', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lab_requirement_id: row.lab_requirement_id,
        from_day: row.day_order,
        from_period: row.period,
        to_day: Number(draft.to_day),
        to_period: Number(draft.to_period),
        to_lab_id: draft.to_lab_id ?? undefined,
      })
    });
    const data = await res.json();
    setMovingId(null);
    if (!res.ok) {
      setStatus({ type: 'error', msg: data.error || 'Failed to move preview slot.' });
      return;
    }
    await loadPreview();
    if (showScheduleGrid) await loadAllLabSlots();
    setHasPreviewChanges(true);
    setStatus({ type: 'success', msg: 'Preview slot moved.' });
  };

  const movePreviewSlot = async (
    source: LabPreviewSlot,
    toDay: number,
    toPeriod: number,
    toLabId: number,
    successMessage: string,
  ) => {
    setMovingId(source.id);
    setStatus(null);
    const res = await fetch('/api/labs/preview/move', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lab_requirement_id: source.lab_requirement_id,
        from_day: source.day_order,
        from_period: source.period,
        to_day: toDay,
        to_period: toPeriod,
        to_lab_id: toLabId,
      })
    });
    const data = await res.json();
    setMovingId(null);
    if (!res.ok) {
      setStatus({ type: 'error', msg: data.error || 'Failed to move preview slot.' });
      return;
    }
    await loadPreview();
    if (showScheduleGrid) await loadAllLabSlots();
    setHasPreviewChanges(true);
    setStatus({ type: 'success', msg: successMessage });
  };

  const moveGridSlot = async (
    source: LabGridSlot,
    toDay: number,
    toPeriod: number,
    toLabId: number,
    successMessage: string,
  ) => {
    if (source.type === 'preview') {
      if (!source.lab_requirement_id) {
        setStatus({ type: 'error', msg: 'Cannot move this preview slot.' });
        return;
      }
      await movePreviewSlot(
        {
          id: source.id,
          lab_requirement_id: source.lab_requirement_id,
          class_id: source.class_id,
          class_name: source.class_name,
          subject_id: source.subject_id,
          subject_name: source.subject_name,
          subject_code: source.subject_code,
          lab_id: source.lab_id,
          lab_name: source.lab_name,
          day_order: source.day_order,
          period: source.period,
          preview_group: source.preview_group || `preview-${source.id}`,
        },
        toDay,
        toPeriod,
        toLabId,
        successMessage,
      );
      return;
    }

    setMovingId(source.id);
    setStatus(null);
    const res = await fetch('/api/timetable/labs/move', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slot_id: source.id,
        to_day: toDay,
        to_period: toPeriod,
        to_lab_id: toLabId,
      }),
    });
    const data = await res.json();
    setMovingId(null);
    if (!res.ok) {
      setStatus({ type: 'error', msg: data.error || 'Failed to move timetable slot.' });
      return;
    }
    await loadAllLabSlots();
    setStatus({ type: 'success', msg: successMessage });
  };

  const handleDropOnRow = async (target: LabPreviewSlot, sourceId?: number) => {
    const dragId = sourceId ?? draggingRowId;
    if (!dragId || dragId === target.id) return;
    const source = preview.find(p => p.id === dragId);
    if (!source) return;

    await movePreviewSlot(source, target.day_order, target.period, target.lab_id, 'Preview slot moved by drag-and-drop.');
    setDraggingRowId(null);
  };

  const gridSource: LabGridSlot[] = preview.length > 0
    ? preview.map(p => ({
        id: p.id,
        class_id: p.class_id,
        class_name: p.class_name,
        subject_id: p.subject_id,
        subject_name: p.subject_name,
        subject_code: p.subject_code,
        lab_id: p.lab_id,
        lab_name: p.lab_name,
        day_order: p.day_order,
        period: p.period,
        lab_requirement_id: p.lab_requirement_id,
        preview_group: p.preview_group,
        type: 'preview',
      }))
    : allLabSlots;

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

  const preferenceSuggestions = useMemo(() => {
    const values = new Set<string>();
    for (const item of items) {
      if (item.subject_name) values.add(item.subject_name);
      if (item.subject_code) values.add(item.subject_code);
      if (item.class_name) values.add(item.class_name);
      if (item.dept_name) values.add(item.dept_name);
    }
    return Array.from(values).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const labNameSuggestions = useMemo(() => {
    const values = labs
      .map(lab => String(lab.name || '').trim())
      .filter((value): value is string => value.length > 0);
    return Array.from(new Set<string>(values)).sort((a, b) => a.localeCompare(b));
  }, [labs]);

  const requirementProgress = useMemo(() => {
    const map = new Map<number, { assigned: number; required: number }>();
    for (const item of items) {
      if (!item.req_id) continue;
      const reqId = Number(item.req_id);
      const required = Number(item.duration || item.hours_per_week || 1);
      map.set(reqId, { assigned: 0, required: Math.max(1, required) });
    }
    for (const slot of preview) {
      const reqId = Number(slot.lab_requirement_id);
      const current = map.get(reqId);
      if (!current) continue;
      current.assigned += 1;
      map.set(reqId, current);
    }
    return map;
  }, [items, preview]);

  const labCapacityMap = useMemo(() => {
    const map = new Map<number, { used: number; capacity: number }>();
    // Initialize all labs with 30-hour capacity
    for (const lab of labs) {
      map.set(lab.id, { used: 0, capacity: 30 });
    }
    // Count hours used per lab
    for (const slot of gridSource) {
      const current = map.get(slot.lab_id);
      if (current) {
        current.used += 1;
        map.set(slot.lab_id, current);
      }
    }
    return map;
  }, [labs, gridSource]);

  const totalHoursRequested = useMemo(() => {
    let total = 0;
    for (const item of items) {
      if (item.status === 'pending' || item.status === 'not_submitted') {
        total += Number(item.duration || item.hours_per_week || 1);
      }
    }
    return total;
  }, [items]);

  const manualAssignableItems = useMemo(() => {
    return items.filter(item => {
      if (!item.req_id) return false;
      if (item.status === 'not_submitted') return false;
      const reqId = Number(item.req_id);
      const progress = requirementProgress.get(reqId);
      if (!progress) return false;
      return progress.assigned < progress.required;
    });
  }, [items, requirementProgress]);

  const manualAssignSuggestions = useMemo(() => {
    return manualAssignableItems.map(item => {
      const reqId = Number(item.req_id);
      const progress = requirementProgress.get(reqId)!;
      const remaining = Math.max(0, progress.required - progress.assigned);
      return {
        req_id: reqId,
        label: `${item.subject_code} - ${item.subject_name} | ${item.class_name} (left ${remaining}/${progress.required}) [REQ:${reqId}]`,
      };
    });
  }, [manualAssignableItems, requirementProgress]);

  const resolveReqIdFromGridInput = (raw: string): number | null => {
    const value = String(raw || '').trim();
    if (!value) return null;

    const tagMatch = value.match(/\[REQ:(\d+)\]\s*$/i);
    if (tagMatch) {
      const reqId = Number(tagMatch[1]);
      if (manualAssignSuggestions.some(s => s.req_id === reqId)) return reqId;
    }

    if (/^\d+$/.test(value)) {
      const reqId = Number(value);
      if (manualAssignSuggestions.some(s => s.req_id === reqId)) return reqId;
    }

    const lower = value.toLowerCase();
    const exact = manualAssignSuggestions.filter(s => s.label.toLowerCase() === lower);
    if (exact.length === 1) return exact[0].req_id;

    const partial = manualAssignSuggestions.filter(s => s.label.toLowerCase().includes(lower));
    if (partial.length === 1) return partial[0].req_id;

    return null;
  };

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

        <div className="mt-4 flex flex-wrap items-center gap-2 justify-end">
          {preview.length === 0 && allLabSlots.length > 0 ? (
            <button
              onClick={handleEditTimetable}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-mono font-bold uppercase tracking-wider inline-flex items-center gap-2"
            >
              <Eye size={14} /> Edit Timetable
            </button>
          ) : (
            <button
              onClick={async () => {
                setShowScheduleGrid(true);
                if (!showPreview) {
                  setShowPreview(true);
                  await loadPreview();
                }
              }}
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-mono font-bold uppercase tracking-wider inline-flex items-center gap-2"
            >
              <CheckCircle2 size={14} /> Assign
            </button>
          )}
          <button
            onClick={() => setShowScheduleGrid(v => !v)}
            className="px-4 py-2 rounded-lg border border-[#2a3a57] text-slate-200 hover:border-cyan-500 text-xs font-mono font-bold uppercase tracking-wider inline-flex items-center gap-2"
          >
            <Eye size={14} /> {showScheduleGrid ? 'Hide All Lab Grid' : 'View All Lab Grid'}
          </button>
          <button
            onClick={handleFixPreview}
            disabled={fixingPreview || !hasPreviewChanges}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-mono font-bold uppercase tracking-wider inline-flex items-center gap-2"
          >
            <Cpu size={14} /> {fixingPreview ? 'Fixing…' : 'Fix All'}
          </button>
          <button
            onClick={handleUnassignAll}
            disabled={unassigningAll}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-mono font-bold uppercase tracking-wider inline-flex items-center gap-2"
          >
            <Trash2 size={14} /> {unassigningAll ? 'Unassigning…' : 'Unassign All'}
          </button>
        </div>
      </header>

      {(preferenceWarnings.length > 0 || preferenceNotes.length > 0) && (
        <section className="rounded-xl border border-[#1e2d47] bg-[#0f1623] p-4 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-white">Preference Results</h2>
            <button
              onClick={() => {
                setPreferenceNotes([]);
                setPreferenceWarnings([]);
              }}
              className="text-[10px] font-mono uppercase tracking-wider text-slate-500 hover:text-slate-200"
            >
              Clear
            </button>
          </div>

          {preferenceWarnings.length > 0 && (
            <div className="space-y-2">
              {preferenceWarnings.map((warning, index) => (
                <div key={`pref-warning-${index}`} className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                  {warning}
                </div>
              ))}
            </div>
          )}

          {preferenceNotes.length > 0 && (
            <div className="space-y-2">
              {preferenceNotes.map(note => (
                <div key={`pref-note-${note.lab_requirement_id}`} className="rounded-lg border border-[#22365a] bg-[#0a0e17] px-3 py-3">
                  <div className="text-sm text-white font-medium">{note.subject_name} <span className="text-slate-500">• {note.class_name}</span></div>
                  <div className="text-xs text-slate-400 mt-1">Preferred lab: <span className="text-cyan-300">{note.preferred_lab}</span></div>
                  <div className="text-xs text-slate-400 mt-1">Allocated lab: <span className="text-emerald-300">{note.allocated_lab || 'Not allocated'}</span></div>
                  <div className="text-xs text-amber-200 mt-2">{note.reason}</div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {showPreview && (
        <section className="rounded-xl border border-[#1e2d47] bg-[#0f1623] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1e2d47] flex items-center justify-between">
            <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-white">Lab Preview</h2>
            <span className="text-xs font-mono text-slate-400">{preview.length} slots</span>
          </div>
          <div className="p-4 overflow-x-auto">
            {loadingPreview ? (
              <div className="text-sm text-slate-400">Loading preview...</div>
            ) : preview.length === 0 ? (
              <div className="text-sm text-slate-400">No preview slots yet. Use Assign and continue manual lab assignment from the request list.</div>
            ) : (
              <div className="space-y-3">
              <div className="text-[11px] font-mono text-slate-500">Tip: Drag a preview row and drop it on another row to move its session block quickly.</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] font-mono uppercase tracking-wider text-slate-500 border-b border-[#1e2d47]">
                    <th className="py-2 pr-3">Class</th>
                    <th className="py-2 pr-3">Subject</th>
                    <th className="py-2 pr-3">Lab</th>
                    <th className="py-2 pr-3">Day</th>
                    <th className="py-2 pr-3">Period</th>
                    <th className="py-2 pr-3">Move</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map(row => (
                    <tr
                      key={row.id}
                      draggable
                      onDragStart={e => {
                        setDraggingRowId(row.id);
                        e.dataTransfer.setData('text/plain', String(row.id));
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragEnd={() => setDraggingRowId(null)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={async e => {
                        e.preventDefault();
                        const droppedId = Number(e.dataTransfer.getData('text/plain'));
                        const sourceId = Number.isFinite(droppedId) && droppedId > 0 ? droppedId : undefined;
                        await handleDropOnRow(row, sourceId);
                      }}
                      className={`border-b border-[#1e2d47]/40 ${draggingRowId === row.id ? 'opacity-40' : ''}`}
                    >
                      <td className="py-2 pr-3 text-slate-200">{row.class_name}</td>
                      <td className="py-2 pr-3 text-slate-300">{row.subject_name} <span className="text-slate-500">({row.subject_code})</span></td>
                      <td className="py-2 pr-3 text-cyan-300">{row.lab_name}</td>
                      <td className="py-2 pr-3 text-slate-300">{row.day_order}</td>
                      <td className="py-2 pr-3 text-slate-300">{row.period}</td>
                      <td className="py-2 pr-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <select
                            className="bg-[#0a0e17] border border-[#2a3a57] rounded px-2 py-1 text-xs"
                            value={moveDrafts[row.id]?.to_day ?? row.day_order}
                            onChange={e => setMoveDrafts(prev => ({
                              ...prev,
                              [row.id]: {
                                to_day: parseInt(e.target.value, 10),
                                to_period: prev[row.id]?.to_period ?? row.period,
                                to_lab_id: prev[row.id]?.to_lab_id ?? row.lab_id,
                              }
                            }))}
                          >
                            {[1, 2, 3, 4, 5, 6].map(d => <option key={d} value={d}>Day {d}</option>)}
                          </select>
                          <select
                            className="bg-[#0a0e17] border border-[#2a3a57] rounded px-2 py-1 text-xs"
                            value={moveDrafts[row.id]?.to_period ?? row.period}
                            onChange={e => setMoveDrafts(prev => ({
                              ...prev,
                              [row.id]: {
                                to_day: prev[row.id]?.to_day ?? row.day_order,
                                to_period: parseInt(e.target.value, 10),
                                to_lab_id: prev[row.id]?.to_lab_id ?? row.lab_id,
                              }
                            }))}
                          >
                            {[1, 2, 3, 4, 5, 6].map(p => <option key={p} value={p}>P{p}</option>)}
                          </select>
                          <select
                            className="bg-[#0a0e17] border border-[#2a3a57] rounded px-2 py-1 text-xs"
                            value={moveDrafts[row.id]?.to_lab_id ?? row.lab_id}
                            onChange={e => setMoveDrafts(prev => ({
                              ...prev,
                              [row.id]: {
                                to_day: prev[row.id]?.to_day ?? row.day_order,
                                to_period: prev[row.id]?.to_period ?? row.period,
                                to_lab_id: parseInt(e.target.value, 10),
                              }
                            }))}
                          >
                            {labs.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                          </select>
                          <button
                            onClick={() => handleMovePreview(row)}
                            disabled={movingId === row.id}
                            className="px-2 py-1 rounded bg-[#1a2c49] hover:bg-[#22365a] text-xs font-mono text-cyan-300"
                          >
                            {movingId === row.id ? 'Moving…' : 'Move'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </section>
      )}

      {showScheduleGrid && (
        <section className="rounded-xl border border-[#1e2d47] bg-[#0f1623] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#1e2d47] flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-white">All Lab Schedule Grid</h2>
            <div className="flex items-center gap-3">
              {preview.length > 0 && (
                <button
                  onClick={handleFixPreview}
                  disabled={fixingPreview}
                  className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-[10px] font-mono font-bold uppercase tracking-wider"
                >
                  {fixingPreview ? 'Fixing…' : 'Fix All'}
                </button>
              )}
            </div>
          </div>

          <div className="p-4 space-y-6">
            {labs.map(lab => {
              const labSlots = gridSource.filter(s => s.lab_id === lab.id);
              const periods = Array.from({ length: periodsPerDay }, (_, i) => i + 1);
              const days = [1, 2, 3, 4, 5, 6];
              return (
                <div key={`grid-${lab.id}`} className="rounded-lg border border-[#1e2d47] overflow-hidden">
                  <div className="px-3 py-2 bg-[#141c2e] border-b border-[#1e2d47] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div>
                        <h3 className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-wider">{lab.name}</h3>
                        <p className="text-[9px] font-mono text-slate-500 mt-0.5">Lab #{lab.id}</p>
                      </div>
                      <div className="text-[10px] font-mono text-slate-600 flex items-center gap-1">
                        <span className={labCapacityMap.get(lab.id)!.used > 20 ? 'text-red-400 font-bold' : 'text-emerald-400'}>
                          {labCapacityMap.get(lab.id)!.used}/{labCapacityMap.get(lab.id)!.capacity}h
                        </span>
                        <span className="text-slate-700">per week</span>
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">{labSlots.length} slots</span>
                  </div>
                  <div className="overflow-x-auto p-2">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr>
                          <th className="p-2 text-left text-[10px] font-mono text-slate-500">Day</th>
                          {periods.map(p => (
                            <th key={`ph-${lab.id}-${p}`} className="p-2 text-center text-[10px] font-mono text-slate-500">P{p}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {days.map(day => (
                          <tr key={`d-${lab.id}-${day}`} className="border-t border-[#1e2d47]/40">
                            <td className="p-2 font-mono text-slate-400">Day {day}</td>
                            {periods.map(period => {
                              const slot = labSlots.find(s => s.day_order === day && s.period === period);
                              const cellKey = gridCellKey(lab.id, day, period);
                              const isActiveAssignCell =
                                activeGridAssign?.lab_id === lab.id &&
                                activeGridAssign?.day_order === day &&
                                activeGridAssign?.period === period;
                              const isAssigningCell = assigningGridCellKey === cellKey;
                              const isRemovingCell = removingGridCellKey === cellKey;
                              return (
                                <td
                                  key={`c-${lab.id}-${day}-${period}`}
                                  className="p-1"
                                  onDragOver={e => {
                                    e.preventDefault();
                                  }}
                                  onDrop={async e => {
                                    e.preventDefault();
                                    const dragged = Number(e.dataTransfer.getData('text/plain'));
                                    const sourceId = Number.isFinite(dragged) && dragged > 0 ? dragged : draggingRowId;
                                    if (!sourceId) return;
                                    const source = gridSource.find(p => p.id === sourceId);
                                    if (!source) return;
                                    if (source.day_order === day && source.period === period && source.lab_id === lab.id) return;

                                    await moveGridSlot(source, day, period, lab.id, 'Grid move applied.');
                                    setDraggingRowId(null);
                                  }}
                                >
                                  <div
                                    draggable={!!slot}
                                    onDragStart={e => {
                                      if (slot) {
                                        setDraggingRowId(slot.id);
                                        e.dataTransfer.setData('text/plain', String(slot.id));
                                        e.dataTransfer.effectAllowed = 'move';
                                      }
                                    }}
                                    onDragEnd={() => setDraggingRowId(null)}
                                    className={`min-h-[56px] rounded border px-2 py-1 ${slot ? 'border-cyan-500/20 bg-cyan-500/5 text-slate-200' : 'border-dashed border-[#1e2d47] text-slate-600'} ${movingId === slot?.id ? 'opacity-40' : ''}`}
                                  >
                                    {slot ? (
                                      <>
                                        <div className="font-semibold truncate">{slot.class_name}</div>
                                        <div className="text-[10px] text-cyan-300 truncate">{slot.subject_code}</div>
                                        {preview.length > 0 && (
                                          <button
                                            onClick={() => handleRemoveGridSlot(slot)}
                                            disabled={isRemovingCell}
                                            className="mt-1 px-1.5 py-0.5 rounded bg-red-600/80 hover:bg-red-500 disabled:opacity-50 text-[9px] font-mono text-white"
                                          >
                                            {isRemovingCell ? 'Removing…' : 'Remove'}
                                          </button>
                                        )}
                                      </>
                                    ) : (
                                      <div className="space-y-1">
                                        {!isActiveAssignCell ? (
                                          <button
                                            onClick={() => {
                                              setActiveGridAssign({ lab_id: lab.id, day_order: day, period });
                                              setGridAssignInput('');
                                              setGridAssignHours('1');
                                            }}
                                            className="text-[10px] font-mono text-slate-500 hover:text-cyan-300"
                                          >
                                            FREE - Add Subject
                                          </button>
                                        ) : (
                                          <div className="space-y-1">
                                            <input
                                              list="grid-subject-assign-suggestions"
                                              value={gridAssignInput}
                                              onChange={e => setGridAssignInput(e.target.value)}
                                              placeholder="Search subject/class"
                                              className="w-full bg-[#0a0e17] border border-[#2a3a57] rounded px-2 py-1 text-[10px] text-slate-200 outline-none focus:border-cyan-500"
                                            />
                                            <input
                                              type="number"
                                              min={1}
                                              value={gridAssignHours}
                                              onChange={e => setGridAssignHours(e.target.value)}
                                              placeholder="Hours"
                                              className="w-full bg-[#0a0e17] border border-[#2a3a57] rounded px-2 py-1 text-[10px] text-slate-200 outline-none focus:border-cyan-500"
                                            />
                                            <div className="flex items-center gap-1">
                                              <button
                                                onClick={() => handleAssignGridCell({ lab_id: lab.id, day_order: day, period })}
                                                disabled={isAssigningCell}
                                                className="px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-[10px] font-mono text-white"
                                              >
                                                {isAssigningCell ? 'Adding…' : 'Add'}
                                              </button>
                                              <button
                                                onClick={() => {
                                                  setActiveGridAssign(null);
                                                  setGridAssignInput('');
                                                  setGridAssignHours('1');
                                                }}
                                                className="px-2 py-1 rounded border border-[#2a3a57] text-[10px] font-mono text-slate-300"
                                              >
                                                Cancel
                                              </button>
                                            </div>
                                          </div>
                                        )}
                                      </div>
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
                </div>
              );
            })}
          </div>
        </section>
      )}

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

      {showAutoAssignModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-4xl rounded-xl border border-[#2a3a57] bg-[#0f1623] p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-white">Auto Assign Preferences</h3>
                <p className="text-sm text-slate-400 mt-1">Left box matches subject, class, or department text. Right box maps that match to a preferred lab name.</p>
              </div>
              <button onClick={() => setShowAutoAssignModal(false)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="rounded-lg border border-[#1e2d47] bg-[#0a0e17] p-3 text-xs text-slate-400">
              The solver will try to honor these mappings first. If a preferred lab is not possible, it will fall back to another compatible lab and report why. Load is also spread across labs and days to avoid overfilling one lab or one day.
            </div>

            {autoAssigning && (
              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-4 space-y-3">
                <div className="flex items-center gap-2 text-cyan-200 text-sm font-medium">
                  <LoaderCircle size={16} className="animate-spin" />
                  Generating timetable preview... {generationProgress}%
                </div>
                <div className="h-2 rounded-full bg-[#0a0e17] border border-[#1e2d47] overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 via-emerald-400 to-cyan-300 transition-all duration-300"
                    style={{ width: `${generationProgress}%` }}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {GENERATION_STAGES.map((stage, index) => {
                    const completed = generationProgress >= 100 || index < generationStageIndex;
                    const active = index === generationStageIndex && generationProgress < 100;
                    return (
                      <div
                        key={stage}
                        className={`px-2 py-1.5 rounded border ${
                          completed
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                            : active
                              ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200 animate-pulse'
                              : 'border-[#1e2d47] bg-[#0a0e17] text-slate-500'
                        }`}
                      >
                        {stage}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-3">
              {preferenceRules.map((rule, index) => (
                <div key={rule.id} className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end rounded-lg border border-[#1e2d47] bg-[#0a0e17] p-3">
                  <div>
                    <label className="text-xs text-slate-400">Match subject / class / department</label>
                    <input
                      value={rule.match_text}
                      onChange={e => updatePreferenceRule(rule.id, 'match_text', e.target.value)}
                      list="lab-preference-match-suggestions"
                      placeholder="Example: DBMS, III BSc CS, CSDA"
                      className="w-full mt-1 px-3 py-2 rounded-md border border-[#2a3a57] bg-[#101726] text-sm text-slate-100 outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400">Preferred lab</label>
                    <input
                      value={rule.preferred_lab}
                      onChange={e => updatePreferenceRule(rule.id, 'preferred_lab', e.target.value)}
                      list="lab-preference-lab-suggestions"
                      placeholder="Example: Lab A"
                      className="w-full mt-1 px-3 py-2 rounded-md border border-[#2a3a57] bg-[#101726] text-sm text-slate-100 outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => deletePreferenceRule(rule.id)}
                      className="px-3 py-2 rounded-md border border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                      title={`Delete preference ${index + 1}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button
                onClick={addPreferenceRule}
                disabled={preferenceRules.length >= MAX_PREFERENCES}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-[#2a3a57] text-sm text-slate-200 hover:border-cyan-500"
              >
                <Plus size={16} /> Add Preference
              </button>
              <div className="text-xs text-slate-500">Examples: "CS" → "Lab A", "AI Lab" → "Lab B", "III BSc CS" → "Lab 2". Max 3 preferences.</div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAutoAssignModal(false)}
                disabled={autoAssigning}
                className="px-4 py-2 rounded-md border border-[#2a3a57] text-sm text-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={handleAutoAssign}
                disabled={autoAssigning}
                className="px-4 py-2 rounded-md bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-sm text-white"
              >
                {autoAssigning ? 'Generating…' : 'Generate Preview'}
              </button>
            </div>
          </div>
        </div>
      )}

      <datalist id="lab-preference-match-suggestions">
        {preferenceSuggestions.map(value => (
          <option key={`pref-suggestion-${value}`} value={value} />
        ))}
      </datalist>

      <datalist id="lab-preference-lab-suggestions">
        {labNameSuggestions.map(value => (
          <option key={`lab-suggestion-${value}`} value={value} />
        ))}
      </datalist>

      <datalist id="grid-subject-assign-suggestions">
        {manualAssignSuggestions.map(item => (
          <option key={`grid-assign-${item.req_id}`} value={item.label} />
        ))}
      </datalist>

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

      <div className="bg-slate-500/10 border-l-2 border-cyan-500 rounded px-3 py-2 mb-3">
        <p className="text-xs font-mono text-slate-400">
          <span className="text-cyan-300 font-bold">{totalHoursRequested} total hours</span>
          <span className="text-slate-600 mx-1">·</span>
          <span className="text-slate-500">{Math.ceil(totalHoursRequested / 150)} weeks</span>
          <span className="text-slate-600 mx-1">·</span>
          <span className="text-slate-500">@30h/lab/week</span>
        </p>
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
                  <div className="flex items-center gap-1 px-2 py-1 rounded bg-amber-700/20 text-amber-300 text-xs font-mono">
                    <Clock size={11} /> Pending
                  </div>
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
