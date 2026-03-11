import { useState, useRef, useEffect, useCallback } from 'react';
import { C } from '../theme';
import { searchTickers } from '../engines/tickerSearch';

export default function TickerSearch({ onSubmit }) {
  const [value, setValue] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const wrapperRef = useRef(null);
  const debounceRef = useRef(null);

  // Close dropdown on outside click
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

  // Debounced search
  const doSearch = useCallback((query) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query || query.length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const res = await searchTickers(query);
      setResults(res);
      setOpen(res.length > 0);
      setHighlighted(-1);
      setLoading(false);
    }, 250);
  }, []);

  const handleChange = (e) => {
    const v = e.target.value;
    setValue(v);
    doSearch(v.trim());
  };

  const selectResult = (result) => {
    onSubmit(result.ticker);
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
          onSubmit(ticker);
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
        selectResult(results[highlighted]);
      } else {
        // Submit raw text as ticker
        const ticker = value.trim().toUpperCase();
        if (ticker) {
          onSubmit(ticker);
          setValue('');
          setOpen(false);
        }
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  // Exchange label mapping
  const exchangeLabel = (ex) => {
    const map = { XNAS: 'NASDAQ', XNYS: 'NYSE', BATS: 'BATS' };
    return map[ex] || ex || '';
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        {/* Search icon */}
        <svg
          width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke={focused ? C.accent : C.textMuted}
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            pointerEvents: 'none', transition: 'stroke .15s',
          }}
        >
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { setFocused(true); if (results.length > 0) setOpen(true); }}
          onBlur={() => setFocused(false)}
          placeholder="Search ticker or company..."
          style={{
            width: 340,
            padding: '8px 14px 8px 34px',
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

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          width: 340,
          background: C.bgCard,
          border: `1px solid ${C.accent}`,
          borderTop: 'none',
          borderRadius: '0 0 8px 8px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          zIndex: 100,
          maxHeight: 300,
          overflowY: 'auto',
        }}>
          {loading && (
            <div style={{ padding: '8px 14px', fontSize: 12, color: C.textMuted }}>
              Searching...
            </div>
          )}
          {results.map((r, i) => (
            <div
              key={r.ticker}
              onClick={() => selectResult(r)}
              onMouseEnter={() => setHighlighted(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 14px',
                cursor: 'pointer',
                background: i === highlighted ? C.bgHover : 'transparent',
                transition: 'background .1s',
              }}
            >
              <span style={{
                fontSize: 13,
                fontWeight: 700,
                color: C.accent,
                minWidth: 55,
              }}>
                {r.ticker}
              </span>
              <span style={{
                fontSize: 12,
                color: C.textSecondary,
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {r.name}
              </span>
              <span style={{
                fontSize: 10,
                color: C.textMuted,
                flexShrink: 0,
              }}>
                {exchangeLabel(r.exchange)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
