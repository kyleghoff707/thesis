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

function GrowthChart({ series, label }) {
  if (!series || series.length === 0) return null;

  const chartData = series.map(d => ({
    year: d.year.toString(),
    value: d.value,
  }));

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.textSecondary, marginBottom: 4 }}>
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
              borderRadius: 6,
              fontSize: 12,
              color: C.text,
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
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
      <thead>
        <tr style={{ borderBottom: `1px solid ${C.border}` }}>
          <th style={{ textAlign: 'left', padding: '6px 12px', color: C.textSecondary, fontSize: 11, fontWeight: 600 }}>
            Growth Metric
          </th>
          {PERIOD_LABELS.map(p => (
            <th key={p} style={{
              textAlign: 'right',
              padding: '6px 12px',
              color: p === '1yr' ? C.textMuted : C.textSecondary,
              fontSize: 11,
              fontWeight: 600,
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
              <td style={{ padding: '6px 12px', color: C.text, fontWeight: 500 }}>
                {METRIC_LABELS[m]}
              </td>
              {PERIOD_LABELS.map(p => {
                const rate = rates[p];
                const color = p === '1yr' ? 'gray' : cellColor(rate);
                const fgMap = { green: C.green, yellow: C.yellow, red: C.red, gray: C.textMuted };
                const bgMap = { green: C.greenBg, yellow: C.yellowBg, red: C.redBg, gray: 'transparent' };

                return (
                  <td key={p} style={{
                    textAlign: 'right',
                    padding: '6px 12px',
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                    color: fgMap[color],
                    background: bgMap[color],
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
  );
}

export default function GrowthAnalysis({ growthRates, series }) {
  if (!growthRates) return null;

  return (
    <div>
      {/* CAGR table */}
      <GrowthRateTable growthRates={growthRates} />

      {/* Bar charts for each metric */}
      <div style={{ marginTop: 20 }}>
        {Object.entries(METRIC_LABELS).map(([key, label]) => (
          <GrowthChart key={key} series={series?.[key]} label={label} />
        ))}
      </div>
    </div>
  );
}
