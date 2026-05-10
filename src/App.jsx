import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Routes, Route, Navigate, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useTheme } from './hooks/useTheme';
import { useResearch } from './hooks/useResearch';
import { useSettings } from './hooks/useSettings';
import { useAuth } from './hooks/useAuth';
import Layout from './components/Layout';
import LoginPage from './components/LoginPage';
import SignupPage from './components/SignupPage';
import ResearchEmpty from './components/ResearchEmpty';
import Toolbox from './components/Toolbox';
import Watchlists from './components/Watchlists';
import Gurus from './components/Gurus';
import GuruPortfolio from './components/GuruPortfolio';
import Validation from './components/Validation';
import Settings from './components/Settings';
import OnePager from './components/OnePager';
import PitchDeck from './components/PitchDeck';
import FullStory from './components/FullStory';
import ReportsList from './components/ReportsList';
import BillingPage from './components/BillingPage';
import StageNavBar from './components/StageNavBar';
import ProductTour from './components/ProductTour';
import { FULL_TOUR_STEPS, SECTION_TOUR_STEPS } from './components/tourSteps';

// Redirect /research to last-viewed report if one exists
function ResearchRedirect({ reports }) {
  const lastId = localStorage.getItem('sa-last-research');
  if (lastId && reports.some(r => r.id === lastId)) {
    return <Navigate to={`/research/${lastId}`} replace />;
  }
  return <ResearchEmpty />;
}

// Backward compat redirect for old /research/:id/toolbox URLs
function ToolboxRedirect() {
  const { id } = useParams();
  return <Navigate to={`/research/${id}`} replace />;
}

// Shared layout for report stage routes — renders StageNavBar above content
function ReportStageLayout({ getReport, children }) {
  const { id } = useParams();
  const report = getReport ? getReport(id) : null;
  return (
    <>
      <StageNavBar stageApprovals={report?.stageApprovals} />
      {children}
    </>
  );
}

// Authenticated app shell — rendered after login
function AuthenticatedApp({ user, logout }) {
  const { isDark, toggleTheme } = useTheme();
  const { reports, createReport, updateReport, deleteReport, getReport, refreshReport } = useResearch();
  const { settings, updateSettings } = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // ── Product Tour state ────────────────────────────────────
  const [tourStep, setTourStep] = useState(-1);
  const [tourMode, setTourMode] = useState('full');
  const [showHelpMenu, setShowHelpMenu] = useState(false);
  const helpMenuRef = useRef(null);
  const tourAutoRef = useRef(false);
  const tourNavRef = useRef(false); // tracks whether the tour triggered the last navigation
  const demoReportRef = useRef(null);

  const activeTourSteps = useMemo(() => {
    if (tourMode === 'full') return FULL_TOUR_STEPS;
    return SECTION_TOUR_STEPS[tourMode] || [];
  }, [tourMode]);

  // Resolve route placeholders (e.g. {demoId} -> actual report ID)
  const resolveRoute = useCallback((step) => {
    if (!step.route) return null;
    if (step.demoTicker) {
      let report = reports.find(r => r.ticker === step.demoTicker);
      if (!report) report = createReport(step.demoTicker);
      if (report) demoReportRef.current = report.id;
      return step.route.replace('{demoId}', demoReportRef.current || '');
    }
    return step.route;
  }, [reports, createReport]);

  const handleTourNext = useCallback(() => {
    const next = tourStep + 1;
    if (next >= activeTourSteps.length) {
      setTourStep(-1);
      updateSettings({ tourCompleted: true });
      return;
    }
    const nextStep = activeTourSteps[next];
    const route = resolveRoute(nextStep);
    if (route) { tourNavRef.current = true; navigate(route); }
    setTourStep(next);
  }, [tourStep, activeTourSteps, resolveRoute, navigate, updateSettings]);

  const handleTourBack = useCallback(() => {
    if (tourStep <= 0) return;
    const prev = tourStep - 1;
    const prevStep = activeTourSteps[prev];
    // Walk backwards to find the most recent step with a route
    let route = null;
    for (let i = prev; i >= 0; i--) {
      const r = resolveRoute(activeTourSteps[i]);
      if (r) { route = r; break; }
    }
    if (route) { tourNavRef.current = true; navigate(route); }
    setTourStep(prev);
  }, [tourStep, activeTourSteps, resolveRoute, navigate]);

  const handleTourSkip = useCallback(() => {
    setTourStep(-1);
    updateSettings({ tourCompleted: true });
  }, [updateSettings]);

  const launchFullTour = useCallback(() => {
    setTourMode('full');
    setShowHelpMenu(false);
    setTourStep(0);
  }, []);

  const launchSectionTour = useCallback(() => {
    const path = location.pathname;
    let section = 'research';
    if (path.startsWith('/watchlists')) section = 'watchlists';
    else if (path.startsWith('/gurus')) section = 'gurus';
    else if (path.startsWith('/reports') || path.includes('/one-pager') || path.includes('/pitch-deck') || path.includes('/full-story')) section = 'reports';
    setTourMode(section);
    setTourStep(0);
    setShowHelpMenu(false);
  }, [location.pathname]);

  // Auto-launch tour on first use (desktop only)
  useEffect(() => {
    if (settings.tourCompleted || tourStep !== -1 || tourAutoRef.current || showSettings) return;
    if (typeof window !== 'undefined' && window.innerWidth < 768) return;
    tourAutoRef.current = true;
    const timer = setTimeout(() => launchFullTour(), 600);
    return () => { clearTimeout(timer); tourAutoRef.current = false; };
  }, [settings.tourCompleted, showSettings]); // eslint-disable-line react-hooks/exhaustive-deps

  // Dismiss tour on unexpected navigation (browser back/forward)
  useEffect(() => {
    if (tourStep < 0) return;
    if (tourNavRef.current) { tourNavRef.current = false; return; }
    // Location changed but not from tour navigation — dismiss
    setTourStep(-1);
    updateSettings({ tourCompleted: true });
  }, [location.pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close help menu on outside click
  useEffect(() => {
    if (!showHelpMenu) return;
    function handler(e) {
      if (helpMenuRef.current && !helpMenuRef.current.contains(e.target)) setShowHelpMenu(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showHelpMenu]);

  return (
    <Layout
      onNewResearch={createReport}
      onSettingsOpen={() => setShowSettings(true)}
      user={user}
      onLogout={logout}
      tourCompleted={settings.tourCompleted}
      onStartTour={launchFullTour}
      onSectionTour={launchSectionTour}
      showHelpMenu={showHelpMenu}
      setShowHelpMenu={setShowHelpMenu}
      helpMenuRef={helpMenuRef}
    >
      <Routes>
        <Route path="/" element={<Navigate to="/research" replace />} />
        <Route path="/watchlists" element={<Watchlists onNewResearch={createReport} />} />
        <Route path="/research" element={<ResearchRedirect reports={reports} />} />
        <Route path="/research/:id" element={<Toolbox getReport={getReport} updateReport={updateReport} refreshReport={refreshReport} settings={settings} />} />
        <Route path="/research/:id/toolbox" element={<ToolboxRedirect />} />
        <Route path="/research/:id/one-pager" element={<ReportStageLayout getReport={getReport}><OnePager getReport={getReport} updateReport={updateReport} refreshReport={refreshReport} /></ReportStageLayout>} />
        <Route path="/research/:id/pitch-deck" element={<ReportStageLayout getReport={getReport}><PitchDeck getReport={getReport} updateReport={updateReport} /></ReportStageLayout>} />
        <Route path="/research/:id/full-story" element={<ReportStageLayout getReport={getReport}><FullStory getReport={getReport} updateReport={updateReport} /></ReportStageLayout>} />
        <Route path="/reports" element={<ReportsList reports={reports} getReport={getReport} createReport={createReport} />} />
        <Route path="/gurus" element={<Gurus />} />
        <Route path="/gurus/:cik" element={<GuruPortfolio />} />
        <Route path="/billing" element={<BillingPage user={user} />} />
        <Route path="/validation" element={<Validation />} />
      </Routes>
      {showSettings && (
        <Settings
          settings={settings}
          updateSettings={updateSettings}
          isDark={isDark}
          toggleTheme={toggleTheme}
          onClose={() => setShowSettings(false)}
          user={user}
        />
      )}
      {tourStep >= 0 && activeTourSteps.length > 0 && (
        <ProductTour
          steps={activeTourSteps}
          step={tourStep}
          onNext={handleTourNext}
          onBack={handleTourBack}
          onSkip={handleTourSkip}
        />
      )}
    </Layout>
  );
}

export default function App() {
  const { user, loading, login, logout, signup } = useAuth();

  // Dev mode: skip auth gate (no Worker running locally by default)
  if (import.meta.env.DEV) {
    return <AuthenticatedApp user={{ name: 'Dev User', email: 'dev@thesis-investing.com', role: 'admin' }} logout={() => {}} />;
  }

  // Production: auth gate
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: '#64748b' }}>Loading...</p>
      </div>
    );
  }

  // Signup route (invite link) — only show if not already logged in
  if (window.location.hash.includes('/signup') && !user) {
    return <SignupPage onSignup={signup} />;
  }

  if (!user) {
    return <LoginPage onLogin={login} />;
  }

  return <AuthenticatedApp user={user} logout={logout} />;
}
