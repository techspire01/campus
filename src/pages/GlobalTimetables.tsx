import React, { useState, useEffect, Fragment } from 'react';
import { Class, TimetableSlot, Settings } from '../types';
import { Search, Filter, Download, Calendar, GripVertical } from 'lucide-react';
import { clsx } from 'clsx';
import { 
  DndContext, 
  DragOverlay, 
  useSensor, 
  useSensors, 
  PointerSensor, 
  DragStartEvent, 
  DragEndEvent,
  useDraggable,
  useDroppable
} from '@dnd-kit/core';

interface DraggableSlotProps {
  slot: TimetableSlot;
  day: number;
  period: number;
}

function DraggableSlot({ slot, day, period }: DraggableSlotProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `slot-${day}-${period}`,
    data: { slot, day, period }
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    zIndex: 50,
  } : undefined;

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      {...listeners} 
      {...attributes}
      className={clsx(
        "min-h-[80px] p-2 rounded border transition-all flex flex-col justify-center items-center text-center gap-1 cursor-grab active:cursor-grabbing",
        isDragging ? "opacity-50" : "opacity-100",
        slot.type === 'placement'
          ? "bg-emerald-500/10 border-emerald-500/30 shadow-[inset_0_0_10px_rgba(16,185,129,0.05)]"
          : "bg-cyan-500/5 border-cyan-500/20"
      )}
    >
      <div className="absolute top-1 right-1 opacity-20 group-hover:opacity-100">
        <GripVertical size={10} />
      </div>
      <div className={clsx(
        "font-bold text-xs",
        slot.type === 'placement' ? "text-emerald-400" : "text-white"
      )}>
        {slot.type === 'placement' ? 'PLACEMENT' : slot.subject_name}
      </div>
      <div className="text-[10px] text-cyan-400 font-mono">{slot.type === 'placement' ? 'TRAINING' : slot.subject_code}</div>
      {slot.type !== 'placement' && <div className="text-[9px] text-slate-500">{slot.staff_name}</div>}
    </div>
  );
}

interface DroppableCellProps {
  day: number;
  period: number;
  children: React.ReactNode;
  isOccupied: boolean;
}

function DroppableCell({ day, period, children, isOccupied }: DroppableCellProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `cell-${day}-${period}`,
    data: { day, period },
    disabled: isOccupied
  });

  return (
    <td 
      ref={setNodeRef} 
      className={clsx(
        "p-2 transition-colors",
        isOver && !isOccupied ? "bg-cyan-500/20" : ""
      )}
    >
      {children}
    </td>
  );
}

export default function GlobalTimetables() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [timetable, setTimetable] = useState<TimetableSlot[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSlot, setActiveSlot] = useState<TimetableSlot | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    fetch('/api/classes').then(res => res.json()).then(data => {
      setClasses(data);
      if (data.length > 0) setSelectedClassId(data[0].id);
    });
    fetch('/api/settings').then(res => res.json()).then(setSettings);
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      fetch(`/api/timetable/${selectedClassId}`).then(res => res.json()).then(setTimetable);
    }
  }, [selectedClassId]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    setActiveSlot(active.data.current?.slot);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveSlot(null);

    if (over && active.id !== over.id) {
      const from = active.data.current as { day: number, period: number, slot: TimetableSlot };
      const to = over.data.current as { day: number, period: number };

      if (!selectedClassId) return;

      try {
        const res = await fetch('/api/timetable/move-slot', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            class_id: selectedClassId,
            from_day: from.day,
            from_period: from.period,
            to_day: to.day,
            to_period: to.period
          })
        });

        if (res.ok) {
          // Refresh timetable
          fetch(`/api/timetable/${selectedClassId}`).then(res => res.json()).then(setTimetable);
        } else {
          const err = await res.json();
          alert(err.error || "Failed to move slot");
        }
      } catch (error) {
        console.error("Error moving slot:", error);
      }
    }
  };

  const filteredClasses = classes.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.dept_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!settings) return <div className="text-cyan-400 font-mono">Loading timetables...</div>;

  const periods = Array.from({ length: parseInt(settings.periods_per_day) }, (_, i) => i + 1);
  const days = [1, 2, 3, 4, 5, 6];

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-[#1e2d47] pb-6 gap-4">
        <div>
          <h1 className="text-4xl font-mono font-bold text-white tracking-tighter uppercase">Global Timetables</h1>
          <p className="text-slate-500 mt-2">Browse and export timetables for all departments and classes.</p>
        </div>
        <div className="flex gap-3">
          <button className="bg-[#0f1623] border border-[#1e2d47] text-slate-400 hover:text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm transition-all">
            <Download size={18} /> Export PDF
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Class Selector */}
        <aside className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
            <input 
              placeholder="Search classes..." 
              className="w-full bg-[#0f1623] border border-[#1e2d47] rounded-lg pl-10 pr-4 py-2 text-sm outline-none focus:border-cyan-500"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden">
            <div className="max-h-[600px] overflow-y-auto custom-scrollbar">
              {filteredClasses.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedClassId(c.id)}
                  className={clsx(
                    "w-full text-left p-4 border-b border-[#1e2d47] transition-all hover:bg-[#141c2e]",
                    selectedClassId === c.id ? "bg-[#141c2e] border-l-4 border-l-cyan-500" : "bg-transparent"
                  )}
                >
                  <div className="font-bold text-white text-sm">{c.name}</div>
                  <div className="text-[10px] font-mono text-slate-500 uppercase">{c.dept_name}</div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* Timetable View */}
        <main className="lg:col-span-3 space-y-6">
          {selectedClassId ? (
            <div className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden shadow-2xl">
              <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47] flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <Calendar className="text-cyan-400" size={20} />
                  <h2 className="font-mono font-bold text-white uppercase tracking-wider">
                    {classes.find(c => c.id === selectedClassId)?.name} Schedule
                  </h2>
                </div>
              </div>
              <div className="p-6 overflow-x-auto">
                <DndContext 
                  sensors={sensors} 
                  onDragStart={handleDragStart} 
                  onDragEnd={handleDragEnd}
                >
                  <table className="w-full border-collapse">
                    <thead>
                      <tr key="header-row">
                        <th key="day-order-header" className="p-3 text-left text-[10px] font-mono text-slate-500 uppercase border-b border-[#1e2d47]">Day Order</th>
                        {periods.map(p => (
                          <Fragment key={`period-header-${p}`}>
                            <th className="p-3 text-center text-[10px] font-mono text-slate-500 uppercase border-b border-[#1e2d47]">
                              Period {p}
                            </th>
                            {p === parseInt(settings.break_after_period) && (
                              <th className="p-3 text-center text-[10px] font-mono text-orange-500 uppercase border-b border-[#1e2d47] bg-orange-500/5">
                                Break
                              </th>
                            )}
                            {p === parseInt(settings.lunch_after_period) && (
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
                        <tr key={`row-day-${day}`} className="border-b border-[#1e2d47]/50 hover:bg-[#141c2e]/30 transition-colors">
                          <td key={`label-day-${day}`} className="p-4 font-mono font-bold text-cyan-500">DAY {day}</td>
                          {periods.map(period => {
                            const slot = timetable.find(s => s.day_order === day && s.period === period);
                            return (
                              <Fragment key={`cell-${day}-${period}`}>
                                <DroppableCell 
                                  day={day} 
                                  period={period} 
                                  isOccupied={!!slot}
                                >
                                  {slot ? (
                                    <DraggableSlot slot={slot} day={day} period={period} />
                                  ) : (
                                    <div className="min-h-[80px] p-2 rounded border border-dashed border-[#1e2d47] bg-[#0a0e17] flex items-center justify-center">
                                      <span className="text-[10px] font-mono text-slate-800 uppercase tracking-widest">—</span>
                                    </div>
                                  )}
                                </DroppableCell>
                                {period === parseInt(settings.break_after_period) && (
                                  <td key={`break-${day}-${period}`} className="p-2">
                                    <div className="min-h-[80px] p-2 rounded border border-orange-500/20 bg-orange-500/5 flex items-center justify-center">
                                      <span className="text-[10px] font-mono text-orange-500 uppercase tracking-[0.3em] rotate-90 md:rotate-0">Break</span>
                                    </div>
                                  </td>
                                )}
                                {period === parseInt(settings.lunch_after_period) && (
                                  <td key={`lunch-${day}-${period}`} className="p-2">
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
                  <DragOverlay>
                    {activeSlot ? (
                      <div className={clsx(
                        "min-h-[80px] p-2 rounded border shadow-2xl flex flex-col justify-center items-center text-center gap-1 w-[120px]",
                        activeSlot.type === 'placement'
                          ? "bg-emerald-500/20 border-emerald-500/50"
                          : "bg-cyan-500/20 border-cyan-500/50"
                      )}>
                        <div className={clsx(
                          "font-bold text-xs",
                          activeSlot.type === 'placement' ? "text-emerald-400" : "text-white"
                        )}>
                          {activeSlot.type === 'placement' ? 'PLACEMENT' : activeSlot.subject_name}
                        </div>
                        <div className="text-[10px] text-cyan-400 font-mono">{activeSlot.type === 'placement' ? 'TRAINING' : activeSlot.subject_code}</div>
                      </div>
                    ) : null}
                  </DragOverlay>
                </DndContext>
              </div>
            </div>
          ) : (
            <div className="h-[400px] border-2 border-dashed border-[#1e2d47] rounded-xl flex items-center justify-center text-slate-600 font-mono uppercase tracking-widest">
              Select a class to view timetable
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
