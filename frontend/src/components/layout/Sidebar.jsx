import React from 'react';
import {
  FileText,
  PlusCircle,
  Search,
  Briefcase,
  ShieldCheck,
  Activity,
  BarChart3,
  FileSpreadsheet,
  Timer,
  Cpu,
  X,
  UserCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function Sidebar({
  activeTab,
  onSelectTab,
  apiHealth,
  isMobileOpen,
  onCloseMobile,
}) {
  const { user, isCitizen, isStaff, isAdmin } = useAuth();

  // Define Navigation Sections based on Role
  let operationalItems = [];
  if (isCitizen) {
    operationalItems = [
      { id: 'citizen_dashboard', label: 'My Complaints', icon: FileText },
      { id: 'submit_complaint', label: 'Submit Complaint', icon: PlusCircle },
      { id: 'track', label: 'Track Complaint', icon: Search },
    ];
  } else if (isStaff) {
    operationalItems = [
      { id: 'staff_workspace', label: 'Staff Workspace', icon: Briefcase },
      { id: 'track', label: 'Inspect Complaint', icon: Search },
    ];
  } else if (isAdmin) {
    operationalItems = [
      { id: 'admin_dashboard', label: 'Operations Console', icon: ShieldCheck },
      { id: 'operational_analytics', label: 'Operational Telemetry', icon: Activity },
      { id: 'track', label: 'Inspect Complaint', icon: Search },
    ];
  }

  // Cross-cutting Historical and ML Intelligence
  const intelligenceItems = [
    { id: 'predict', label: 'Resolution Estimator', icon: Timer },
    { id: 'historical_analytics', label: 'Historical Analytics', icon: BarChart3, badge: '50k' },
    { id: 'historical_complaints', label: 'Historical Archive', icon: FileSpreadsheet },
    { id: 'model-info', label: 'Model Governance', icon: Cpu },
  ];

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-[#19352E]/60 z-40 lg:hidden backdrop-blur-xs"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Sidebar container */}
      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-[#19352E] text-white flex flex-col justify-between border-r border-[#254A40] transition-transform duration-200 ease-in-out lg:translate-x-0 ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="overflow-y-auto">
          {/* Brand header */}
          <div className="h-16 px-6 flex items-center justify-between border-b border-[#254A40]/80">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-md bg-[#254A40] border border-[#C59A52]/40 flex items-center justify-center text-[#F5F3ED] font-serif text-lg font-bold">
                U
              </div>
              <div>
                <h1 className="text-sm font-semibold tracking-tight text-white leading-tight">
                  Urban Resolution
                </h1>
                <p className="text-[11px] text-[#DCDDD4]/70 tracking-wide font-sans">
                  Operations & ML Platform
                </p>
              </div>
            </div>

            {/* Mobile close */}
            <button
              type="button"
              onClick={onCloseMobile}
              className="lg:hidden text-[#DCDDD4] hover:text-white p-1 rounded-md cursor-pointer"
              aria-label="Close navigation"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* User Profile Mini Banner */}
          <div className="px-5 py-3 border-b border-[#254A40]/50 bg-[#152c26]/60 flex items-center justify-between">
            <div className="truncate">
              <div className="text-xs font-semibold text-white truncate">
                {user?.full_name || 'Citizen User'}
              </div>
              <div className="text-[11px] text-[#C59A52] font-medium capitalize">
                {user?.role === 'admin'
                  ? 'Operations Manager'
                  : user?.role === 'staff'
                  ? `${user?.department || 'Staff'} Officer`
                  : 'Citizen / Public'}
              </div>
            </div>
            <UserCheck className="w-4 h-4 text-[#C59A52] shrink-0 ml-2" />
          </div>

          {/* Navigation Links */}
          <nav className="p-4 space-y-4" aria-label="Main Navigation">
            {/* Section 1: Active Role Operational Management */}
            <div>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#C59A52]">
                {isCitizen && 'Citizen Portal'}
                {isStaff && `${user?.department || 'Department'} Queue`}
                {isAdmin && 'Operational Command'}
              </div>
              <div className="space-y-1 mt-1">
                {operationalItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelectTab(item.id);
                        if (onCloseMobile) onCloseMobile();
                      }}
                      className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-md text-xs font-medium transition-colors text-left cursor-pointer ${
                        isActive
                          ? 'bg-[#254A40] text-white shadow-xs font-semibold'
                          : 'text-[#DCDDD4]/80 hover:bg-[#254A40]/40 hover:text-white'
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#C59A52]' : 'text-[#DCDDD4]/60'}`} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Historical Intelligence & Model Governance */}
            <div>
              <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#DCDDD4]/50">
                Historical Archive & AI
              </div>
              <div className="space-y-1 mt-1">
                {intelligenceItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onSelectTab(item.id);
                        if (onCloseMobile) onCloseMobile();
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-md text-xs font-medium transition-colors text-left cursor-pointer ${
                        isActive
                          ? 'bg-[#254A40] text-white shadow-xs font-semibold'
                          : 'text-[#DCDDD4]/80 hover:bg-[#254A40]/40 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate">
                        <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#C59A52]' : 'text-[#DCDDD4]/60'}`} />
                        <span className="truncate">{item.label}</span>
                      </div>
                      {item.badge && (
                        <span className="text-[10px] bg-[#254A40] text-[#DCDDD4] px-1.5 py-0.5 rounded font-mono">
                          {item.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </nav>
        </div>

        {/* Footer info & API status */}
        <div className="p-4 border-t border-[#254A40]/80 bg-[#152c26] shrink-0">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-[#DCDDD4]/60">Operational API</span>
            <span
              className={`inline-flex items-center gap-1.5 font-medium ${
                apiHealth?.success ? 'text-emerald-400' : 'text-amber-400'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  apiHealth?.success ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              {apiHealth?.success ? 'Online' : 'Offline'}
            </span>
          </div>

          <div className="text-[11px] text-[#DCDDD4]/60 space-y-1">
            <p className="flex justify-between">
              <span>Database:</span>
              <span className="font-mono text-white/90">SQLite (WAL)</span>
            </p>
            <p className="flex justify-between">
              <span>Model:</span>
              <span className="font-mono text-white/90">LightGBM_L2</span>
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
