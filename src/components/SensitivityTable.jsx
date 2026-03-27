import { C } from '../theme';

// Determine cell color category based on MOS proximity
export function getCellColor(cellValue, currentPrice) {
  if (cellValue == null || cellValue <= 0 || currentPrice == null) return null;
  if (cellValue < currentPrice) return 'undervalued';
  if (cellValue < currentPrice * 1.2) return 'near';
  return 'overvalued';
}

export default function SensitivityTable({
  title,
  rowLabel,
  colLabel,
  rowValues,
  colValues,
  computeCell,
  formatRow,
  formatCol,
  formatCell,
  currentRow,
  currentCol,
  currentPrice,
}) {
  if (!rowValues || !colValues || !computeCell) return null;

  return (
    <div>
      {/* Title */}
      {title && (
        <div style={{
          fontSize: 16,
          fontWeight: 700,
          color: C.text,
          marginBottom: 4,
        }}>
          {title}
        </div>
      )}

      {/* Subtitle — axis labels */}
      {(rowLabel || colLabel) && (
        <div style={{
          fontSize: 10,
          fontWeight: 700,
          color: C.textSecondary,
          marginBottom: 12,
        }}>
          {rowLabel && `Rows: ${rowLabel}`}
          {rowLabel && colLabel && '  |  '}
          {colLabel && `Columns: ${colLabel}`}
        </div>
      )}

      {/* Table */}
      <div style={{
        border: '1px solid ' + C.border,
        borderRadius: 6,
        overflow: 'hidden',
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
        }}>
          <thead>
            <tr>
              {/* Empty top-left cell */}
              <th style={{
                padding: '8px 12px',
                borderBottom: '1px solid ' + C.border,
                background: C.bgCard,
              }} />
              {/* Column headers */}
              {colValues.map((col, ci) => (
                <th key={ci} style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid ' + C.border,
                  fontSize: 10,
                  fontWeight: 700,
                  color: C.textMuted,
                  textAlign: 'right',
                  background: C.bgCard,
                }}>
                  {formatCol ? formatCol(col) : String(col)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowValues.map((row, ri) => (
              <tr key={ri}>
                {/* Row header */}
                <td style={{
                  padding: '8px 12px',
                  borderBottom: ri < rowValues.length - 1 ? '1px solid ' + C.borderLight : 'none',
                  fontSize: 10,
                  fontWeight: 700,
                  color: C.textMuted,
                  textAlign: 'left',
                  background: C.bgCard,
                  whiteSpace: 'nowrap',
                }}>
                  {formatRow ? formatRow(row) : String(row)}
                </td>
                {/* Data cells */}
                {colValues.map((col, ci) => {
                  const cellValue = computeCell(row, col);
                  const isIntersection = row === currentRow && col === currentCol;
                  const colorCategory = getCellColor(cellValue, currentPrice);

                  // Determine cell styling
                  let cellBg = 'transparent';
                  let cellColor = C.text;
                  let cellWeight = 400;
                  let cellRadius = 0;

                  if (isIntersection) {
                    cellBg = C.accentLight;
                    cellColor = C.accent;
                    cellWeight = 700;
                    cellRadius = 4;
                  } else if (colorCategory === 'undervalued') {
                    cellBg = C.greenBg;
                    cellColor = C.green;
                  } else if (colorCategory === 'near') {
                    cellBg = C.yellowBg;
                    cellColor = C.yellow;
                  }
                  // 'overvalued' uses default styling

                  // Guard against null/negative
                  const displayValue = (cellValue == null || cellValue <= 0)
                    ? '--'
                    : (formatCell ? formatCell(cellValue) : String(cellValue));

                  return (
                    <td key={ci} style={{
                      padding: '8px 12px',
                      borderBottom: ri < rowValues.length - 1 ? '1px solid ' + C.borderLight : 'none',
                      fontSize: 13,
                      fontWeight: cellWeight,
                      color: (cellValue == null || cellValue <= 0) ? C.textMuted : cellColor,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      background: (cellValue == null || cellValue <= 0) ? 'transparent' : cellBg,
                      borderRadius: cellRadius,
                    }}>
                      {displayValue}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export const _testExports = { getCellColor };
