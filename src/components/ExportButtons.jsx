import { useState } from 'react';
import { C } from '../theme';
import Spinner from './Spinner';

const IS_DEV = import.meta.env.DEV;
const API_BASE = import.meta.env.VITE_API_URL || '';

export default function ExportButtons({ ticker, stage, report }) {
  const [exporting, setExporting] = useState(null); // 'pdf' | 'docx' | null
  const [error, setError] = useState(null);

  async function handleExport(format) {
    setExporting(format);
    setError(null);
    try {
      if (IS_DEV) {
        // Dev: use Python generators via Vite middleware
        const res = await fetch(
          `/api/thesis/reports/${encodeURIComponent(ticker)}/export/${stage}/${format}`,
          { method: 'POST' },
        );
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Export failed');
          setExporting(null);
          return;
        }
        const filename = stage + (format === 'pdf' ? '.pdf' : '.docx');
        const downloadUrl = `/api/thesis/reports/${encodeURIComponent(ticker)}/download/${filename}`;
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `${ticker}-${filename}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        // Production: call Worker export endpoint → proxies to Python export service
        const reportId = report?.id;
        if (!reportId) {
          setError('No report ID available for export');
          setExporting(null);
          return;
        }

        const res = await fetch(`${API_BASE}/api/pipeline/export/${reportId}/${stage}/${format}`, {
          credentials: 'include',
        });

        if (!res.ok) {
          let errMsg = 'Export failed';
          try { const data = await res.json(); errMsg = data.error || errMsg; } catch {}
          setError(errMsg);
          setExporting(null);
          return;
        }

        // Download the file
        const blob = await res.blob();
        const ext = format === 'pdf' ? '.pdf' : '.docx';
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${ticker}-${stage}${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setExporting(null);
    }
  }

  const btnStyle = (format) => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'transparent',
    border: '1px solid ' + C.border,
    color: C.textSecondary,
    padding: '10px 14px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: exporting ? 'default' : 'pointer',
    fontFamily: 'inherit',
    opacity: exporting && exporting !== format ? 0.5 : 1,
    transition: 'all .15s',
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button
        onClick={() => handleExport('pdf')}
        disabled={!!exporting}
        style={btnStyle('pdf')}
      >
        {exporting === 'pdf' ? <Spinner size={12} /> : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <polyline points="8 15 12 18 16 15" />
          </svg>
        )}
        {exporting === 'pdf' ? 'Generating...' : 'PDF'}
      </button>
      <button
        onClick={() => handleExport('docx')}
        disabled={!!exporting}
        style={btnStyle('docx')}
      >
        {exporting === 'docx' ? <Spinner size={12} /> : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <polyline points="8 15 12 18 16 15" />
          </svg>
        )}
        {exporting === 'docx' ? 'Generating...' : 'Word'}
      </button>
      {error && (
        <span style={{ fontSize: 11, color: C.red }}>{error}</span>
      )}
    </div>
  );
}
