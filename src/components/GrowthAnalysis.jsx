import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { C } from '../theme';
import { cellColor } from '../engines/ruleOneScore';

const METRIC_LABELS = {
  bvps: 'BVPS + Dividends',
  earnings: 'Earnings (Net Income)',
  revenue: 'Revenue',
  operatingCash: 'Operating Cash Flow',
  fcf: 'Free Cash Flow',
  retainedEarnings: 'Retained Earnings',
};

const PERIOD_LABELS = ['10yr', '7yr', '5yr', '3yr', '1yr'];

const CHART_YEAR_OPTIONS = [
  { value: '5', label: '5 Years' },
  { value: '10', label: '10 Years' },
  { value: '13', label: '13 Years' },
  { value: 'all', label: 'All' },
];

function GrowthChart({ series, label }) {
  if (!series || series.length === 0) return null;

  const chartData = series.map(d => ({
    year: d.year.toString(),
    value: d.value,
  }));

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        color: C.textMuted,
        marginBottom: 4,
        textTransform: 'uppercase',
        letterSpacing: '0.03em',
      }}>
        {label}
      </div>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={chartData}>
          <XAxis
            dataKey="year"
            tick={{ fontSize: 10, fill: C.textMuted }}
            tickLine={false}
            axisLine={{ stroke: C.border }}
          />
          <YAxis
            tick={{ fontSize: 10, fill: C.textMuted }}
            tickLine={false}
            axisLine={false}
            width={65}
            tickFormatter={v => {
              if (Math.abs(v) >= 1e9) return '$' + (v / 1e9).toFixed(0) + 'B';
              if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M';
              return '$' + v.toFixed(2);
            }}
          />
          <Tooltip
            contentStyle={{
              background: C.bgCard,
              border: `1px solid ${C.border}`,
              borderRadius: 8,
              fontSize: 12,
              color: C.text,
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            }}
            formatter={v => {
              if (Math.abs(v) >= 1e9) return ['$' + (v / 1e9).toFixed(2) + 'B', label];
              if (Math.abs(v) >= 1e6) return ['$' + (v / 1e6).toFixed(1) + 'M', label];
              return ['$' + v.toFixed(2), label];
            }}
          />
          <Bar dataKey="value" radius={[2, 2, 0, 0]}>
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.value >= 0 ? C.accent : C.red} fillOpacity={0.8} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function GrowthRateTable({ growthRates }) {
  const metrics = Object.keys(METRIC_LABELS);

  return (
    <div style={{
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      overflow: 'hidden',
      boxShadow: '0 1px 3px 0 rgba(0,0,0,0.04)',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: C.headerBg }}>
            <th style={{
              textAlign: 'left',
              padding: '10px 14px',
              color: C.textMuted,
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              borderBottom: `1px solid ${C.border}`,
            }}>
              Growth Metric
            </th>
            {PERIOD_LABELS.map(p => (
              <th key={p} style={{
                textAlign: 'right',
                padding: '10px 14px',
                color: C.textMuted,
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
                borderBottom: `1px solid ${C.border}`,
              }}>
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map(m => {
            const rates = growthRates[m];
            if (!rates || Object.keys(rates).length === 0) return null;

            return (
              <tr key={m} style={{ borderBottom: `1px solid ${C.borderLight}` }}>
                <td style={{ padding: '8px 14px', color: C.text, fontWeight: 500, fontSize: 12 }}>
                  {METRIC_LABELS[m]}
                </td>
                {PERIOD_LABELS.map(p => {
                  const rate = rates[p];
                  const color = p === '1yr' ? 'gray' : cellColor(rate);
                  const fgMap = { green: C.green, yellow: C.yellow, red: C.red, gray: C.textMuted };

                  return (
                    <td key={p} style={{
                      textAlign: 'right',
                      padding: '8px 14px',
                      fontWeight: 600,
                      fontSize: 12,
                      fontVariantNumeric: 'tabular-nums',
                      color: fgMap[color],
                      background: color === 'green' ? C.green + '14'
                        : color === 'yellow' ? C.yellow + '14'
                        : color === 'red' ? C.red + '14'
                        : 'transparent',
                    }}>
                      {rate != null ? (rate * 100).toFixed(1) + '%' : '--'}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function GrowthAnalysis({ growthRates, series, settings }) {
  const [chartYears, setChartYears] = useState(settings?.growthChartYears || 'all');

  if (!growthRates) return null;

  const yearCount = chartYears === 'all' ? Infinity : parseInt(chartYears);

  return (
    <div>
      {/* CAGR table */}
      <GrowthRateTable growthRates={growthRates} />

      {/* Chart years control */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, marginBottom: 4 }}>
        <span style={{
          fontSize: 11,
          color: C.textMuted,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
        }}>Chart Years:</span>
        <select
          value={chartYears}
          onChange={e => setChartYears(e.target.value)}
          style={{
            padding: '6px 10px', fontSize: 13, fontWeight: 500,
            background: C.bgCard, color: C.text,
            border: `1px solid ${C.border}`, borderRadius: 6,
            cursor: 'pointer', fontFamily: 'inherit', outline: 'none',
          }}
        >
          {CHART_YEAR_OPTIONS.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Bar charts for each metric */}
      <div style={{ marginTop: 8 }}>
        {Object.entries(METRIC_LABELS).map(([key, label]) => {
          const data = series?.[key];
          const sliced = data && yearCount < Infinity ? data.slice(-yearCount) : data;
          return <GrowthChart key={key} series={sliced} label={label} />;
        })}
      </div>
    </div>
  );
}
