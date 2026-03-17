import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  BookOpen, 
  Calendar, 
  FlaskConical, 
  Briefcase, 
  Settings as SettingsIcon,
  Menu,
  X,
  ChevronRight,
  GraduationCap,
  Building2
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Pages
import AdminDashboard from './pages/AdminDashboard';
import DepartmentDashboard from './pages/DepartmentDashboard';
import ClassDetails from './pages/ClassDetails';
import StaffTimetable from './pages/StaffTimetable';
import StudentTimetable from './pages/StudentTimetable';
import LabManagement from './pages/labs/LabManagement';
import LabRequests from './pages/labs/LabRequests';
import LabTimetable from './pages/labs/LabTimetable';
import PlacementManagement from './pages/PlacementManagement';
import PlacementPreview from './pages/PlacementPreview';
import TamilPreview from './pages/TamilPreview';
import GlobalTimetables from './pages/GlobalTimetables';
import CommonSubjects from './pages/CommonSubjects';

function cn(...inputs: any[]) {
  return twMerge(clsx(inputs));
}

function NavLink({ to, icon: Icon, children, active }: { to: string, icon: any, children: React.ReactNode, active?: boolean }) {
  return (
    <Link 
      to={to} 
      className={cn(
        "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group",
        active 
          ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-[0_0_15px_rgba(6,182,212,0.1)]" 
          : "text-slate-400 hover:bg-[#141c2e] hover:text-slate-200"
      )}
    >
      <Icon size={20} className={cn("transition-transform duration-200", active ? "scale-110" : "group-hover:scale-110")} />
      <span className="font-mono text-xs uppercase tracking-widest font-bold">{children}</span>
      {active && <ChevronRight size={14} className="ml-auto animate-pulse" />}
    </Link>
  );
}

function DepartmentsList() {
  const [depts, setDepts] = useState<any[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('/api/departments').then(res => res.json()).then(setDepts);
  }, []);

  return (
    <div className="space-y-8">
      <header className="border-b border-[#1e2d47] pb-6">
        <h1 className="text-4xl font-mono font-bold text-white tracking-tighter uppercase">Departments</h1>
        <p className="text-slate-500 mt-2">Select a department to manage its specific classes and faculty workload.</p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {depts.map(dept => (
          <div 
            key={dept.id} 
            onClick={() => navigate(`/department/${dept.id}`)}
            className="bg-[#0f1623] border border-[#1e2d47] p-6 rounded-xl hover:border-cyan-500/50 cursor-pointer transition-all group"
          >
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-cyan-500/10 rounded-lg text-cyan-400 group-hover:scale-110 transition-transform">
                <Building2 size={24} />
              </div>
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest bg-[#141c2e] px-2 py-1 rounded">
                {dept.type}
              </span>
            </div>
            <h3 className="text-xl font-bold text-white mb-1 group-hover:text-cyan-400 transition-colors">{dept.name}</h3>
            <p className="text-xs text-slate-500 font-mono uppercase tracking-tighter">Code: {dept.code}</p>
            <div className="mt-6 flex items-center text-cyan-500 text-[10px] font-mono font-bold uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
              View Dashboard <ChevronRight size={12} className="ml-1" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AppContent() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div className="min-h-screen bg-[#0a0e17] text-slate-200 flex font-sans selection:bg-cyan-500/30">
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-[#0f1623] border-r border-[#1e2d47] transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0",
        !isSidebarOpen && "-translate-x-full"
      )}>
        <div className="h-full flex flex-col p-6">
          <div className="flex items-center gap-3 mb-10 px-2">
            <div className="w-10 h-10 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Calendar className="text-white" size={24} />
            </div>
            <div>
              <h2 className="text-xl font-mono font-black text-white tracking-tighter leading-none">CAMPUS<span className="text-cyan-500">GRID</span></h2>
              <p className="text-[8px] font-mono text-slate-500 uppercase tracking-[0.3em] mt-1">Timetable Engine</p>
            </div>
          </div>

          <nav className="flex-1 space-y-2">
            <NavLink to="/admin" icon={LayoutDashboard} active={isActive('/admin')}>Admin Panel</NavLink>
            <NavLink to="/departments" icon={Building2} active={isActive('/departments') || isActive('/department')}>Departments</NavLink>
            <NavLink to="/common" icon={BookOpen} active={isActive('/common')}>Common Subjects</NavLink>
            <NavLink to="/labs" icon={FlaskConical} active={isActive('/labs') && !isActive('/labs/requests')}>Lab Management</NavLink>
            <NavLink to="/labs/requests" icon={FlaskConical} active={isActive('/labs/requests')}>Lab Requests</NavLink>
            <NavLink to="/placement" icon={Briefcase} active={isActive('/placement')}>Placement Cell</NavLink>
            <NavLink to="/timetables" icon={Calendar} active={isActive('/timetables')}>Global View</NavLink>
          </nav>

          <div className="mt-auto pt-6 border-t border-[#1e2d47]">
            <div className="bg-[#141c2e] p-4 rounded-xl border border-[#1e2d47]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <SettingsIcon size={16} />
                </div>
                <div className="text-[10px] font-mono font-bold text-white uppercase tracking-wider">System Status</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-mono text-slate-400 uppercase">Engine Online</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-[#1e2d47] bg-[#0a0e17]/80 backdrop-blur-md sticky top-0 z-40 flex items-center justify-between px-8">
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="lg:hidden p-2 text-slate-400 hover:text-white"
          >
            {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          
          <div className="flex items-center gap-6">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-[#141c2e] rounded-full border border-[#1e2d47]">
              <div className="w-2 h-2 rounded-full bg-cyan-500" />
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Academic Year 2025-26</span>
            </div>
          </div>
        </header>

        <div className="flex-1 p-8 max-w-7xl mx-auto w-full">
          <Routes>
            <Route path="/" element={<AdminDashboard />} />
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/departments" element={<DepartmentsList />} />
            <Route path="/department/:id" element={<DepartmentDashboard />} />
            <Route path="/class/:id" element={<ClassDetails />} />
            <Route path="/common" element={<CommonSubjects />} />
            <Route path="/staff/:id" element={<StaffTimetable />} />
            <Route path="/student/:id" element={<StudentTimetable />} />
            <Route path="/labs" element={<LabManagement />} />
            <Route path="/labs/requests" element={<LabRequests />} />
            <Route path="/labs/:labId" element={<LabTimetable />} />
            <Route path="/placement" element={<PlacementManagement />} />
            <Route path="/placement/preview/:blockId" element={<PlacementPreview />} />
            <Route path="/tamil/preview/:sessionId" element={<TamilPreview />} />
            <Route path="/timetables" element={<GlobalTimetables />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}
