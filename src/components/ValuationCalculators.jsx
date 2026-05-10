import { useState } from 'react';
import { C } from '../theme';

// ─── Formatters ─────────────────────────────────────────────

function fmtNum(n, decimals = 2) {
  if (n == null || isNaN(n)) return '--';
  return Number(n.toFixed(decimals)).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtDollar(n, decimals = 2) {
  if (n == null || isNaN(n)) return '--';
  return '$' + fmtNum(n, decimals);
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return '--';
  return (n * 100).toFixed(2) + '%';
}

// Format a range: if low === high, show single value; else "low — high"
function fmtRange(low, high, formatter = fmtNum) {
  if (low == null && high == null) return '--';
  if (low == null) return formatter(high);
  if (high == null) return formatter(low);
  const fLow = formatter(Math.min(low, high));
  const fHigh = formatter(Math.max(low, high));
  if (fLow === fHigh) return fLow;
  return `${fLow} — ${fHigh}`;
}


// ─── Shared field components ────────────────────────────────

function FieldRow({ label, value, editable, onChange, type = 'number', step, suffix, icon, decimals = 2 }) {
  const [focused, setFocused] = useState(false);
  const [localVal, setLocalVal] = useState('');

  const fieldStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '4px 10px',
    fontSize: 13,
    fontVariantNumeric: 'tabular-nums',
    background: editable ? C.bgInput : C.bgHover,
    border: `1px solid ${editable ? C.border : 'transparent'}`,
    borderRadius: 6,
    minWidth: 100,
    justifyContent: 'flex-end',
  };

  // Format display value with commas when not focused
  const displayValue = (() => {
    if (!editable || type !== 'number') return value ?? '';
    if (focused) return localVal;
    if (value == null || value === '' || isNaN(value)) return '';
    return fmtNum(Number(value), decimals);
  })();

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '7px 0',
      borderBottom: `1px solid ${C.borderLight}`,
    }}>
      <span style={{
        fontSize: 13,
        fontWeight: 500,
        color: editable ? C.text : C.textSecondary,
      }}>{label}</span>
      <div style={fieldStyle}>
        {icon && <span style={{ fontSize: 12, color: C.textMuted, cursor: icon.onClick ? 'pointer' : 'default' }} onClick={icon.onClick}>{icon.element}</span>}
        {editable ? (
          <input
            type="text"
            inputMode="decimal"
            value={displayValue}
            onFocus={e => {
              setFocused(true);
              setLocalVal(value != null && !isNaN(value) ? String(value) : '');
              requestAnimationFrame(() => e.target.select());
            }}
            onBlur={() => {
              setFocused(false);
              if (type === 'number') {
                const cleaned = localVal.replace(/,/g, '');
                onChange(cleaned === '' ? NaN : parseFloat(cleaned));
              }
            }}
            onChange={e => {
              const raw = e.target.value;
              setLocalVal(raw);
              if (type === 'number') {
                const cleaned = raw.replace(/,/g, '');
                onChange(cleaned === '' ? NaN : parseFloat(cleaned));
              } else {
                onChange(raw);
              }
            }}
            step={step}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 13,
              fontWeight: 600,
              color: C.text,
              textAlign: 'right',
              width: 100,
              fontFamily: 'inherit',
              fontVariantNumeric: 'tabular-nums',
            }}
          />
        ) : (
          <span style={{ fontWeight: 600, color: C.text }}>{value}</span>
        )}
        {suffix && <span style={{ fontSize: 11, color: C.textMuted, marginLeft: 2 }}>{suffix}</span>}
      </div>
    </div>
  );
}

// Range input — two editable fields side by side (Low — High)
function RangeFieldRow({ label, valueLow, valueHigh, onChangeLow, onChangeHigh, suffix, decimals = 2 }) {
  const [focusedLow, setFocusedLow] = useState(false);
  const [focusedHigh, setFocusedHigh] = useState(false);
  const [localLow, setLocalLow] = useState('');
  const [localHigh, setLocalHigh] = useState('');

  const inputBoxStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 8px',
    fontSize: 13,
    fontVariantNumeric: 'tabular-nums',
    background: C.bgInput,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    minWidth: 72,
    justifyContent: 'flex-end',
  };

  const inputStyle = {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    fontSize: 13,
    fontWeight: 600,
    color: C.text,
    textAlign: 'right',
    width: 60,
    fontFamily: 'inherit',
    fontVariantNumeric: 'tabular-nums',
  };

  function makeDisplay(val, focused, local) {
    if (focused) return local;
    if (val == null || val === '' || isNaN(val)) return '';
    return fmtNum(Number(val), decimals);
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '7px 0',
      borderBottom: `1px solid ${C.borderLight}`,
    }}>
      <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={inputBoxStyle}>
          <span style={{ fontSize: 9, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Low</span>
          <input
            type="text"
            inputMode="decimal"
            value={makeDisplay(valueLow, focusedLow, localLow)}
            onFocus={e => {
              setFocusedLow(true);
              setLocalLow(valueLow != null && !isNaN(valueLow) ? String(valueLow) : '');
              requestAnimationFrame(() => e.target.select());
            }}
            onBlur={() => {
              setFocusedLow(false);
              const cleaned = localLow.replace(/,/g, '');
              onChangeLow(cleaned === '' ? NaN : parseFloat(cleaned));
            }}
            onChange={e => {
              const raw = e.target.value;
              setLocalLow(raw);
              const cleaned = raw.replace(/,/g, '');
              onChangeLow(cleaned === '' ? NaN : parseFloat(cleaned));
            }}
            style={inputStyle}
          />
          {suffix && <span style={{ fontSize: 11, color: C.textMuted }}>{suffix}</span>}
        </div>
        <span style={{ color: C.textMuted, fontSize: 11 }}>—</span>
        <div style={inputBoxStyle}>
          <span style={{ fontSize: 9, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>High</span>
          <input
            type="text"
            inputMode="decimal"
            value={makeDisplay(valueHigh, focusedHigh, localHigh)}
            onFocus={e => {
              setFocusedHigh(true);
              setLocalHigh(valueHigh != null && !isNaN(valueHigh) ? String(valueHigh) : '');
              requestAnimationFrame(() => e.target.select());
            }}
            onBlur={() => {
              setFocusedHigh(false);
              const cleaned = localHigh.replace(/,/g, '');
              onChangeHigh(cleaned === '' ? NaN : parseFloat(cleaned));
            }}
            onChange={e => {
              const raw = e.target.value;
              setLocalHigh(raw);
              const cleaned = raw.replace(/,/g, '');
              onChangeHigh(cleaned === '' ? NaN : parseFloat(cleaned));
            }}
            style={inputStyle}
          />
          {suffix && <span style={{ fontSize: 11, color: C.textMuted }}>{suffix}</span>}
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ title }) {
  return (
    <div style={{
      fontSize: 14,
      fontWeight: 600,
      color: C.accent,
      padding: '12px 0 8px',
      borderBottom: `1px solid ${C.accent}30`,
      marginBottom: 4,
    }}>
      {title}
    </div>
  );
}

// Lock icon SVG
const LockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.textMuted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

// Edit icon SVG
const EditIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
);

// Refresh icon SVG
const RefreshIcon = ({ onClick }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: 'pointer' }} onClick={onClick}>
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

// ─── Main component ─────────────────────────────────────────

export default function ValuationCalculators({
  currentPrice,
  tenCapRange,
  tenCapDefaults,
  mosResultLow,
  mosResultHigh,
  pbtResultLow,
  pbtResultHigh,
  pbtFCFPerShare,
  pbtFCFPerShareComputed,
  pbtAtCurrentPrice,
  epsTTM,
  setEpsTTM,
  fgrSource,
  setFgrSource,
  analystGR,
  setAnalystGR,
  compositeGR,
  customGR,
  setCustomGR,
  activeFGR,
  // FGR range
  fgrLow,
  fgrHigh,
  setFgrLow,
  setFgrHigh,
  // Maintenance % range
  maintenancePctLow,
  maintenancePctHigh,
  setMaintenancePctLow,
  setMaintenancePctHigh,
  // Future PE (single value)
  futurePE,
  setFuturePE,
  mosDiscount,
  setMosDiscount,
  marr,
  setMarr,
  pbtYears,
  setPbtYears,
  effectiveFCFRatio,
  fcfRatioOverride,
  setFcfRatioOverride,
  fcfRatioComputed,
  hasTTM,
  // 10 Cap override setters
  setTenCapCFO,
  setTenCapCapEx,
  setTenCapTax,
  setTenCapShares,
  setTenCapMaintCapEx,
  // PBT FCF Per Share override
  setPbtFCFPerShare,
  // Equity Bond range
  ebResultLow,
  ebResultHigh,
  ebDefaults,
  setEbBvps,
  setEbRoe,
  setEbRetainedRatio,
  ebAvgPELow,
  ebAvgPEHigh,
  setEbAvgPELow,
  setEbAvgPEHigh,
  ebMarr,
  setEbMarr,
  ebMosDiscount,
  setEbMosDiscount,
  heroEnabled,
  setHeroEnabled,
  onSave,
  saveStatus,
  analystData,
  analystLoading,
  refetchAnalyst,
  analystGRSource,
}) {
  // Use tenCapRange.high for display inputs (shared), .low/.high for results
  const tenCapDisplay = tenCapRange?.high ?? tenCapRange?.low;

  // Determine buy price ranges
  const tenCapPriceLow = tenCapRange?.low?.tenCapPrice ?? null;
  const tenCapPriceHigh = tenCapRange?.high?.tenCapPrice ?? null;
  const tenCapFairValueLow = tenCapPriceLow != null ? Math.round(tenCapPriceLow * 200) / 100 : null;
  const tenCapFairValueHigh = tenCapPriceHigh != null ? Math.round(tenCapPriceHigh * 200) / 100 : null;

  const mosPriceLow = mosResultLow?.mosPrice ?? null;
  const mosPriceHigh = mosResultHigh?.mosPrice ?? null;
  const mosFairValueLow = mosResultLow?.fairValue ?? null;
  const mosFairValueHigh = mosResultHigh?.fairValue ?? null;

  const pbtPriceLow = pbtResultLow?.pbtPrice ?? null;
  const pbtPriceHigh = pbtResultHigh?.pbtPrice ?? null;
  const pbtFairValueLow = pbtPriceLow != null ? Math.round(pbtPriceLow * 200) / 100 : null;
  const pbtFairValueHigh = pbtPriceHigh != null ? Math.round(pbtPriceHigh * 200) / 100 : null;

  const ebFairValueLow = ebResultLow?.fairValue > 0 ? ebResultLow.fairValue : null;
  const ebFairValueHigh = ebResultHigh?.fairValue > 0 ? ebResultHigh.fairValue : null;
  const ebBuyLow = ebResultLow?.buyPrice > 0 ? ebResultLow.buyPrice : null;
  const ebBuyHigh = ebResultHigh?.buyPrice > 0 ? ebResultHigh.buyPrice : null;
  const ebReturnLow = ebResultLow?.projectedReturn ?? null;
  const ebReturnHigh = ebResultHigh?.projectedReturn ?? null;

  // Hero = full buy range across ALL enabled methods (lowest conservative → highest optimistic)
  const toggleHero = (key) => {
    setHeroEnabled(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Collect every buy price (low and high) from enabled methods
  const allHeroPrices = [
    heroEnabled.has('10 Cap') && tenCapPriceLow,
    heroEnabled.has('10 Cap') && tenCapPriceHigh,
    heroEnabled.has('MOS') && mosPriceLow,
    heroEnabled.has('MOS') && mosPriceHigh,
    heroEnabled.has('PBT') && pbtPriceLow,
    heroEnabled.has('PBT') && pbtPriceHigh,
    heroEnabled.has('Equity Bond') && ebBuyLow,
    heroEnabled.has('Equity Bond') && ebBuyHigh,
  ].filter(v => typeof v === 'number' && v > 0);

  const heroBuyLow = allHeroPrices.length > 0 ? Math.min(...allHeroPrices) : null;
  const heroBuyHigh = allHeroPrices.length > 0 ? Math.max(...allHeroPrices) : null;

  // Effective values for Equity Bond fields (from result inputs or defaults)
  const effectiveEbBvps = ebResultLow?.inputs?.bvps ?? ebDefaults?.bvps;
  const effectiveEbRoe = ebResultLow?.inputs?.roe ?? ebDefaults?.avgROE;
  const effectiveEbRetainedRatio = ebResultLow?.inputs?.retainedRatio ?? ebDefaults?.retainedRatio;

  // ─── FGR radio group (shared by MOS + PBT) ───────────────

  function FGRRadioGroup({ readOnly }) {
    const radioStyle = (selected) => ({
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '5px 0',
      cursor: readOnly ? 'default' : 'pointer',
      opacity: readOnly ? 0.7 : 1,
    });

    const dot = (selected) => ({
      width: 14,
      height: 14,
      borderRadius: '50%',
      border: `2px solid ${selected ? C.accent : C.textMuted}`,
      background: selected ? C.accent : 'transparent',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    });

    const innerDot = { width: 6, height: 6, borderRadius: '50%', background: '#fff' };

    const valBox = (val, isEditable) => ({
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '3px 8px',
      fontSize: 13,
      fontWeight: 600,
      fontVariantNumeric: 'tabular-nums',
      background: isEditable ? C.bgInput : C.bgHover,
      border: `1px solid ${isEditable ? C.border : 'transparent'}`,
      borderRadius: 6,
      minWidth: 70,
      justifyContent: 'flex-end',
    });

    return (
      <div style={{ marginTop: 4 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.textSecondary, marginBottom: 4 }}>Future Growth Rate</div>

        {/* Analyst GR — locked (data-driven from best available source) */}
        <div style={radioStyle(fgrSource === 'analyst')} onClick={() => !readOnly && setFgrSource('analyst')}>
          <div style={dot(fgrSource === 'analyst')}>
            {fgrSource === 'analyst' && <div style={innerDot} />}
          </div>
          <span style={{ fontSize: 13, color: C.text, flex: 1 }}>
            Analyst GR
            {analystGRSource && (
              <span style={{ fontSize: 10, color: C.textMuted, marginLeft: 4 }}>
                ({analystGRSource === 'finviz' ? 'Finviz 5Y' : analystGRSource === 'gurufocus' ? 'GuruFocus' : 'Yahoo'})
              </span>
            )}
          </span>
          <div style={valBox(analystGR, false)}>
            <LockIcon />
            <span style={{ color: analystGR ? C.text : C.textMuted }}>
              {analystGR ? analystGR + '%' : analystLoading ? 'Loading...' : '—'}
            </span>
          </div>
        </div>

        {/* Composite GR */}
        <div style={radioStyle(fgrSource === 'composite')} onClick={() => !readOnly && setFgrSource('composite')}>
          <div style={dot(fgrSource === 'composite')}>
            {fgrSource === 'composite' && <div style={innerDot} />}
          </div>
          <span style={{ fontSize: 13, color: C.text, flex: 1 }}>Composite GR</span>
          <div style={valBox(compositeGR, false)}>
            <LockIcon />
            <span style={{ color: compositeGR != null ? C.text : C.textMuted }}>
              {compositeGR != null ? (compositeGR * 100).toFixed(2) + '%' : '—'}
            </span>
          </div>
        </div>

        {/* Custom GR */}
        <div style={radioStyle(fgrSource === 'custom')} onClick={() => !readOnly && setFgrSource('custom')}>
          <div style={dot(fgrSource === 'custom')}>
            {fgrSource === 'custom' && <div style={innerDot} />}
          </div>
          <span style={{ fontSize: 13, color: C.text, flex: 1 }}>Your Estimated Future GR</span>
          <div style={valBox(customGR, fgrSource === 'custom' && !readOnly)}>
            {!readOnly && fgrSource === 'custom' ? (
              <>
                <input
                  type="text"
                  inputMode="decimal"
                  value={customGR}
                  onFocus={e => requestAnimationFrame(() => e.target.select())}
                  onChange={e => {
                    const v = e.target.value;
                    if (v === '' || v === '-' || /^-?\d*\.?\d*$/.test(v)) setCustomGR(v);
                  }}
                  placeholder="—"
                  style={{
                    background: 'transparent', border: 'none', outline: 'none',
                    fontSize: 13, fontWeight: 600, color: C.text, textAlign: 'right',
                    width: 55, fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums',
                  }}
                />
                <span style={{ fontSize: 11, color: C.textMuted }}>%</span>
              </>
            ) : (
              <span style={{ color: customGR ? C.text : C.textMuted }}>{customGR ? customGR + '%' : '—'}</span>
            )}
          </div>
        </div>

        {/* FGR Range — editable low/high below radio group */}
        {!readOnly && (
          <RangeFieldRow
            label="FGR Range"
            valueLow={fgrLow != null ? Math.round(fgrLow * 10000) / 100 : ''}
            valueHigh={fgrHigh != null ? Math.round(fgrHigh * 10000) / 100 : ''}
            onChangeLow={v => setFgrLow(isNaN(v) ? null : v / 100)}
            onChangeHigh={v => setFgrHigh(isNaN(v) ? null : v / 100)}
            suffix="%"
          />
        )}
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────

  const cardStyle = {
    background: C.bgCard,
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: 16,
    boxShadow: `0 1px 3px ${C.shadow}`,
  };

  // Summary card value row helper
  const summaryRow = (label, low, high, formatter = fmtNum) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
      <span style={{ fontSize: 12, color: C.textSecondary }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
        {fmtRange(low, high, formatter)}
      </span>
    </div>
  );

  return (
    <div>
      {/* Hero Box */}
      <div style={{
        ...cardStyle,
        border: `2px solid ${C.green}`,
        padding: '20px 28px',
        marginBottom: 16,
        display: 'flex',
        alignItems: 'center',
        gap: 40,
        flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 2 }}>Buy Range</div>
          <div style={{ fontSize: 32, fontWeight: 700, color: C.accent }}>
            {heroBuyLow != null ? fmtRange(heroBuyLow, heroBuyHigh, fmtDollar) : '--'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 2 }}>Last Price</div>
          <div style={{ fontSize: 20, color: C.textSecondary }}>
            {currentPrice != null ? fmtDollar(currentPrice) : '--'}
          </div>
        </div>
        {onSave && (
          <div style={{ marginLeft: 'auto' }}>
            <button
              onClick={onSave}
              style={{
                padding: '8px 18px',
                fontSize: 12,
                fontWeight: 600,
                color: '#fff',
                background: saveStatus === 'saved' ? '#16a34a' : C.accent,
                border: 'none',
                borderRadius: 6,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                transition: 'background .3s',
              }}
            >
              {saveStatus === 'saved'
                ? <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"/>
                    <line x1="5" y1="12" x2="19" y2="12"/>
                  </svg>
              }
              {saveStatus === 'saved' ? 'Saved!' : 'Save Valuation'}
            </button>
          </div>
        )}
      </div>

      {/* Summary Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {/* 10 Cap summary */}
        <div style={{ ...cardStyle, opacity: heroEnabled.has('10 Cap') ? 1 : 0.5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <input type="checkbox" checked={heroEnabled.has('10 Cap')} onChange={() => toggleHero('10 Cap')} style={{ accentColor: C.accent, cursor: 'pointer', margin: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: C.textMuted }}>10 Cap</span>
          </div>
          {summaryRow('10 Cap Price', tenCapPriceLow, tenCapPriceHigh)}
          {summaryRow('Fair Value', tenCapFairValueLow, tenCapFairValueHigh)}
        </div>

        {/* MOS summary */}
        <div style={{ ...cardStyle, opacity: heroEnabled.has('MOS') ? 1 : 0.5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <input type="checkbox" checked={heroEnabled.has('MOS')} onChange={() => toggleHero('MOS')} style={{ accentColor: C.accent, cursor: 'pointer', margin: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: C.textMuted }}>MOS</span>
          </div>
          {summaryRow('MOS Price', mosPriceLow, mosPriceHigh)}
          {summaryRow('Fair Value', mosFairValueLow, mosFairValueHigh)}
        </div>

        {/* PBT summary */}
        <div style={{ ...cardStyle, opacity: heroEnabled.has('PBT') ? 1 : 0.5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <input type="checkbox" checked={heroEnabled.has('PBT')} onChange={() => toggleHero('PBT')} style={{ accentColor: C.accent, cursor: 'pointer', margin: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: C.textMuted }}>PBT</span>
          </div>
          {summaryRow('PBT Price', pbtPriceLow, pbtPriceHigh)}
          {summaryRow('Fair Value', pbtFairValueLow, pbtFairValueHigh)}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: C.textSecondary }}>PBT at Current Price</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
              {pbtAtCurrentPrice != null ? fmtNum(pbtAtCurrentPrice) + ' years' : '--'}
            </span>
          </div>
        </div>

        {/* Equity Bond summary */}
        <div style={{ ...cardStyle, opacity: heroEnabled.has('Equity Bond') ? 1 : 0.5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <input type="checkbox" checked={heroEnabled.has('Equity Bond')} onChange={() => toggleHero('Equity Bond')} style={{ accentColor: C.accent, cursor: 'pointer', margin: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: C.textMuted }}>Equity Bond</span>
          </div>
          {summaryRow('Buy Price', ebBuyLow, ebBuyHigh)}
          {summaryRow('Fair Value', ebFairValueLow, ebFairValueHigh)}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: C.textSecondary }}>CAGR at Current Price</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
              {fmtRange(ebReturnLow, ebReturnHigh, fmtPct)}
            </span>
          </div>
        </div>
      </div>

      {/* ─── 10 Cap Calculator ─────────────────────────────── */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <SectionHeader title="10 Cap" />
        <div style={{ fontSize: 10, color: C.textMuted, marginTop: -4, marginBottom: 4 }}>Values in millions</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 8 }}>
          <div>
            <FieldRow
              label="Cash from Operations"
              value={tenCapDisplay?.operatingCashFlow != null ? tenCapDisplay.operatingCashFlow / 1e6 : ''}
              editable
              decimals={1}
              onChange={v => setTenCapCFO(isNaN(v) ? null : v * 1e6)}
              suffix="M"
            />
            <FieldRow
              label="Capital Expenditures"
              value={tenCapDisplay?.capitalExpenditures != null ? tenCapDisplay.capitalExpenditures / 1e6 : ''}
              editable
              decimals={1}
              onChange={v => setTenCapCapEx(isNaN(v) ? null : v * 1e6)}
              suffix="M"
            />
            <RangeFieldRow
              label="% for Maintenance"
              valueLow={maintenancePctLow * 100}
              valueHigh={maintenancePctHigh * 100}
              onChangeLow={v => setMaintenancePctLow((isNaN(v) ? 70 : v) / 100)}
              onChangeHigh={v => setMaintenancePctHigh((isNaN(v) ? 70 : v) / 100)}
              suffix="%"
            />
            <FieldRow
              label="Maintenance CapEx"
              value={fmtRange(
                tenCapRange?.low?.maintenanceCapEx != null ? -tenCapRange.low.maintenanceCapEx / 1e6 : null,
                tenCapRange?.high?.maintenanceCapEx != null ? -tenCapRange.high.maintenanceCapEx / 1e6 : null,
                v => fmtNum(v, 1),
              )}
              suffix="M"
              icon={{ element: <LockIcon /> }}
            />
          </div>
          <div>
            <FieldRow
              label="Tax Provision"
              value={tenCapDisplay?.taxProvision != null ? tenCapDisplay.taxProvision / 1e6 : ''}
              editable
              decimals={1}
              onChange={v => setTenCapTax(isNaN(v) ? null : v * 1e6)}
              suffix="M"
            />
            <FieldRow
              label="Owner's Earnings"
              value={fmtRange(
                tenCapRange?.low?.ownerEarnings != null ? tenCapRange.low.ownerEarnings / 1e6 : null,
                tenCapRange?.high?.ownerEarnings != null ? tenCapRange.high.ownerEarnings / 1e6 : null,
                v => fmtNum(v, 1),
              )}
              suffix="M"
              icon={{ element: <LockIcon /> }}
            />
            <FieldRow
              label="Shares Outstanding"
              value={tenCapDisplay?.sharesOutstanding != null ? tenCapDisplay.sharesOutstanding / 1e6 : ''}
              editable
              decimals={3}
              onChange={v => setTenCapShares(isNaN(v) ? null : v * 1e6)}
              suffix="M"
            />
            <FieldRow
              label="Owner's Earnings/Share"
              value={fmtRange(
                tenCapRange?.low?.ownerEarningsPerShare,
                tenCapRange?.high?.ownerEarningsPerShare,
              )}
              icon={{ element: <LockIcon /> }}
            />
          </div>
        </div>
      </div>

      {/* ─── Margin of Safety Calculator ───────────────────── */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <SectionHeader title="Margin of Safety" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 8 }}>
          <div>
            <FieldRow
              label={hasTTM ? 'EPS TTM' : 'EPS (Annual)'}
              value={epsTTM ?? ''}
              editable
              onChange={setEpsTTM}
              step="0.01"
              icon={{ element: <EditIcon /> }}
            />
            {FGRRadioGroup({ readOnly: false })}
          </div>
          <div>
            <FieldRow
              label="Future EPS"
              value={fmtRange(mosResultLow?.futureEPS, mosResultHigh?.futureEPS)}
              icon={{ element: <LockIcon /> }}
            />
            <FieldRow
              label="Future P/E"
              value={futurePE != null ? Math.round(futurePE * 100) / 100 : ''}
              editable
              onChange={v => setFuturePE(isNaN(v) ? null : v)}
              decimals={1}
            />
            <FieldRow
              label="Future Value"
              value={fmtRange(mosResultLow?.futurePrice, mosResultHigh?.futurePrice)}
              icon={{ element: <LockIcon /> }}
            />
            <FieldRow
              label="MOS %"
              value={mosDiscount * 100}
              editable
              onChange={v => setMosDiscount((isNaN(v) ? 50 : v) / 100)}
              step="1"
              suffix="%"
            />
            <FieldRow
              label="MARR %"
              value={marr * 100}
              editable
              onChange={v => setMarr((isNaN(v) ? 15 : v) / 100)}
              step="0.5"
              suffix="%"
            />
          </div>
        </div>
      </div>

      {/* ─── Payback Time Calculator ───────────────────────── */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <SectionHeader title="Payback Time" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 8 }}>
          <div>
            <FieldRow
              label={hasTTM ? 'EPS TTM' : 'EPS (Annual)'}
              value={epsTTM ?? ''}
              editable
              onChange={setEpsTTM}
              step="0.01"
              icon={{ element: <EditIcon /> }}
            />
            {FGRRadioGroup({ readOnly: false })}
          </div>
          <div>
            <FieldRow
              label="FCF Ratio"
              value={effectiveFCFRatio != null ? Math.round(effectiveFCFRatio * 100) / 100 : ''}
              editable
              onChange={v => setFcfRatioOverride(isNaN(v) ? null : v)}
              step="0.01"
              icon={{
                element: <RefreshIcon onClick={() => setFcfRatioOverride(null)} />,
                onClick: () => setFcfRatioOverride(null),
              }}
            />
            <FieldRow
              label="FCF Per Share"
              value={pbtFCFPerShare != null ? Math.round(pbtFCFPerShare * 100) / 100 : ''}
              editable
              onChange={v => setPbtFCFPerShare(isNaN(v) ? null : v)}
              step="0.01"
              icon={{
                element: <RefreshIcon onClick={() => setPbtFCFPerShare(null)} />,
                onClick: () => setPbtFCFPerShare(null),
              }}
            />
            <FieldRow
              label="Payback Time Years"
              value={pbtYears}
              editable
              onChange={v => setPbtYears(isNaN(v) ? 8 : Math.round(v))}
              step="1"
            />
          </div>
        </div>
      </div>

      {/* ─── Equity Bond ─────────────────────────────────────── */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <SectionHeader title="Equity Bond" />
        <div style={{ fontSize: 11, color: C.textMuted, marginTop: -4, marginBottom: 4, fontStyle: 'italic' }}>
          The New Buffettology — grow book value via ROE x retention
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 8 }}>
          <div>
            <FieldRow
              label="Book Value Per Share"
              value={effectiveEbBvps ?? ''}
              editable
              onChange={v => setEbBvps(isNaN(v) ? null : v)}
              icon={{ element: <RefreshIcon onClick={() => setEbBvps(null)} />, onClick: () => setEbBvps(null) }}
            />
            <FieldRow
              label="Historical Avg ROE"
              value={effectiveEbRoe != null ? Math.round(effectiveEbRoe * 10000) / 100 : ''}
              editable
              decimals={2}
              onChange={v => setEbRoe(isNaN(v) ? null : v / 100)}
              suffix="%"
              icon={{ element: <RefreshIcon onClick={() => setEbRoe(null)} />, onClick: () => setEbRoe(null) }}
            />
            <FieldRow
              label="Retained Earnings Ratio"
              value={effectiveEbRetainedRatio != null ? Math.round(effectiveEbRetainedRatio * 10000) / 100 : ''}
              editable
              decimals={2}
              onChange={v => setEbRetainedRatio(isNaN(v) ? null : v / 100)}
              suffix="%"
              icon={{ element: <RefreshIcon onClick={() => setEbRetainedRatio(null)} />, onClick: () => setEbRetainedRatio(null) }}
            />
            <RangeFieldRow
              label="Historical Avg P/E"
              valueLow={ebAvgPELow ?? ''}
              valueHigh={ebAvgPEHigh ?? ''}
              onChangeLow={v => setEbAvgPELow(isNaN(v) ? null : v)}
              onChangeHigh={v => setEbAvgPEHigh(isNaN(v) ? null : v)}
            />
            <FieldRow
              label="MOS %"
              value={ebMosDiscount * 100}
              editable
              onChange={v => setEbMosDiscount((isNaN(v) ? 50 : v) / 100)}
              step="1"
              suffix="%"
            />
            <FieldRow
              label="MARR"
              value={ebMarr * 100}
              editable
              onChange={v => setEbMarr((isNaN(v) ? 20 : v) / 100)}
              suffix="%"
            />
          </div>
          <div>
            <FieldRow label="Equity Growth Rate" value={fmtPct(ebResultLow?.equityGrowthRate)} icon={{ element: <LockIcon /> }} />
            <FieldRow label="Future BVPS" value={fmtDollar(ebResultLow?.futureBVPS ?? ebResultHigh?.futureBVPS)} icon={{ element: <LockIcon /> }} />
            <FieldRow label="Future EPS" value={fmtRange(ebResultLow?.futureEPS, ebResultHigh?.futureEPS, fmtDollar)} icon={{ element: <LockIcon /> }} />
            <FieldRow label="Future Stock Price" value={fmtRange(ebResultLow?.futurePrice, ebResultHigh?.futurePrice, fmtDollar)} icon={{ element: <LockIcon /> }} />
            <FieldRow label="CAGR at Current Price" value={fmtRange(ebReturnLow, ebReturnHigh, fmtPct)} icon={{ element: <LockIcon /> }} />
          </div>
        </div>
      </div>

    </div>
  );
}
