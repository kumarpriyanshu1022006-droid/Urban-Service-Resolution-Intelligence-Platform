import React, { useState, useEffect } from 'react';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import Overview from './pages/Overview';
import PredictResolution from './pages/PredictResolution';
import Complaints from './pages/Complaints';
import Analytics from './pages/Analytics';
import ModelInformation from './pages/ModelInformation';
import LandingPage from './pages/LandingPage';

// Operational Platform Pages
import CitizenDashboard from './pages/CitizenDashboard';
import SubmitComplaint from './pages/SubmitComplaint';
import ComplaintTracking from './pages/ComplaintTracking';
import StaffWorkspace from './pages/StaffWorkspace';
import AdminDashboard from './pages/AdminDashboard';
import OperationalAnalytics from './pages/OperationalAnalytics';

import { AuthProvider, useAuth } from './context/AuthContext';
import { fetchHealth } from './services/api';

const PAGE_META = {
  // Citizen Views
  citizen_dashboard: {
    title: 'Citizen Service Workspace',
    subtitle: 'Track and manage your submitted service requests',
  },
  submit_complaint: {
    title: 'Submit New Service Request',
    subtitle: 'File a municipal service request with instant AI resolution estimate',
  },
  track: {
    title: 'Track Complaint Status',
    subtitle: 'Live chronological audit timeline and resolution progress',
  },

  // Staff Views
  staff_workspace: {
    title: 'Staff Work Queue',
    subtitle: 'Acknowledge assignments, report blockers, and submit completion reports',
  },

  // Admin Views
  admin_dashboard: {
    title: 'Operations Management Console',
    subtitle: 'Dispatch complaints, manage priorities, and verify case closures',
  },
  operational_analytics: {
    title: 'Operational Telemetry & SLA Tracking',
    subtitle: 'Real-time performance metrics on live platform complaints',
  },

  // Cross-Cutting & Historical Archive
  predict: {
    title: 'Resolution Time Estimator',
    subtitle: 'Evaluate service request attributes using LightGBM_L2',
  },
  historical_complaints: {
    title: 'Historical Complaints Archive',
    subtitle: 'Filter and inspect NYC 311 archival records via DuckDB',
  },
  historical_analytics: {
    title: 'Historical Analytics (NYC 311)',
    subtitle: 'Turnaround distributions and category velocity from the 14.48 GB archive',
  },
  'model-info': {
    title: 'Model Governance & Information',
    subtitle: 'Technical specifications, training benchmarks, and operational bounds',
  },
  landing: {
    title: 'Public Platform Presentation',
    subtitle: 'Urban Resolution Intelligence Platform Overview',
  },
  overview: {
    title: 'Executive Platform Overview',
    subtitle: 'Platform metrics, recent requests, and historical distribution summary',
  },
};

class TabErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Tab runtime rendering exception:', error, errorInfo);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.activeTab !== this.props.activeTab && this.state.hasError) {
      this.setState({ hasError: false, error: null });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-2xl mx-auto my-8 p-6 bg-white border border-[#DCDDD4] rounded-xl shadow-sm text-center space-y-4">
          <div className="w-12 h-12 bg-[#B4483E]/10 text-[#B4483E] rounded-full flex items-center justify-center mx-auto">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-xl font-serif text-[#252C29]">Unable to Load Page</h2>
          <p className="text-xs text-[#68716A]">
            A rendering error occurred while displaying this view:
          </p>
          <div className="p-3 bg-[#ECEAE2]/60 rounded text-left text-xs font-mono text-[#B4483E] overflow-x-auto">
            {this.state.error?.message || 'Unknown render exception'}
          </div>
          <div className="pt-2 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, error: null })}
              className="px-4 py-2 bg-[#254A40] text-white rounded text-xs font-semibold hover:bg-[#1E3B33] cursor-pointer"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function MainApp() {
  const { user, isStaff, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('citizen_dashboard');
  const [trackingRef, setTrackingRef] = useState(null);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [apiHealth, setApiHealth] = useState({ success: false, loading: true, data: null });
  const [isRefreshingHealth, setIsRefreshingHealth] = useState(false);
  const [prefilledComplaint, setPrefilledComplaint] = useState(null);

  // Sync default tab when user switches persona
  useEffect(() => {
    if (user?.role === 'admin') {
      setActiveTab('admin_dashboard');
    } else if (user?.role === 'staff') {
      setActiveTab('staff_workspace');
    } else {
      setActiveTab('citizen_dashboard');
    }
  }, [user?.role]);

  // Poll backend health
  const checkBackendHealth = async () => {
    setIsRefreshingHealth(true);
    const result = await fetchHealth();
    setApiHealth({
      success: result.success,
      loading: false,
      data: result.data || null,
      error: result.error || null,
    });
    setIsRefreshingHealth(false);
  };

  useEffect(() => {
    checkBackendHealth();
    const interval = setInterval(checkBackendHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // Universal navigation callback
  const handleNavigate = (tab, param) => {
    if (tab === 'track' && param) {
      setTrackingRef(param);
    }
    setActiveTab(tab);
  };

  // Bridge from historical complaints to prediction form
  const handleSelectComplaintForPredict = (complaint) => {
    if (!complaint) return;
    const prefill = {
      'Problem (formerly Complaint Type)':
        complaint['Problem (formerly Complaint Type)'] ||
        complaint.problem ||
        complaint.complaint_type ||
        'Dirty Conditions',
      'Problem Detail (formerly Descriptor)':
        complaint['Problem Detail (formerly Descriptor)'] ||
        complaint.problemDetail ||
        complaint.problem_detail ||
        'Trash / Illegal Dumping',
      'Agency': complaint['Agency'] || complaint.agency || 'DSNY',
      'Agency Name':
        complaint['Agency Name'] ||
        complaint.agencyName ||
        complaint.agency_name ||
        'Department of Sanitation',
      'Location Type':
        complaint['Location Type'] ||
        complaint.locationType ||
        complaint.location_type ||
        'Sidewalk',
      'Borough': complaint['Borough'] || complaint.borough || 'MANHATTAN',
      'Incident Zip':
        complaint['Incident Zip'] ||
        complaint.incidentZip ||
        complaint.incident_zip ||
        '10001',
      'City': complaint['City'] || complaint.city || 'NEW YORK',
      'Community Board':
        complaint['Community Board'] ||
        complaint.communityBoard ||
        complaint.community_board ||
        '05 MANHATTAN',
      'Council District':
        Number(complaint['Council District'] || complaint.councilDistrict || complaint.council_district) || 3,
      'Police Precinct':
        String(complaint['Police Precinct'] || complaint.policePrecinct || complaint.police_precinct || '14'),
      'Open Data Channel Type':
        complaint['Open Data Channel Type'] || complaint.channel || 'ONLINE',
      'Latitude':
        parseFloat(complaint['Latitude'] || complaint.latitude) || 40.7505,
      'Longitude':
        parseFloat(complaint['Longitude'] || complaint.longitude) || -73.9934,
      'Created Date': (
        complaint['Created Date'] ||
        complaint.createdDate ||
        complaint.created_date ||
        new Date().toISOString()
      ).replace(' ', 'T').slice(0, 16),
    };
    setPrefilledComplaint(prefill);
    setActiveTab('predict');
  };

  // Full page presentation view
  if (activeTab === 'landing') {
    return (
      <LandingPage
        onNavigateDashboard={() => setActiveTab(isStaff ? 'staff_workspace' : isAdmin ? 'admin_dashboard' : 'citizen_dashboard')}
        onNavigatePredict={() => setActiveTab('predict')}
        apiHealth={apiHealth}
      />
    );
  }

  const currentMeta = PAGE_META[activeTab] || PAGE_META.citizen_dashboard;

  return (
    <div className="min-h-screen bg-[#F5F3ED] flex flex-col font-sans selection:bg-[#254A40]/15 selection:text-[#254A40]">
      {/* Sidebar navigation */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={(tab) => handleNavigate(tab)}
        apiHealth={apiHealth}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      {/* Main Content Area */}
      <div className="lg:pl-64 flex flex-col flex-1">
        {/* Top utility bar */}
        <TopBar
          title={currentMeta.title}
          subtitle={currentMeta.subtitle}
          onOpenMobile={() => setIsMobileOpen(true)}
          apiHealth={apiHealth}
          onRefreshHealth={checkBackendHealth}
          isRefreshingHealth={isRefreshingHealth}
          onNavigate={handleNavigate}
        />

        {/* Workspace body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <TabErrorBoundary activeTab={activeTab}>
            {/* Operational Citizen Pages */}
            {activeTab === 'citizen_dashboard' && (
              <CitizenDashboard onNavigate={handleNavigate} />
            )}

            {activeTab === 'submit_complaint' && (
              <SubmitComplaint onNavigate={handleNavigate} />
            )}

            {activeTab === 'track' && (
              <ComplaintTracking
                initialRef={trackingRef}
                onNavigate={handleNavigate}
              />
            )}

            {/* Operational Staff Workspace */}
            {activeTab === 'staff_workspace' && (
              <StaffWorkspace onNavigate={handleNavigate} />
            )}

            {/* Operational Admin Dashboard & Telemetry */}
            {activeTab === 'admin_dashboard' && (
              <AdminDashboard onNavigate={handleNavigate} />
            )}

            {activeTab === 'operational_analytics' && (
              <OperationalAnalytics onNavigate={handleNavigate} />
            )}

            {/* Cross-Cutting & Historical ML / DuckDB Views */}
            {activeTab === 'predict' && (
              <PredictResolution
                apiHealth={apiHealth}
                initialData={prefilledComplaint}
              />
            )}

            {activeTab === 'historical_complaints' && (
              <Complaints
                onSelectComplaintForPredict={handleSelectComplaintForPredict}
              />
            )}

            {activeTab === 'historical_analytics' && <Analytics />}

            {activeTab === 'overview' && (
              <Overview
                onNavigatePredict={() => setActiveTab('predict')}
                onNavigateComplaints={() => setActiveTab('historical_complaints')}
                onSelectComplaintForPredict={handleSelectComplaintForPredict}
              />
            )}

            {activeTab === 'model-info' && (
              <ModelInformation
                apiHealth={apiHealth}
                onRefreshHealth={checkBackendHealth}
                isRefreshingHealth={isRefreshingHealth}
              />
            )}
          </TabErrorBoundary>
        </main>

        {/* Global Footer */}
        <footer className="border-t border-[#DCDDD4] bg-white py-4 px-6 text-xs text-[#68716A] flex flex-col sm:flex-row items-center justify-between gap-2 mt-auto">
          <div>
            <span className="font-semibold text-[#252C29]">NYC Urban Service Resolution Intelligence Platform</span>
            <span className="ml-2 font-mono text-[11px] text-[#68716A]">v4.0.0 (Operational)</span>
          </div>
          <div className="flex items-center gap-4 text-[11px]">
            <span>Model: LightGBM_L2</span>
            <span>Operational DB: SQLite (WAL)</span>
            <span>Historical Archive: DuckDB</span>
            <button
              type="button"
              onClick={() => setActiveTab('landing')}
              className="hover:text-[#252C29] underline underline-offset-2 cursor-pointer"
            >
              Public Presentation
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
