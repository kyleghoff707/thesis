import { useState } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { useTheme } from './hooks/useTheme';
import { useResearch } from './hooks/useResearch';
import { useSettings } from './hooks/useSettings';
import Layout from './components/Layout';
import ResearchEmpty from './components/ResearchEmpty';
import Toolbox from './components/Toolbox';
import Watchlists from './components/Watchlists';
import Gurus from './components/Gurus';
import GuruPortfolio from './components/GuruPortfolio';
import Validation from './components/Validation';
import GuruAudit from './components/GuruAudit';
import TickerAudit from './components/TickerAudit';
import NportAudit from './components/NportAudit';
import CompAudit from './components/CompAudit';
import Settings from './components/Settings';
import OnePager from './components/OnePager';
import ReportsList from './components/ReportsList';

function StagePlaceholder({ label }) {
  return (
    <div style={{ opacity: 0.5, fontSize: 13 }}>
      {label} — coming in a later phase.
    </div>
  );
}

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

export default function App() {
  const { isDark, toggleTheme } = useTheme();
  const { reports, createReport, updateReport, deleteReport, getReport } = useResearch();
  const { settings, updateSettings } = useSettings();
  const [showSettings, setShowSettings] = useState(false);

  return (
    <Layout onNewResearch={createReport} onSettingsOpen={() => setShowSettings(true)}>
      <Routes>
        <Route path="/" element={<Navigate to="/research" replace />} />
        <Route path="/watchlists" element={<Watchlists onNewResearch={createReport} />} />
        <Route path="/research" element={<ResearchRedirect reports={reports} />} />
        <Route path="/research/:id" element={<Toolbox getReport={getReport} updateReport={updateReport} settings={settings} />} />
        <Route path="/research/:id/toolbox" element={<ToolboxRedirect />} />
        <Route path="/research/:id/one-pager" element={<OnePager getReport={getReport} updateReport={updateReport} />} />
        <Route path="/research/:id/pitch-deck" element={<StagePlaceholder label="Pitch Deck" />} />
        <Route path="/research/:id/full-story" element={<StagePlaceholder label="Full Story" />} />
        <Route path="/reports" element={<ReportsList reports={reports} getReport={getReport} />} />
        <Route path="/gurus" element={<Gurus />} />
        <Route path="/gurus/:cik" element={<GuruPortfolio />} />
        <Route path="/validation" element={<Validation />} />
        <Route path="/guru-audit" element={<GuruAudit />} />
        <Route path="/ticker-audit" element={<TickerAudit />} />
        <Route path="/nport-audit" element={<NportAudit />} />
        <Route path="/comp-audit" element={<CompAudit />} />
      </Routes>
      {showSettings && (
        <Settings
          settings={settings}
          updateSettings={updateSettings}
          isDark={isDark}
          toggleTheme={toggleTheme}
          onClose={() => setShowSettings(false)}
        />
      )}
    </Layout>
  );
}
