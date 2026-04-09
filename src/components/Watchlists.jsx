import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { C } from '../theme';
import { useWatchlists } from '../hooks/useWatchlists';
import { searchTickers } from '../engines/tickerSearch';
import { formatCompanyName } from '../engines/formatCompanyName';

// Inline ticker search for adding stocks to a watchlist
function AddTickerSearch({ onAdd }) {
  const [value, setValue] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [focused, setFocused] = useState(false);
  const wrapperRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const doSearch = useCallback((query) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || query.length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const res = await searchTickers(query);
      setResults(res);
      setOpen(res.length > 0);
      setHighlighted(-1);
    }, 250);
  }, []);

  const handleSelect = (result) => {
    onAdd(result.ticker, result.name);
    setValue('');
    setResults([]);
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!open || results.length === 0) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const ticker = value.trim().toUpperCase();
        if (ticker) {
          onAdd(ticker, '');
          setValue('');
          setOpen(false);
        }
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlighted >= 0 && highlighted < results.length) {
        handleSelect(results[highlighted]);
      } else {
        const ticker = value.trim().toUpperCase();
        if (ticker) {
          onAdd(ticker, '');
          setValue('');
          setOpen(false);
        }
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const exchangeLabel = (ex) => {
    const map = { XNAS: 'NASDAQ', XNYS: 'NYSE', BATS: 'BATS' };
    return map[ex] || ex || '';
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', display: 'inline-block' }}>
      <div style={{ position: 'relative' }}>
        <svg
          width="13" height="13" viewBox="0 0 24 24"
          fill="none" stroke={focused ? C.accent : C.textMuted}
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{
            position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
            pointerEvents: 'none', transition: 'stroke .15s',
          }}
        >
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={value}
          onChange={e => { setValue(e.target.value); doSearch(e.target.value.trim()); }}
          onKeyDown={handleKeyDown}
          onFocus={() => { setFocused(true); if (results.length > 0) setOpen(true); }}
          onBlur={() => setFocused(false)}
          placeholder="Add ticker or company..."
          style={{
            width: 260,
            padding: '6px 12px 6px 30px',
            fontSize: 13,
            background: C.bgInput,
            color: C.text,
            border: `1px solid ${open ? C.accent : C.border}`,
            borderRadius: open ? '6px 6px 0 0' : 6,
            outline: 'none',
            fontFamily: 'inherit',
            transition: 'border-color .15s, box-shadow .15s',
            boxShadow: focused && !open ? `0 0 0 2px ${C.accent}20` : 'none',
          }}
        />
      </div>
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          width: 260,
          background: C.bgCard,
          border: `1px solid ${C.accent}`,
          borderTop: 'none',
          borderRadius: '0 0 8px 8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 100,
          maxHeight: 240,
          overflowY: 'auto',
        }}>
          {results.map((r, i) => (
            <div
              key={r.ticker}
              onClick={() => handleSelect(r)}
              onMouseEnter={() => setHighlighted(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '7px 12px',
                cursor: 'pointer',
                background: i === highlighted ? C.bgHover : 'transparent',
                transition: 'background .1s',
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 700, color: C.accent, minWidth: 50 }}>
                {r.ticker}
              </span>
              <span style={{ fontSize: 12, color: C.textSecondary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.name}
              </span>
              <span style={{ fontSize: 10, color: C.textMuted, flexShrink: 0 }}>
                {exchangeLabel(r.exchange)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Single watchlist card
function WatchlistCard({ watchlist, onAddTicker, onRemoveTicker, onDelete, onRename, onTickerClick }) {
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(watchlist.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleRename = () => {
    if (editName.trim() && editName.trim() !== watchlist.name) {
      onRename(watchlist.id, editName);
    }
    setEditing(false);
  };

  return (
    <div style={{
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      background: C.bgCard,
      overflow: 'hidden',
    }}>
      {/* Watchlist header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        borderBottom: collapsed ? 'none' : `1px solid ${C.borderLight}`,
        cursor: 'pointer',
      }}>
        {/* Collapse toggle */}
        <span
          onClick={() => setCollapsed(!collapsed)}
          style={{ fontSize: 11, color: C.textMuted, width: 14, textAlign: 'center', flexShrink: 0 }}
        >
          {collapsed ? '▶' : '▼'}
        </span>

        {/* Name (editable) */}
        {editing ? (
          <input
            autoFocus
            value={editName}
            onChange={e => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') { setEditName(watchlist.name); setEditing(false); } }}
            onClick={e => e.stopPropagation()}
            style={{
              fontSize: 14, fontWeight: 600, color: C.text,
              background: C.bgInput, border: `1px solid ${C.accent}`,
              borderRadius: 4, padding: '2px 8px', outline: 'none',
              fontFamily: 'inherit', flex: 1,
            }}
          />
        ) : (
          <span
            onClick={() => setCollapsed(!collapsed)}
            onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
            style={{ fontSize: 14, fontWeight: 600, color: C.text, flex: 1 }}
            title="Double-click to rename"
          >
            {watchlist.name}
          </span>
        )}

        {/* Item count */}
        <span style={{ fontSize: 11, color: C.textMuted, flexShrink: 0 }}>
          {watchlist.items.length} {watchlist.items.length === 1 ? 'stock' : 'stocks'}
        </span>

        {/* Delete */}
        {confirmDelete ? (
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onDelete(watchlist.id)}
              style={{
                fontSize: 11, fontWeight: 600, padding: '2px 8px',
                background: C.red, color: '#fff', border: 'none',
                borderRadius: 4, cursor: 'pointer',
              }}
            >Delete</button>
            <button
              onClick={() => setConfirmDelete(false)}
              style={{
                fontSize: 11, padding: '2px 8px',
                background: 'transparent', color: C.textMuted,
                border: `1px solid ${C.border}`, borderRadius: 4, cursor: 'pointer',
              }}
            >Cancel</button>
          </div>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
            title="Delete watchlist"
            style={{
              background: 'none', border: 'none', color: C.textMuted,
              cursor: 'pointer', padding: '2px 4px', fontSize: 14, lineHeight: 1,
              borderRadius: 4, transition: 'color .15s', flexShrink: 0,
            }}
            onMouseEnter={e => e.currentTarget.style.color = C.red}
            onMouseLeave={e => e.currentTarget.style.color = C.textMuted}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        )}
      </div>

      {/* Watchlist body */}
      {!collapsed && (
        <div>
          {/* Add ticker row */}
          <div style={{ padding: '8px 14px', borderBottom: watchlist.items.length > 0 ? `1px solid ${C.borderLight}` : 'none' }}>
            <AddTickerSearch onAdd={(ticker, name) => onAddTicker(watchlist.id, ticker, name)} />
          </div>

          {/* Stock table */}
          {watchlist.items.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Ticker</th>
                  <th style={{ ...thStyle, textAlign: 'left' }}>Company</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Added</th>
                  <th style={{ ...thStyle, width: 36 }} />
                </tr>
              </thead>
              <tbody>
                {watchlist.items.map((item, idx) => (
                  <tr
                    key={item.ticker}
                    style={{
                      borderBottom: idx < watchlist.items.length - 1 ? `1px solid ${C.borderLight}` : 'none',
                      cursor: 'pointer',
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = C.bgHover}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    onClick={() => onTickerClick(item.ticker)}
                  >
                    <td style={{ ...tdStyle, fontWeight: 700, color: C.accent, width: 80 }}>
                      {item.ticker}
                    </td>
                    <td style={{ ...tdStyle, color: C.textSecondary }}>
                      {formatCompanyName(item.companyName) || '—'}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', color: C.textMuted, fontSize: 12 }}>
                      {item.addedAt}
                    </td>
                    <td style={{ ...tdStyle, width: 36, textAlign: 'center' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); onRemoveTicker(watchlist.id, item.ticker); }}
                        title="Remove"
                        style={{
                          background: 'none', border: 'none', color: C.textMuted,
                          cursor: 'pointer', padding: 2, lineHeight: 1,
                          borderRadius: 4, transition: 'color .15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = C.red}
                        onMouseLeave={e => e.currentTarget.style.color = C.textMuted}
                      >
                        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Empty state within watchlist */}
          {watchlist.items.length === 0 && (
            <div style={{ padding: '16px 14px', textAlign: 'center', fontSize: 12, color: C.textMuted }}>
              Search above to add stocks to this watchlist
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const thStyle = {
  padding: '6px 14px',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: C.textMuted,
  textAlign: 'left',
  borderBottom: `1px solid ${C.borderLight}`,
};

const tdStyle = {
  padding: '8px 14px',
  fontSize: 13,
};

export default function Watchlists({ onNewResearch }) {
  const { watchlists, createWatchlist, deleteWatchlist, renameWatchlist, addTicker, removeTicker } = useWatchlists();
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createWatchlist(name);
    setNewName('');
    setShowCreate(false);
  };

  const handleTickerClick = (ticker) => {
    // Create a research report and navigate to it
    if (onNewResearch) {
      const report = onNewResearch(ticker);
      if (report) {
        navigate(`/research/${report.id}`);
        return;
      }
    }
    // Fallback: just navigate to research
    navigate('/research');
  };

  return (
    <div style={{ padding: '40px 0' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, margin: 0 }}>Watchlists</h1>
        </div>

        {/* Create new button */}
        {!showCreate && (
          <button
            data-tour="watchlist-create"
            onClick={() => setShowCreate(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 14px', fontSize: 13, fontWeight: 600,
              background: C.accent, color: '#fff', border: 'none',
              borderRadius: 6, cursor: 'pointer', transition: 'background .15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = C.accentHover}
            onMouseLeave={e => e.currentTarget.style.background = C.accent}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New Watchlist
          </button>
        )}
      </div>

      {/* Create form (inline) */}
      {showCreate && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16,
          padding: '12px 14px',
          background: C.bgCard, border: `1px solid ${C.accent}`,
          borderRadius: 8,
        }}>
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setShowCreate(false); setNewName(''); } }}
            placeholder="Watchlist name..."
            style={{
              flex: 1, padding: '6px 10px', fontSize: 13,
              background: C.bgInput, color: C.text,
              border: `1px solid ${C.border}`, borderRadius: 6,
              outline: 'none', fontFamily: 'inherit',
            }}
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            style={{
              padding: '6px 14px', fontSize: 13, fontWeight: 600,
              background: newName.trim() ? C.accent : C.bgHover,
              color: newName.trim() ? '#fff' : C.textMuted,
              border: 'none', borderRadius: 6, cursor: newName.trim() ? 'pointer' : 'default',
              transition: 'all .15s',
            }}
          >
            Create
          </button>
          <button
            onClick={() => { setShowCreate(false); setNewName(''); }}
            style={{
              padding: '6px 10px', fontSize: 13,
              background: 'transparent', color: C.textMuted,
              border: `1px solid ${C.border}`, borderRadius: 6,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Watchlist cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {watchlists.map(wl => (
          <WatchlistCard
            key={wl.id}
            watchlist={wl}
            onAddTicker={addTicker}
            onRemoveTicker={removeTicker}
            onDelete={deleteWatchlist}
            onRename={renameWatchlist}
            onTickerClick={handleTickerClick}
          />
        ))}
      </div>

      {/* Empty state — only when no watchlists exist */}
      {watchlists.length === 0 && !showCreate && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '80px 24px',
          background: C.bgCard,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
        }}>
          <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.5, marginBottom: 16 }}>
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, marginBottom: 6 }}>
            No watchlists yet
          </div>
          <div style={{ fontSize: 13, color: C.textSecondary, textAlign: 'center', maxWidth: 320, marginBottom: 20 }}>
            Create a watchlist to organize and track companies you're interested in.
          </div>
          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', fontSize: 13, fontWeight: 600,
              background: C.accent, color: '#fff', border: 'none',
              borderRadius: 6, cursor: 'pointer', transition: 'background .15s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = C.accentHover}
            onMouseLeave={e => e.currentTarget.style.background = C.accent}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create Your First Watchlist
          </button>
        </div>
      )}
    </div>
  );
}
