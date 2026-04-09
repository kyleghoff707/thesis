import { useState } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
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
import StageNavBar from './components/StageNavBar';

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
  const { reports, createReport, updateReport, deleteReport, getReport } = useResearch();
  const { settings, updateSettings } = useSettings();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <Layout onNewResearch={createReport} onSettingsOpen={() => setShowSettings(true)} user={user} onLogout={logout}>
      <Routes>
        <Route path="/" element={<Navigate to="/research" replace />} />
        <Route path="/watchlists" element={<Watchlists onNewResearch={createReport} />} />
        <Route path="/research" element={<ResearchRedirect reports={reports} />} />
        <Route path="/research/:id" element={<Toolbox getReport={getReport} updateReport={updateReport} settings={settings} />} />
        <Route path="/research/:id/toolbox" element={<ToolboxRedirect />} />
        <Route path="/research/:id/one-pager" element={<ReportStageLayout getReport={getReport}><OnePager getReport={getReport} updateReport={updateReport} /></ReportStageLayout>} />
        <Route path="/research/:id/pitch-deck" element={<ReportStageLayout getReport={getReport}><PitchDeck getReport={getReport} updateReport={updateReport} /></ReportStageLayout>} />
        <Route path="/research/:id/full-story" element={<ReportStageLayout getReport={getReport}><FullStory getReport={getReport} updateReport={updateReport} /></ReportStageLayout>} />
        <Route path="/reports" element={<ReportsList reports={reports} getReport={getReport} createReport={createReport} />} />
        <Route path="/gurus" element={<Gurus />} />
        <Route path="/gurus/:cik" element={<GuruPortfolio />} />
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
    </Layout>
  );
}

export default function App() {
  const { user, loading, login, logout, signup } = useAuth();

  // Dev mode: skip auth gate (no Worker running locally by default)
  if (import.meta.env.DEV) {
    return <AuthenticatedApp user={{ name: 'Dev User', email: 'dev@thes1sinvesting.com', role: 'admin' }} logout={() => {}} />;
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
