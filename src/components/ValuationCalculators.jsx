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

function fmtLargeDollar(n) {
  if (n == null || isNaN(n)) return '--';
  const prefix = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1e6) return prefix + fmtNum(abs / 1e6, 1) + 'M';
  if (abs >= 1e3) return prefix + fmtNum(abs / 1e3, 1) + 'K';
  return prefix + fmtNum(abs, 1);
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
              // Show raw number (no commas) when user clicks into field
              setLocalVal(value != null && !isNaN(value) ? String(value) : '');
              // Select all so typing replaces the old value
              requestAnimationFrame(() => e.target.select());
            }}
            onBlur={() => {
              setFocused(false);
              // Commit the local value on blur
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
  tenCapData,
  tenCapDefaults,
  mosResult,
  pbtResult,
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
  maintenancePct,
  setMaintenancePct,
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
  // Equity Bond
  ebResult,
  ebDefaults,
  setEbBvps,
  setEbRoe,
  setEbRetainedRatio,
  setEbAvgPE,
  heroEnabled,
  setHeroEnabled,
  onSave,
  saveStatus,
  analystData,
  analystLoading,
  refetchAnalyst,
  analystGRSource,
}) {
  // Determine buy prices
  const tenCapPrice = tenCapData?.tenCapPrice ?? null;
  const tenCapSticker = tenCapPrice != null ? Math.round(tenCapPrice * 200) / 100 : null;
  const mosPrice = mosResult?.mosPrice ?? null;
  const mosSticker = mosResult?.stickerPrice ?? null;
  const pbtPrice = pbtResult?.pbtPrice ?? null;
  const pbtSticker = pbtPrice != null ? Math.round(pbtPrice * 200) / 100 : null;

  // Equity Bond — Method B only
  const ebBuyPrice = ebResult?.buyPrice ?? null;
  const ebHeroBuy = ebBuyPrice != null && ebBuyPrice > 0 ? ebBuyPrice : null;
  const ebHeroFuturePrice = ebResult?.futurePrice ?? null;
  const ebHeroReturn = ebResult?.projectedReturnAtCurrentPrice ?? null;

  // Hero = highest buy price among enabled methods
  const toggleHero = (key) => {
    setHeroEnabled(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const methods = [
    { key: '10 Cap', buy: tenCapPrice, sticker: tenCapSticker },
    { key: 'MOS', buy: mosPrice, sticker: mosSticker },
    { key: 'PBT', buy: pbtPrice, sticker: pbtSticker },
    { key: 'Equity Bond', buy: ebHeroBuy, sticker: ebHeroFuturePrice },
  ].filter(m => m.buy != null && m.buy > 0 && heroEnabled.has(m.key));

  const hero = methods.length > 0
    ? methods.reduce((a, b) => a.buy > b.buy ? a : b)
    : null;

  // Effective values for Equity Bond fields (override ?? default, fallback from result inputs)
  const effectiveEbBvps = ebResult?.inputs?.bvps ?? ebDefaults?.bvps;
  const effectiveEbRoe = ebResult?.inputs?.roe ?? ebDefaults?.avgROE;
  const effectiveEbRetainedRatio = ebResult?.inputs?.retainedRatio ?? ebDefaults?.retainedRatio;
  const effectiveEbPE = ebResult?.inputs?.historicalPE ?? ebDefaults?.avgPE;

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
          <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 2 }}>
            {hero ? `Buy Price (${hero.key})` : 'Buy Price'}
          </div>
          <div style={{ fontSize: 32, fontWeight: 700, color: C.accent }}>
            {hero ? fmtDollar(hero.buy) : '--'}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: C.textSecondary, marginBottom: 2 }}>{hero?.key === 'Equity Bond' ? 'Future Price (10yr)' : 'Sticker Price'}</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: C.text }}>
            {hero ? fmtDollar(hero.sticker) : '--'}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: C.textSecondary }}>10 CAP Price</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{fmtNum(tenCapPrice)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: C.textSecondary }}>10 CAP Sticker Price</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{fmtNum(tenCapSticker)}</span>
          </div>
        </div>

        {/* MOS summary */}
        <div style={{ ...cardStyle, opacity: heroEnabled.has('MOS') ? 1 : 0.5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <input type="checkbox" checked={heroEnabled.has('MOS')} onChange={() => toggleHero('MOS')} style={{ accentColor: C.accent, cursor: 'pointer', margin: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: C.textMuted }}>MOS</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: C.textSecondary }}>MOS Price</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{fmtNum(mosPrice)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: C.textSecondary }}>MOS Sticker Price</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{fmtNum(mosSticker)}</span>
          </div>
        </div>

        {/* PBT summary */}
        <div style={{ ...cardStyle, opacity: heroEnabled.has('PBT') ? 1 : 0.5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <input type="checkbox" checked={heroEnabled.has('PBT')} onChange={() => toggleHero('PBT')} style={{ accentColor: C.accent, cursor: 'pointer', margin: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: C.textMuted }}>PBT</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: C.textSecondary }}>PBT Price</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{fmtNum(pbtPrice)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: C.textSecondary }}>PBT Sticker Price</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{fmtNum(pbtSticker)}</span>
          </div>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: C.textSecondary }}>Buy Price</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{fmtNum(ebHeroBuy)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, color: C.textSecondary }}>Projected Return</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontVariantNumeric: 'tabular-nums' }}>
              {ebHeroReturn != null ? fmtPct(ebHeroReturn) : '--'}
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
              value={tenCapData?.operatingCashFlow != null ? tenCapData.operatingCashFlow / 1e6 : ''}
              editable
              decimals={1}
              onChange={v => setTenCapCFO(isNaN(v) ? null : v * 1e6)}
              suffix="M"
            />
            <FieldRow
              label="Capital Expenditures"
              value={tenCapData?.capitalExpenditures != null ? tenCapData.capitalExpenditures / 1e6 : ''}
              editable
              decimals={1}
              onChange={v => setTenCapCapEx(isNaN(v) ? null : v * 1e6)}
              suffix="M"
            />
            <FieldRow
              label="% for Maintenance"
              value={maintenancePct * 100}
              editable
              decimals={2}
              onChange={v => setMaintenancePct((isNaN(v) ? 70 : v) / 100)}
              suffix="%"
            />
            <FieldRow
              label="Maintenance CapEx"
              value={tenCapData?.maintenanceCapEx != null ? -tenCapData.maintenanceCapEx / 1e6 : ''}
              editable
              decimals={1}
              onChange={v => setTenCapMaintCapEx(isNaN(v) ? null : -v * 1e6)}
              suffix="M"
            />
          </div>
          <div>
            <FieldRow
              label="Tax Provision"
              value={tenCapData?.taxProvision != null ? tenCapData.taxProvision / 1e6 : ''}
              editable
              decimals={1}
              onChange={v => setTenCapTax(isNaN(v) ? null : v * 1e6)}
              suffix="M"
            />
            <FieldRow
              label="Owner's Earnings"
              value={fmtNum(tenCapData?.ownerEarnings != null ? tenCapData.ownerEarnings / 1e6 : null, 1)}
              suffix="M"
              icon={{ element: <LockIcon /> }}
            />
            <FieldRow
              label="Shares Outstanding"
              value={tenCapData?.sharesOutstanding != null ? tenCapData.sharesOutstanding / 1e6 : ''}
              editable
              decimals={3}
              onChange={v => setTenCapShares(isNaN(v) ? null : v * 1e6)}
              suffix="M"
            />
            <FieldRow
              label="Owner's Earnings Per Share"
              value={fmtNum(tenCapData?.ownerEarningsPerShare)}
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
              value={fmtNum(mosResult?.futureEPS)}
              icon={{ element: <LockIcon /> }}
            />
            <FieldRow
              label="Future P/E"
              value={futurePE != null ? Math.round(futurePE * 100) / 100 : ''}
              editable
              onChange={v => setFuturePE(isNaN(v) ? null : v)}
              step="0.01"
            />
            <FieldRow
              label="Future Value"
              value={fmtNum(mosResult?.futurePrice)}
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
          The New Buffettology — grow book value via ROE × retention
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
            <FieldRow
              label="Historical Avg P/E"
              value={effectiveEbPE ?? ''}
              editable
              onChange={v => setEbAvgPE(isNaN(v) ? null : v)}
              icon={{ element: <RefreshIcon onClick={() => setEbAvgPE(null)} />, onClick: () => setEbAvgPE(null) }}
            />
            <FieldRow
              label="MARR"
              value={marr * 100}
              editable
              onChange={v => setMarr((isNaN(v) ? 15 : v) / 100)}
              suffix="%"
            />
          </div>
          <div>
            <FieldRow label="Equity Growth Rate" value={fmtPct(ebResult?.equityGrowthRate)} icon={{ element: <LockIcon /> }} />
            <FieldRow label="Future BVPS" value={fmtDollar(ebResult?.futureBVPS)} icon={{ element: <LockIcon /> }} />
            <FieldRow label="Future EPS" value={fmtDollar(ebResult?.futureEPS)} icon={{ element: <LockIcon /> }} />
            <FieldRow label="Future Stock Price" value={fmtDollar(ebResult?.futurePrice)} icon={{ element: <LockIcon /> }} />
            <FieldRow label="Buy Price" value={fmtDollar(ebResult?.buyPrice)} icon={{ element: <LockIcon /> }} />
            <FieldRow label="Projected Return" value={fmtPct(ebResult?.projectedReturnAtCurrentPrice)} icon={{ element: <LockIcon /> }} />
          </div>
        </div>
      </div>

    </div>
  );
}
