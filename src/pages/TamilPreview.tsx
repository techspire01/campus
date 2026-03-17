import { Fragment, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, CheckCircle, Edit, RotateCcw } from 'lucide-react';
import { clsx } from 'clsx';
import { Settings } from '../types';

interface TamilSlot {
  id?: number;
  class_id: number;
  class_name?: string;
  subject_id: number;
  staff_id: number | null;
  day_order: number;
  period: number;
  hours_per_week: number;
}

interface ExistingSlot {
  id: number;
  class_id: number;
  class_name?: string;
  subject_id: number | null;
  subject_name?: string;
  subject_code?: string;
  staff_id: number | null;
  staff_name?: string;
  lab_name?: string;
  day_order: number;
  period: number;
  type?: string | null;
}

interface DragState {
  sourceDay: number;
  sourcePeriod: number;
  classId: number;
}

export default function TamilPreview() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [previewSlots, setPreviewSlots] = useState<TamilSlot[]>([]);
  const [timetableSlots, setTimetableSlots] = useState<ExistingSlot[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [dragState, setDragState] = useState<DragState | null>(null);

  useEffect(() => {
    if (!sessionId) return;
    loadPreview();
  }, [sessionId]);

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(setSettings)
      .catch((err: any) => {
        setStatus({ type: 'error', msg: `Failed to load settings: ${err.message}` });
      });
  }, []);

  const loadPreview = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/tamil/preview/${sessionId}`);
      const data = await res.json();
      setPreviewSlots(Array.isArray(data?.previewSlots) ? data.previewSlots : []);
      setTimetableSlots(Array.isArray(data?.timetableSlots) ? data.timetableSlots : []);
    } catch (err: any) {
      setStatus({ type: 'error', msg: `Failed to load preview: ${err.message}` });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegenerate = async () => {
    if (!sessionId) return;
    setIsRegenerating(true);
    setProgress(0);
    setStatus(null);

    const progressInterval = setInterval(() => {
      setProgress(p => Math.min(p + Math.random() * 30, 90));
    }, 200);

    try {
      const res = await fetch(`/api/tamil/regenerate/${sessionId}`, { method: 'POST' });
      const data = await res.json();

      clearInterval(progressInterval);
      setProgress(100);

      if (!res.ok) {
        setStatus({ type: 'error', msg: data.error || 'Regeneration failed' });
        setIsRegenerating(false);
        return;
      }

      await loadPreview();
      setStatus({ type: 'success', msg: 'Timetable regenerated successfully!' });
      setHasChanges(false);
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.message });
    } finally {
      clearInterval(progressInterval);
      setProgress(0);
      setIsRegenerating(false);
    }
  };

  const handleDragStart = (e: DragEvent, day: number, period: number, classId: number) => {
    const slot = previewSlots.find(s => s.class_id === classId && s.day_order === day && s.period === period);
    if (!slot) return;
    
    setDragState({ sourceDay: day, sourcePeriod: period, classId });
    (e as any).dataTransfer!.effectAllowed = 'move';
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    (e as any).dataTransfer!.dropEffect = 'move';
  };

  const handleDrop = (e: DragEvent, targetDay: number, targetPeriod: number, classId: number) => {
    e.preventDefault();
    if (!dragState || dragState.classId !== classId) return;

    const sourceSlot = previewSlots.find(
      s => s.class_id === dragState.classId && s.day_order === dragState.sourceDay && s.period === dragState.sourcePeriod
    );
    if (!sourceSlot) return;

    const targetPreviewSlot = previewSlots.find(s => s.class_id === classId && s.day_order === targetDay && s.period === targetPeriod);
    const existingSlot = timetableSlots.find(s => s.class_id === classId && s.day_order === targetDay && s.period === targetPeriod);
    if (existingSlot || targetPreviewSlot) return;
    if (!(targetDay !== dragState.sourceDay || targetPeriod !== dragState.sourcePeriod)) return;

    // Move the slot
    const updated = previewSlots.filter(s => !(s.class_id === dragState.classId && s.day_order === dragState.sourceDay && s.period === dragState.sourcePeriod));
    updated.push({
      ...sourceSlot,
      day_order: targetDay,
      period: targetPeriod,
    });
    setPreviewSlots(updated);
    setHasChanges(true);
    setDragState(null);
  };

  const handleFix = async () => {
    setStatus(null);
    if (!sessionId) return;

    try {
      const res = await fetch(`/api/tamil/fix/${sessionId}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setStatus({ type: 'error', msg: data.error || 'Failed to fix slots' });
        return;
      }
      setStatus({ type: 'success', msg: 'Tamil slots finalized successfully!' });
      setHasChanges(false);
      setTimeout(() => navigate('/'), 2000);
    } catch (err: any) {
      setStatus({ type: 'error', msg: err.message });
    }
  };

  if (isLoading) {
    return <div className="text-cyan-400 font-mono p-8">Loading Tamil preview...</div>;
  }

  const days = [1, 2, 3, 4, 5, 6];
  const classGroups = new Map<number, { preview: TamilSlot[]; existing: ExistingSlot[]; className?: string }>();
  
  for (const slot of previewSlots) {
    if (!classGroups.has(slot.class_id)) {
      classGroups.set(slot.class_id, { preview: [], existing: [], className: slot.class_name });
    }
    const group = classGroups.get(slot.class_id)!;
    group.preview.push(slot);
    group.className = group.className || slot.class_name;
  }

  for (const slot of timetableSlots) {
    if (!classGroups.has(slot.class_id)) {
      classGroups.set(slot.class_id, { preview: [], existing: [], className: slot.class_name });
    }
    const group = classGroups.get(slot.class_id)!;
    group.existing.push(slot);
    group.className = group.className || slot.class_name;
  }

  if (!settings) {
    return <div className="text-cyan-400 font-mono p-8">Loading Tamil preview...</div>;
  }

  const periods = Array.from({ length: parseInt(settings.periods_per_day) }, (_, i) => i + 1);
  const breakAfter = parseInt(settings.break_after_period);
  const lunchAfter = parseInt(settings.lunch_after_period);

  return (
    <div className="space-y-8 p-8">
      <header className="flex justify-between items-center border-b border-[#1e2d47] pb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded hover:bg-[#1e2d47] transition-colors"
          >
            <ArrowLeft size={20} className="text-cyan-400" />
          </button>
          <div>
            <div className="text-[10px] font-mono text-cyan-500 uppercase tracking-[0.2em]">Tamil Timetable Preview</div>
            <h1 className="text-3xl font-mono font-bold text-white tracking-tighter uppercase">Schedule Review</h1>
          </div>
        </div>
        <div className="flex gap-2">
          {isEditing && (
            <button
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="px-4 py-2 rounded text-xs font-mono uppercase tracking-wider border transition-colors bg-orange-600 hover:bg-orange-500 border-orange-500 text-white"
            >
              <RotateCcw size={14} className="inline mr-2" />
              Regenerate
            </button>
          )}
          <button
            onClick={() => {
              setIsEditing(!isEditing);
              if (!isEditing) setHasChanges(true);
            }}
            className={clsx(
              'px-4 py-2 rounded text-xs font-mono uppercase tracking-wider border transition-colors',
              isEditing
                ? 'bg-orange-600 border-orange-500 text-white'
                : 'bg-[#141c2e] border-[#1e2d47] text-slate-300 hover:border-orange-500/40'
            )}
          >
            <Edit size={14} className="inline mr-2" />
            Edit
          </button>
          <button
            onClick={handleFix}
            disabled={!hasChanges}
            className={clsx(
              'px-4 py-2 rounded text-xs font-mono uppercase tracking-wider border transition-colors',
              hasChanges
                ? 'bg-emerald-600 hover:bg-emerald-500 border-emerald-500 text-white'
                : 'bg-[#141c2e] border-[#1e2d47] text-slate-500 cursor-not-allowed'
            )}
          >
            <CheckCircle size={14} className="inline mr-2" />
            Fix Timetable
          </button>
        </div>
      </header>

      {isRegenerating && (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-4">
          <div className="text-xs font-mono text-cyan-300 mb-2">Regenerating schedule...</div>
          <div className="h-2 bg-[#0a0e17] rounded-full overflow-hidden border border-cyan-500/30">
            <div
              className="h-full bg-cyan-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

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

      <div className="space-y-8">
        {Array.from(classGroups.entries()).map(([classId, classGroup]) => (
          <section key={classId} className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden shadow-2xl">
            <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47] flex justify-between items-center gap-4">
              <div className="flex items-center gap-3">
                <Calendar className="text-cyan-400" size={20} />
                <h2 className="font-mono font-bold text-white uppercase tracking-wider">
                  {classGroup.className || `Class ${classId}`} Schedule
                </h2>
              </div>
              <div className="text-sm font-mono text-slate-400">
                Assigned: {classGroup.preview.length} Tamil slots
              </div>
            </div>

            <div className="p-6 overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="p-3 text-left text-[10px] font-mono text-slate-500 uppercase border-b border-[#1e2d47]">Day Order</th>
                    {periods.map(period => (
                      <Fragment key={`period-header-${classId}-${period}`}>
                        <th className="p-3 text-center text-[10px] font-mono text-slate-500 uppercase border-b border-[#1e2d47]">
                          Period {period}
                        </th>
                        {period === breakAfter && (
                          <th className="p-3 text-center text-[10px] font-mono text-orange-500 uppercase border-b border-[#1e2d47] bg-orange-500/5">
                            Break
                          </th>
                        )}
                        {period === lunchAfter && (
                          <th className="p-3 text-center text-[10px] font-mono text-cyan-500 uppercase border-b border-[#1e2d47] bg-cyan-500/5">
                            Lunch
                          </th>
                        )}
                      </Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {days.map(day => (
                    <tr key={`row-${classId}-${day}`} className="border-b border-[#1e2d47]/50 hover:bg-[#141c2e]/30 transition-colors">
                      <td className="p-4 font-mono font-bold text-cyan-500">DAY {day}</td>
                      {periods.map(period => {
                        const previewSlot = classGroup.preview.find(s => s.day_order === day && s.period === period);
                        const existingSlot = classGroup.existing.find(s => s.day_order === day && s.period === period);
                        const isTamil = !!previewSlot;
                        const isOccupied = !!previewSlot || !!existingSlot;
                        const slotTitle = isTamil
                          ? 'Tamil'
                          : existingSlot?.type === 'placement'
                            ? 'PLACEMENT'
                            : existingSlot?.subject_name || '-';
                        const slotSubtext = isTamil
                          ? ''
                          : existingSlot?.type === 'placement'
                            ? 'TRAINING'
                            : existingSlot?.subject_code || '';
                        const slotMeta = isTamil
                          ? ''
                          : existingSlot?.lab_name || existingSlot?.staff_name || '';

                        return (
                          <Fragment key={`cell-${classId}-${day}-${period}`}>
                            <td
                              className={clsx(
                                'p-2 transition-colors',
                                isEditing && !isOccupied ? 'hover:bg-cyan-500/10' : ''
                              )}
                              onDragOver={isEditing && !isOccupied ? (e) => handleDragOver(e as any) : undefined}
                              onDrop={isEditing ? (e) => handleDrop(e, day, period, classId) : undefined}
                            >
                              {isOccupied ? (
                                <div
                                  draggable={isEditing && !!previewSlot}
                                  onDragStart={(e) => previewSlot && handleDragStart(e, day, period, classId)}
                                  className={clsx(
                                    'min-h-[80px] p-2 rounded border transition-all flex flex-col justify-center items-center text-center gap-1',
                                    isEditing && previewSlot ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
                                    isTamil
                                      ? 'bg-emerald-500/10 border-emerald-500/30 shadow-[inset_0_0_10px_rgba(16,185,129,0.05)]'
                                      : 'bg-cyan-500/5 border-cyan-500/20'
                                  )}
                                >
                                  <div className={clsx(
                                    'font-bold text-xs',
                                    isTamil || existingSlot?.type === 'placement' ? 'text-emerald-400' : 'text-white'
                                  )}>
                                    {slotTitle}
                                  </div>
                                  {slotSubtext && (
                                    <div className="text-[10px] text-cyan-400 font-mono">{slotSubtext}</div>
                                  )}
                                  {slotMeta && (
                                    <div className={clsx(
                                      'text-[9px]',
                                      existingSlot?.lab_name ? 'text-emerald-400 font-mono' : 'text-slate-500'
                                    )}>
                                      {slotMeta}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="min-h-[80px] p-2 rounded border border-dashed border-[#1e2d47] bg-[#0a0e17] flex items-center justify-center">
                                  <span className="text-[10px] font-mono text-slate-800 uppercase tracking-widest">-</span>
                                </div>
                              )}
                            </td>
                            {period === breakAfter && (
                              <td className="p-2">
                                <div className="min-h-[80px] p-2 rounded border border-orange-500/20 bg-orange-500/5 flex items-center justify-center">
                                  <span className="text-[10px] font-mono text-orange-500 uppercase tracking-[0.3em] rotate-90 md:rotate-0">Break</span>
                                </div>
                              </td>
                            )}
                            {period === lunchAfter && (
                              <td className="p-2">
                                <div className="min-h-[80px] p-2 rounded border border-cyan-500/20 bg-cyan-500/5 flex items-center justify-center">
                                  <span className="text-[10px] font-mono text-cyan-500 uppercase tracking-[0.3em] rotate-90 md:rotate-0">Lunch</span>
                                </div>
                              </td>
                            )}
                          </Fragment>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="mt-4 text-[10px] font-mono text-slate-500">
              Total hours/week: {classGroup.preview.length} | Staff count: {new Set(classGroup.preview.map(s => s.staff_id)).size}
            </div>
          </section>
        ))}
      </div>

      {previewSlots.length === 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-center">
          <p className="text-sm text-amber-300 font-mono">No Tamil slots scheduled for this session.</p>
        </div>
      )}
    </div>
  );
}
