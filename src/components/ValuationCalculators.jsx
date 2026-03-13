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
  analystData,
  analystLoading,
  refetchAnalyst,
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

        {/* Analyst GR — locked (data-driven) */}
        <div style={radioStyle(fgrSource === 'analyst')} onClick={() => !readOnly && setFgrSource('analyst')}>
          <div style={dot(fgrSource === 'analyst')}>
            {fgrSource === 'analyst' && <div style={innerDot} />}
          </div>
          <span style={{ fontSize: 13, color: C.text, flex: 1 }}>Analyst GR</span>
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
        alignItems: 'baseline',
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
            {analystLoading && !analystData && (
              <div style={{ fontSize: 11, color: C.textMuted, fontStyle: 'italic', marginTop: 8, padding: '6px 10px' }}>
                Loading analyst data...
              </div>
            )}
            {analystData && (() => {
              const { priceTargets: pt, epsEstimates: eps, revenueEstimates: rev, recommendation: rec, upgrades, numberOfAnalysts, growthRateCurrentYear, growthRateNextYear } = analystData;
              const hasContent = pt || eps || rec || (upgrades && upgrades.length > 0);
              if (!hasContent) return null;

              const timeAgo = (fetchedAt) => {
                if (!fetchedAt) return '';
                const mins = Math.floor((Date.now() - fetchedAt) / 60000);
                if (mins < 1) return 'just now';
                if (mins < 60) return mins + 'm ago';
                const hrs = Math.floor(mins / 60);
                if (hrs < 24) return hrs + 'h ago';
                return Math.floor(hrs / 24) + 'd ago';
              };
              const fetchedAt = analystData._fetchedAt;

              const fmtD = (n) => n == null ? '--' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              const fmtShortDate = (dateStr) => {
                if (!dateStr) return '';
                const d = new Date(dateStr + 'T00:00:00');
                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              };

              const panelStyle = {
                marginTop: 10,
                padding: '10px 12px',
                background: C.bgHover,
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                fontSize: 12,
                lineHeight: 1.5,
              };
              const labelStyle = { fontSize: 11, fontWeight: 600, color: C.textSecondary, textTransform: 'uppercase', letterSpacing: '0.04em' };
              const mutedStyle = { color: C.textMuted, fontSize: 11 };

              return (
                <div style={panelStyle}>
                  {/* Header */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <span style={labelStyle}>Wall Street Consensus</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={mutedStyle}>
                        {numberOfAnalysts != null && `${numberOfAnalysts} analysts`}
                        {fetchedAt && numberOfAnalysts != null && ' · '}
                        {fetchedAt && timeAgo(fetchedAt)}
                      </span>
                      {refetchAnalyst && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ cursor: 'pointer', opacity: analystLoading ? 0.4 : 1 }} onClick={() => !analystLoading && refetchAnalyst()}>
                          <polyline points="23 4 23 10 17 10" />
                          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* EPS Growth Rates */}
                  {(growthRateCurrentYear != null || growthRateNextYear != null) && (
                    <div style={{ marginBottom: 8, display: 'flex', gap: 16, fontSize: 12 }}>
                      <span style={mutedStyle}>EPS Growth</span>
                      {growthRateCurrentYear != null && (
                        <span>
                          <span style={{ color: C.textSecondary }}>This FY: </span>
                          <span style={{ color: growthRateCurrentYear >= 10 ? '#22c55e' : growthRateCurrentYear >= 0 ? C.text : '#ef4444', fontWeight: 600 }}>
                            {growthRateCurrentYear.toFixed(1)}%
                          </span>
                        </span>
                      )}
                      {growthRateNextYear != null && (
                        <span>
                          <span style={{ color: C.textSecondary }}>Next FY: </span>
                          <span style={{ color: growthRateNextYear >= 10 ? '#22c55e' : growthRateNextYear >= 0 ? C.text : '#ef4444', fontWeight: 600 }}>
                            {growthRateNextYear.toFixed(1)}%
                          </span>
                        </span>
                      )}
                    </div>
                  )}

                  {/* Price Targets */}
                  {pt && (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={mutedStyle}>Target Price</span>
                        <span style={mutedStyle}>{fmtD(pt.low)}</span>
                        <span style={{ color: C.textMuted, fontSize: 10 }}>—</span>
                        <span style={{ fontWeight: 600, color: C.text, fontSize: 13 }}>{fmtD(pt.mean)}</span>
                        <span style={{ color: C.textMuted, fontSize: 10 }}>—</span>
                        <span style={mutedStyle}>{fmtD(pt.high)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginLeft: 76 }}>
                        <span style={{ ...mutedStyle, fontSize: 10 }}>low</span>
                        <span style={{ ...mutedStyle, fontSize: 10, marginLeft: 12 }}>mean</span>
                        <span style={{ ...mutedStyle, fontSize: 10, marginLeft: 8 }}>high</span>
                      </div>
                    </div>
                  )}

                  {/* EPS Estimates */}
                  {eps && (
                    <div style={{ marginBottom: 8 }}>
                      <span style={mutedStyle}>EPS Est.</span>
                      <div style={{ marginTop: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {eps.currentYear && (
                          <div style={{ display: 'flex', gap: 6, fontSize: 12 }}>
                            <span style={{ color: C.textSecondary, minWidth: 42 }}>FY{eps.currentYear.date?.slice(0, 4) || ''}:</span>
                            <span style={mutedStyle}>{fmtD(eps.currentYear.low)}</span>
                            <span style={{ color: C.text, fontWeight: 600 }}>{fmtD(eps.currentYear.avg)}</span>
                            <span style={mutedStyle}>{fmtD(eps.currentYear.high)}</span>
                          </div>
                        )}
                        {eps.nextYear && (
                          <div style={{ display: 'flex', gap: 6, fontSize: 12 }}>
                            <span style={{ color: C.textSecondary, minWidth: 42 }}>FY{eps.nextYear.date?.slice(0, 4) || ''}:</span>
                            <span style={mutedStyle}>{fmtD(eps.nextYear.low)}</span>
                            <span style={{ color: C.text, fontWeight: 600 }}>{fmtD(eps.nextYear.avg)}</span>
                            <span style={mutedStyle}>{fmtD(eps.nextYear.high)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Revenue Estimates */}
                  {rev && (
                    <div style={{ marginBottom: 8 }}>
                      <span style={mutedStyle}>Rev. Est.</span>
                      <div style={{ marginTop: 2, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        {rev.currentYear && (
                          <div style={{ display: 'flex', gap: 6, fontSize: 12, alignItems: 'baseline' }}>
                            <span style={{ color: C.textSecondary, minWidth: 42 }}>FY{rev.currentYear.date?.slice(0, 4) || ''}:</span>
                            <span style={{ color: C.text, fontWeight: 600 }}>{fmtLargeDollar(rev.currentYear.avg)}</span>
                            {rev.currentYear.growth != null && (
                              <span style={{ color: rev.currentYear.growth >= 0 ? '#22c55e' : '#ef4444', fontSize: 11 }}>
                                ({(rev.currentYear.growth * 100).toFixed(1)}%)
                              </span>
                            )}
                          </div>
                        )}
                        {rev.nextYear && (
                          <div style={{ display: 'flex', gap: 6, fontSize: 12, alignItems: 'baseline' }}>
                            <span style={{ color: C.textSecondary, minWidth: 42 }}>FY{rev.nextYear.date?.slice(0, 4) || ''}:</span>
                            <span style={{ color: C.text, fontWeight: 600 }}>{fmtLargeDollar(rev.nextYear.avg)}</span>
                            {rev.nextYear.growth != null && (
                              <span style={{ color: rev.nextYear.growth >= 0 ? '#22c55e' : '#ef4444', fontSize: 11 }}>
                                ({(rev.nextYear.growth * 100).toFixed(1)}%)
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Recommendation Bar */}
                  {rec && rec.total > 0 && (() => {
                    const buyPct = ((rec.strongBuy + rec.buy) / rec.total) * 100;
                    const holdPct = (rec.hold / rec.total) * 100;
                    const sellPct = ((rec.sell + rec.strongSell) / rec.total) * 100;
                    return (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 4 }}>
                          {buyPct > 0 && <div style={{ width: buyPct + '%', background: '#22c55e' }} />}
                          {holdPct > 0 && <div style={{ width: holdPct + '%', background: C.textMuted }} />}
                          {sellPct > 0 && <div style={{ width: sellPct + '%', background: '#ef4444' }} />}
                        </div>
                        <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                          <span style={{ color: '#22c55e' }}>{rec.strongBuy + rec.buy} Buy</span>
                          <span style={{ color: C.textMuted }}>{rec.hold} Hold</span>
                          <span style={{ color: '#ef4444' }}>{rec.sell + rec.strongSell} Sell</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Recent Upgrades/Downgrades */}
                  {upgrades && upgrades.length > 0 && (
                    <div>
                      {upgrades.slice(0, 3).map((u, i) => {
                        const isUp = u.action === 'upgrade' || u.action === 'up';
                        const isDown = u.action === 'downgrade' || u.action === 'down';
                        const arrow = isUp ? '↑' : isDown ? '↓' : '→';
                        const arrowColor = isUp ? '#22c55e' : isDown ? '#ef4444' : C.textMuted;
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, lineHeight: 1.6 }}>
                            <span style={{ color: arrowColor, fontWeight: 700, width: 10, textAlign: 'center' }}>{arrow}</span>
                            <span style={mutedStyle}>{fmtShortDate(u.date)}</span>
                            <span style={{ color: C.text, fontWeight: 500, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.firm}</span>
                            <span style={mutedStyle}>
                              {u.fromGrade && u.toGrade ? `${u.fromGrade} → ${u.toGrade}` : u.toGrade || u.fromGrade || ''}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
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

      {/* Save Valuation button */}
      {onSave && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button
            onClick={onSave}
            style={{
              padding: '7px 18px',
              fontSize: 12,
              fontWeight: 600,
              color: '#fff',
              background: C.accent,
              border: 'none',
              borderRadius: 6,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Save Valuation
          </button>
        </div>
      )}
    </div>
  );
}
