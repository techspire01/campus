import React, { Fragment, useEffect, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors
} from '@dnd-kit/core';
import { ArrowLeft, GripVertical, Lock } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate, useParams } from 'react-router-dom';

import { Class } from '../types';

type PreviewAssignment = {
  class_id: number;
  day_order: number;
  start_period: number;
  periods: number[];
  segment: 'morning' | 'afternoon';
};

type PreviewPayload = {
  assignments: PreviewAssignment[];
  blocked_by_subjects: Record<string, Array<{ day_order: number; period: number }>>;
  periods_per_day: number;
  hours: number;
};

type ActiveDrag = {
  classId: number;
} | null;

function toSlotKey(day: number, period: number) {
  return `${day}-${period}`;
}

function DraggablePlacement({ classId }: { classId: number }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `preview-${classId}`,
    data: { classId }
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={clsx(
        'h-full w-full rounded border border-emerald-500/40 bg-emerald-500/10 text-emerald-300 flex items-center justify-center gap-1 text-[10px] font-mono uppercase tracking-wider cursor-grab active:cursor-grabbing',
        isDragging && 'opacity-50'
      )}
    >
      <GripVertical size={12} /> Placement
    </div>
  );
}

function DroppableCell({
  classId,
  day,
  period,
  disabled,
  children
}: {
  classId: number;
  day: number;
  period: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop-${classId}-${day}-${period}`,
    data: { classId, day, period },
    disabled
  });

  return (
    <td ref={setNodeRef} className={clsx('border border-[#1e2d47] p-1 h-10', isOver && !disabled && 'bg-cyan-500/20')}>
      {children}
    </td>
  );
}

export default function PlacementPreview() {
  const navigate = useNavigate();
  const { blockId } = useParams();
  const resolvedBlockId = Number(blockId);

  const [block, setBlock] = useState<any | null>(null);
  const [assignments, setAssignments] = useState<PreviewAssignment[]>([]);
  const [blockedBySubjects, setBlockedBySubjects] = useState<Record<number, Set<string>>>({});
  const [periodsPerDay, setPeriodsPerDay] = useState(6);
  const [hours, setHours] = useState(2);
  const [activeDrag, setActiveDrag] = useState<ActiveDrag>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    })
  );

  const loadPage = async () => {
    const [blocksRes, previewRes] = await Promise.all([
      fetch('/api/placement/blocks'),
      fetch(`/api/placement/blocks/${resolvedBlockId}/preview`)
    ]);

    if (!blocksRes.ok) {
      throw new Error('Unable to load placement blocks');
    }

    const blocks = await blocksRes.json();
    const found = blocks.find((b: any) => b.id === resolvedBlockId);
    if (!found) {
      throw new Error('Placement block not found');
    }
    setBlock(found);

    if (previewRes.status === 400) {
      // No preview exists yet; create it now.
      const gen = await fetch(`/api/placement/blocks/${resolvedBlockId}/generate-preview`, { method: 'POST' });
      if (!gen.ok) {
        const err = await gen.json();
        throw new Error(err.error || 'Failed to generate preview');
      }
      const generated = (await gen.json()) as PreviewPayload;
      hydratePreview(generated);
      return;
    }

    if (!previewRes.ok) {
      const err = await previewRes.json();
      throw new Error(err.error || 'Failed to load preview');
    }

    const payload = (await previewRes.json()) as PreviewPayload;
    if (!payload.assignments || payload.assignments.length === 0) {
      const gen = await fetch(`/api/placement/blocks/${resolvedBlockId}/generate-preview`, { method: 'POST' });
      if (!gen.ok) {
        const err = await gen.json();
        throw new Error(err.error || 'Failed to generate preview');
      }
      const generated = (await gen.json()) as PreviewPayload;
      hydratePreview(generated);
      return;
    }

    hydratePreview(payload);
  };

  const hydratePreview = (payload: PreviewPayload) => {
    setAssignments(payload.assignments || []);
    setPeriodsPerDay(Number(payload.periods_per_day || 6));
    setHours(Number(payload.hours || 2));

    const blocked: Record<number, Set<string>> = {};
    for (const [classIdRaw, slots] of Object.entries(payload.blocked_by_subjects || {})) {
      const classId = Number(classIdRaw);
      blocked[classId] = new Set(slots.map(s => toSlotKey(Number(s.day_order), Number(s.period))));
    }
    setBlockedBySubjects(blocked);
  };

  useEffect(() => {
    if (!resolvedBlockId) return;
    loadPage().catch((e: any) => {
      alert(e.message || 'Failed to open preview page');
      navigate('/placement');
    });
  }, [resolvedBlockId]);

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as { classId: number } | undefined;
    if (!data) return;
    setActiveDrag({ classId: data.classId });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveDrag(null);

    const { over, active } = event;
    if (!over) return;

    const dragData = active.data.current as { classId: number } | undefined;
    const dropData = over.data.current as { classId: number; day: number; period: number } | undefined;

    if (!dragData || !dropData) return;
    if (dragData.classId !== dropData.classId) return;

    const classId = dragData.classId;
    const blocked = blockedBySubjects[classId] || new Set<string>();
    const newStart = Number(dropData.period);
    const periods = Array.from({ length: hours }, (_, idx) => newStart + idx);

    if (periods[periods.length - 1] > periodsPerDay) {
      alert('Cannot drop here. Placement exceeds periods per day.');
      return;
    }

    if (periods.some(p => blocked.has(toSlotKey(Number(dropData.day), p)))) {
      alert('Cannot drop here. This placement conflicts with an existing subject slot.');
      return;
    }

    setAssignments(prev =>
      prev.map(a =>
        a.class_id === classId
          ? {
              ...a,
              day_order: Number(dropData.day),
              start_period: newStart,
              periods
            }
          : a
      )
    );
  };

  const handleFixSlots = async () => {
    const res = await fetch(`/api/placement/blocks/${resolvedBlockId}/fix-slots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignments })
    });

    if (!res.ok) {
      let message = 'Failed to fix placement slots';
      try {
        const err = await res.json();
        message = err.error || message;
      } catch {
        // keep default
      }
      alert(message);
      return;
    }

    alert('Slots fixed and moved to main timetable. Preview cleared.');
    navigate('/placement');
  };

  if (!block) {
    return <div className="text-cyan-400 font-mono">Loading placement preview...</div>;
  }

  return (
    <div className="space-y-6">
      <header className="border-b border-[#1e2d47] pb-4 flex items-center justify-between gap-3">
        <div>
          <button onClick={() => navigate('/placement')} className="mb-3 text-xs text-cyan-400 font-mono flex items-center gap-1">
            <ArrowLeft size={14} /> Back to Placement
          </button>
          <h1 className="text-3xl font-mono font-bold text-white uppercase tracking-tight">Placement Preview</h1>
          <p className="text-slate-500 text-sm mt-1">{block.name} - drag and drop, then fix slots to apply everywhere.</p>
        </div>
        <button
          onClick={handleFixSlots}
          className="px-4 py-2 bg-cyan-700 hover:bg-cyan-600 text-white text-xs font-mono uppercase rounded-lg flex items-center gap-1"
        >
          <Lock size={14} /> Fix Slots
        </button>
      </header>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {block.classes?.map((cls: Class) => {
            const assignment = assignments.find(a => a.class_id === cls.id);
            if (!assignment) return null;

            const blocked = blockedBySubjects[cls.id] || new Set<string>();
            return (
              <section key={`grid-${cls.id}`} className="bg-[#0a0e17] border border-[#1e2d47] rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-mono text-cyan-400 uppercase tracking-wider">{cls.name}</h3>
                  <span className="text-[10px] font-mono text-slate-500 uppercase">{assignment.segment} block</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse min-w-[520px]">
                    <thead>
                      <tr>
                        <th className="text-left text-[10px] font-mono text-slate-500 uppercase p-2 border border-[#1e2d47]">Day</th>
                        {Array.from({ length: periodsPerDay }, (_, idx) => idx + 1).map(period => (
                          <th
                            key={`head-${cls.id}-${period}`}
                            className="text-center text-[10px] font-mono text-slate-500 uppercase p-2 border border-[#1e2d47]"
                          >
                            P{period}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[1, 2, 3, 4, 5, 6].map(day => (
                        <tr key={`row-${cls.id}-${day}`}>
                          <td className="border border-[#1e2d47] p-2 text-[10px] font-mono text-white">Day {day}</td>
                          {Array.from({ length: periodsPerDay }, (_, idx) => idx + 1).map(period => {
                            const key = toSlotKey(day, period);
                            const isBlocked = blocked.has(key);
                            const isAssigned = assignment.day_order === day && assignment.periods.includes(period);
                            const isStart = isAssigned && assignment.periods[0] === period;

                            return (
                              <Fragment key={`cell-${cls.id}-${day}-${period}`}>
                                <DroppableCell classId={cls.id} day={day} period={period} disabled={isBlocked}>
                                  {isBlocked ? (
                                    <div className="h-full w-full rounded bg-red-500/10 border border-red-500/20 text-[9px] font-mono text-red-400 flex items-center justify-center">
                                      Busy
                                    </div>
                                  ) : isStart ? (
                                    <DraggablePlacement classId={cls.id} />
                                  ) : isAssigned ? (
                                    <div className="h-full w-full rounded bg-emerald-500/10 border border-emerald-500/30" />
                                  ) : (
                                    <div className="h-full w-full rounded bg-[#0f1623] border border-dashed border-[#1e2d47]" />
                                  )}
                                </DroppableCell>
                              </Fragment>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>

        <DragOverlay>
          {activeDrag ? (
            <div className="rounded border border-emerald-500/50 bg-emerald-500/20 px-3 py-2 text-[10px] font-mono uppercase tracking-wider text-emerald-300">
              Placement
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
