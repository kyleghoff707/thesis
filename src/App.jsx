import { Routes, Route } from 'react-router-dom';
import { useTheme } from './hooks/useTheme';
import { useResearch } from './hooks/useResearch';
import Layout from './components/Layout';
import ResearchList from './components/ResearchList';
import Toolbox from './components/Toolbox';

function StagePlaceholder({ label }) {
  return (
    <div style={{ opacity: 0.5, fontSize: 13 }}>
      {label} — coming in a later phase.
    </div>
  );
}

export default function App() {
  const { isDark, toggleTheme } = useTheme();
  const { reports, createReport, updateReport, deleteReport, getReport } = useResearch();

  return (
    <Layout onNewResearch={createReport} isDark={isDark} toggleTheme={toggleTheme}>
      <Routes>
        <Route path="/" element={<ResearchList reports={reports} onDelete={deleteReport} />} />
        <Route path="/research/:id/toolbox" element={<Toolbox getReport={getReport} updateReport={updateReport} />} />
        <Route path="/research/:id/one-pager" element={<StagePlaceholder label="One Pager" />} />
        <Route path="/research/:id/pitch-deck" element={<StagePlaceholder label="Pitch Deck" />} />
        <Route path="/research/:id/full-story" element={<StagePlaceholder label="Full Story" />} />
      </Routes>
    </Layout>
  );
}
