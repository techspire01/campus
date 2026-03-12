import { useState, useEffect } from 'react';
import { Briefcase, Plus, Users, CheckSquare, Square, Trash2 } from 'lucide-react';
import { Class } from '../types';

export default function PlacementManagement() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<number[]>([]);
  const [hours, setHours] = useState(3);
  const [placementBlocks, setPlacementBlocks] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/classes').then(res => res.json()).then(setClasses);
    // In a real app, fetch existing placement blocks
  }, []);

  const toggleClass = (id: number) => {
    if (selectedClasses.includes(id)) {
      setSelectedClasses(selectedClasses.filter(x => x !== id));
    } else {
      setSelectedClasses([...selectedClasses, id]);
    }
  };

  const handleAddPlacement = () => {
    if (selectedClasses.length === 0) return;
    
    const newBlock = {
      id: Date.now(),
      classes: classes.filter(c => selectedClasses.includes(c.id)),
      hours: hours
    };
    
    setPlacementBlocks([...placementBlocks, newBlock]);
    setSelectedClasses([]);
    alert(`Placement block of ${hours} hours added for ${selectedClasses.length} classes.`);
  };

  return (
    <div className="space-y-12">
      <header className="flex justify-between items-end border-b border-[#1e2d47] pb-6">
        <div>
          <h1 className="text-4xl font-mono font-bold text-white tracking-tighter uppercase">Placement Cell Schedule</h1>
          <p className="text-slate-500 mt-2">Assign placement training blocks and regenerate schedules.</p>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Selection Panel */}
        <section className="bg-[#0f1623] border border-[#1e2d47] rounded-xl overflow-hidden">
          <div className="bg-[#141c2e] px-6 py-4 border-b border-[#1e2d47] flex items-center gap-3">
            <Briefcase className="text-cyan-400" size={20} />
            <h2 className="font-mono font-bold text-white uppercase tracking-wider">Placement Subjects</h2>
          </div>
          <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-slate-300">Select Classes</span>
              <button 
                onClick={() => setSelectedClasses(selectedClasses.length === classes.length ? [] : classes.map(c => c.id))}
                className="text-[10px] font-mono text-cyan-500 uppercase hover:text-cyan-400"
              >
                {selectedClasses.length === classes.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            
            <div className="bg-[#0a0e17] border border-[#1e2d47] rounded-lg max-h-60 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {classes.map(c => (
                <div 
                  key={c.id} 
                  onClick={() => toggleClass(c.id)}
                  className="flex items-center gap-3 p-2 hover:bg-[#141c2e] rounded cursor-pointer transition-colors group"
                >
                  {selectedClasses.includes(c.id) ? (
                    <CheckSquare size={18} className="text-cyan-500" />
                  ) : (
                    <Square size={18} className="text-slate-600 group-hover:text-slate-400" />
                  )}
                  <span className="text-sm font-medium">{c.name}</span>
                </div>
              ))}
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Hours/Week</label>
              <input 
                type="number"
                className="w-full bg-[#0a0e17] border border-[#1e2d47] rounded p-3 text-sm outline-none focus:border-cyan-500"
                value={hours || ''}
                onChange={e => setHours(parseInt(e.target.value) || 0)}
              />
            </div>

            <button 
              onClick={handleAddPlacement}
              className="w-full bg-cyan-700 hover:bg-cyan-600 text-white font-mono font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-all"
            >
              <Plus size={18} /> Add Placement Block
            </button>
          </div>
        </section>

        {/* Assigned Blocks */}
        <section className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-sm font-mono font-bold text-slate-500 uppercase tracking-widest">Assigned Blocks for selected classes</h3>
            {placementBlocks.length > 0 && (
              <button 
                onClick={() => setPlacementBlocks([])}
                className="flex items-center gap-2 text-[10px] font-mono text-red-400 uppercase bg-red-400/10 px-3 py-1 rounded border border-red-400/20"
              >
                <Trash2 size={12} /> Remove All
              </button>
            )}
          </div>

          <div className="space-y-4">
            {placementBlocks.map(block => (
              <div key={block.id} className="bg-[#0f1623] border border-[#1e2d47] p-6 rounded-xl space-y-4">
                <div className="space-y-1">
                  {block.classes.map((c: Class) => (
                    <div key={c.id} className="text-sm font-bold text-white">{c.name}</div>
                  ))}
                </div>
                <div className="bg-[#141c2e] p-4 rounded-lg flex justify-between items-center border border-[#1e2d47]">
                  <div>
                    <div className="font-bold text-white">Placement Training</div>
                    <div className="text-[10px] text-slate-500 font-mono">{block.hours} continuous hours/week</div>
                  </div>
                  <button className="text-slate-600 hover:text-red-400 transition-colors">
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            ))}
            {placementBlocks.length === 0 && (
              <div className="p-12 border-2 border-dashed border-[#1e2d47] rounded-xl flex flex-col items-center justify-center text-slate-600">
                <Briefcase size={48} className="mb-4 opacity-20" />
                <p className="font-mono text-xs uppercase tracking-widest">No placement blocks defined</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
