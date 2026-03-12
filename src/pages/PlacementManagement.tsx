import { useState, useEffect } from 'react';
import { Briefcase, Plus, Users, CheckSquare, Square, Trash2, Filter } from 'lucide-react';
import { Class, Department } from '../types';

export default function PlacementManagement() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [depts, setDepts] = useState<Department[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<number[]>([]);
  const [hours, setHours] = useState(3);
  const [placementBlocks, setPlacementBlocks] = useState<any[]>([]);
  
  const [filterYear, setFilterYear] = useState<number | 'all'>('all');
  const [filterDept, setFilterDept] = useState<number | 'all'>('all');

  useEffect(() => {
    fetch('/api/classes').then(res => res.json()).then(setClasses);
    fetch('/api/departments').then(res => res.json()).then(setDepts);
    fetch('/api/placement/blocks').then(res => res.json()).then(setPlacementBlocks);
  }, []);

  const filteredClasses = classes.filter(c => {
    const yearMatch = filterYear === 'all' || c.year === filterYear;
    const deptMatch = filterDept === 'all' || c.dept_id === filterDept;
    return yearMatch && deptMatch;
  });

  const toggleClass = (id: number) => {
    if (selectedClasses.includes(id)) {
      setSelectedClasses(selectedClasses.filter(x => x !== id));
    } else {
      setSelectedClasses([...selectedClasses, id]);
    }
  };

  const handleAddPlacement = async () => {
    if (selectedClasses.length === 0) return;
    
    const res = await fetch('/api/placement/blocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Placement Training',
        hours: hours,
        class_ids: selectedClasses
      })
    });

    if (res.ok) {
      fetch('/api/placement/blocks').then(res => res.json()).then(setPlacementBlocks);
      setSelectedClasses([]);
      alert(`Placement block added successfully.`);
    } else {
      const err = await res.json();
      alert(err.error || 'Failed to add placement block');
    }
  };

  const handleDeleteBlock = async (id: number) => {
    const res = await fetch(`/api/placement/blocks/${id}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      setPlacementBlocks(placementBlocks.filter(b => b.id !== id));
    }
  };

  const handleRemoveClassFromBlock = async (blockId: number, classId: number) => {
    const res = await fetch(`/api/placement/blocks/${blockId}/classes/${classId}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      fetch('/api/placement/blocks').then(res => res.json()).then(setPlacementBlocks);
    }
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
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-300">Select Classes</span>
                <button 
                  onClick={() => {
                    const filteredIds = filteredClasses.map(c => c.id);
                    const allFilteredSelected = filteredIds.every(id => selectedClasses.includes(id));
                    if (allFilteredSelected) {
                      setSelectedClasses(selectedClasses.filter(id => !filteredIds.includes(id)));
                    } else {
                      setSelectedClasses([...new Set([...selectedClasses, ...filteredIds])]);
                    }
                  }}
                  className="text-[10px] font-mono text-cyan-500 uppercase hover:text-cyan-400"
                >
                  {filteredClasses.length > 0 && filteredClasses.every(c => selectedClasses.includes(c.id)) ? 'Deselect Filtered' : 'Select Filtered'}
                </button>
              </div>

              {/* Filters */}
              <div className="grid grid-cols-2 gap-2 p-3 bg-[#0a0e17] border border-[#1e2d47] rounded-lg">
                <div className="space-y-1">
                  <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest flex items-center gap-1">
                    <Filter size={10} /> Year
                  </label>
                  <select 
                    className="w-full bg-[#141c2e] border border-[#1e2d47] rounded p-1 text-xs outline-none"
                    value={filterYear}
                    onChange={e => setFilterYear(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                  >
                    <option value="all">All Years</option>
                    <option value={1}>1st Year</option>
                    <option value={2}>2nd Year</option>
                    <option value={3}>3rd Year</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-mono text-slate-500 uppercase tracking-widest flex items-center gap-1">
                    <Filter size={10} /> Dept
                  </label>
                  <select 
                    className="w-full bg-[#141c2e] border border-[#1e2d47] rounded p-1 text-xs outline-none"
                    value={filterDept}
                    onChange={e => setFilterDept(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
                  >
                    <option value="all">All Depts</option>
                    {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            
            <div className="bg-[#0a0e17] border border-[#1e2d47] rounded-lg max-h-60 overflow-y-auto p-2 space-y-1 custom-scrollbar">
              {filteredClasses.map(c => (
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
                  <div>
                    <div className="text-sm font-medium">{c.name}</div>
                    <div className="text-[9px] font-mono text-slate-500 uppercase">{c.dept_name} • Year {c.year}</div>
                  </div>
                </div>
              ))}
              {filteredClasses.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-600 font-mono italic">
                  No classes match the filters
                </div>
              )}
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
            <h3 className="text-sm font-mono font-bold text-slate-500 uppercase tracking-widest">Assigned Blocks</h3>
          </div>

          <div className="space-y-4">
            {placementBlocks.map(block => (
              <div key={block.id} className="bg-[#0f1623] border border-[#1e2d47] p-6 rounded-xl space-y-4">
                <div className="flex flex-wrap gap-2">
                  {block.classes?.map((c: Class) => (
                    <div key={c.id} className="group relative px-2 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded text-[10px] font-mono text-cyan-400 flex items-center gap-2">
                      {c.name}
                      <button 
                        onClick={() => handleRemoveClassFromBlock(block.id, c.id)}
                        className="text-red-400 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove class from block"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                <div className="bg-[#141c2e] p-4 rounded-lg flex justify-between items-center border border-[#1e2d47]">
                  <div>
                    <div className="font-bold text-white">{block.name}</div>
                    <div className="text-[10px] text-slate-500 font-mono">{block.hours} continuous hours/week</div>
                  </div>
                  <button 
                    onClick={() => handleDeleteBlock(block.id)}
                    className="text-slate-600 hover:text-red-400 transition-colors p-2 hover:bg-red-400/10 rounded-lg"
                    title="Delete block and clear slots"
                  >
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
