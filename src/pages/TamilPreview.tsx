import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Edit, RotateCcw } from 'lucide-react';
import { clsx } from 'clsx';

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

interface DragState {
  sourceDay: number;
  sourcePeriod: number;
  classId: number;
}

export default function TamilPreview() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [slots, setSlots] = useState<TamilSlot[]>([]);
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

  const loadPreview = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/tamil/preview/${sessionId}`);
      const data = await res.json();
      setSlots(data);
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
    const slot = slots.find(s => s.class_id === classId && s.day_order === day && s.period === period);
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

    const sourceSlot = slots.find(
      s => s.class_id === dragState.classId && s.day_order === dragState.sourceDay && s.period === dragState.sourcePeriod
    );
    if (!sourceSlot) return;

    const targetSlot = slots.find(s => s.class_id === classId && s.day_order === targetDay && s.period === targetPeriod);
    if (!targetSlot && !(targetDay !== dragState.sourceDay || targetPeriod !== dragState.sourcePeriod)) return;

    // Move the slot
    const updated = slots.filter(s => !(s.class_id === dragState.classId && s.day_order === dragState.sourceDay && s.period === dragState.sourcePeriod));
    updated.push({
      ...sourceSlot,
      day_order: targetDay,
      period: targetPeriod,
    });
    setSlots(updated);
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

  const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const classGroups = new Map<number, TamilSlot[]>();
  
  for (const slot of slots) {
    if (!classGroups.has(slot.class_id)) {
      classGroups.set(slot.class_id, []);
    }
    classGroups.get(slot.class_id)!.push(slot);
  }

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
        {Array.from(classGroups.entries()).map(([classId, classSlots]) => (
          <section key={classId} className="bg-[#0f1623] border border-[#1e2d47] rounded-xl p-6">
            <div className="text-sm font-mono text-slate-400 mb-4 flex justify-between">
              <span>Class: {classSlots[0]?.class_name || `Class ${classId}`}</span>
              <span>Assigned: {classSlots.length} slots</span>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1e2d47]">
                    <th className="px-4 py-2 text-left text-[10px] font-mono text-slate-500 uppercase">Period</th>
                    {dayNames.map((day, idx) => (
                      <th key={idx} className="px-4 py-2 text-center text-[10px] font-mono text-slate-500 uppercase">
                        {day}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(period => (
                    <tr key={period} className="border-b border-[#1e2d47]">
                      <td className="px-4 py-2 text-xs font-mono text-slate-400 bg-[#141c2e]">{period}</td>
                      {dayNames.map((_, dayIdx) => {
                        const dayOrder = dayIdx + 1;
                        const slot = classSlots.find(s => s.day_order === dayOrder && s.period === period);
                        return (
                          <td
                            key={`${dayOrder}-${period}`}
                            className="px-2 py-2 text-center"
                            draggable={isEditing && !!slot}
                            onDragStart={(e) => slot && handleDragStart(e, dayOrder, period, classId)}
                            onDragOver={isEditing && !slot ? (e) => handleDragOver(e as any) : undefined}
                            onDrop={isEditing ? (e) => handleDrop(e, dayOrder, period, classId) : undefined}
                            style={{
                              cursor: isEditing && slot ? 'grab' : isEditing ? 'pointer' : 'default',
                              backgroundColor: slot ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                              border: slot ? '1px solid rgba(16, 185, 129, 0.3)' : 'none',
                            }}
                          >
                            {slot ? (
                              <div className="bg-emerald-500/30 border border-emerald-500/60 rounded p-1 text-emerald-300 text-xs font-mono">
                                Tamil
                              </div>
                            ) : (
                              <div className="text-slate-700 text-xs">-</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="mt-4 text-[10px] font-mono text-slate-500">
              Total hours/week: {classSlots.length} | Staff count: {new Set(classSlots.map(s => s.staff_id)).size}
            </div>
          </section>
        ))}
      </div>

      {slots.length === 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-center">
          <p className="text-sm text-amber-300 font-mono">No Tamil slots scheduled for this session.</p>
        </div>
      )}
    </div>
  );
}
