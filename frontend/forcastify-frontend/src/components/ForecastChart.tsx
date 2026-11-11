import { useEffect, useMemo, useState } from 'react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { getForecastWithHistory } from '../api/forecast'
import type { TrendPoint } from '../api/types'

interface ForecastChartProps {
  productId: string
  storeId: string
}

function formatDateTick(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    }
  } catch {
    // fallback
  }
  return dateStr
}

function formatDateFull(dateStr: string): string {
  if (!dateStr) return ''
  try {
    const parts = dateStr.split('-')
    if (parts.length === 3) {
      const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
      return date.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    }
  } catch {
    // fallback
  }
  return dateStr
}

interface CustomTooltipProps {
  active?: boolean
  payload?: Array<{
    name: string
    value: number | null
    color: string
    dataKey: string
  }>
  label?: string
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0 || !label) {
    return null
  }

  const validEntries = payload.filter((item) => item.value !== null && item.value !== undefined)
  if (validEntries.length === 0) return null

  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-date">{formatDateFull(label)}</p>
      <div className="chart-tooltip-items">
        {validEntries.map((entry) => (
          <div key={entry.dataKey} className="chart-tooltip-item">
            <span
              className="chart-tooltip-dot"
              style={{ backgroundColor: entry.name === 'Actual' ? '#059669' : '#2563eb' }}
            />
            <span className="chart-tooltip-label">{entry.name}:</span>
            <span className="chart-tooltip-value">
              {Math.round(entry.value!).toLocaleString()} units
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

const EMPTY_POINTS: TrendPoint[] = []

function ForecastChart({ productId, storeId }: ForecastChartProps) {
  const [points, setPoints] = useState<TrendPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!productId || !storeId) {
      return
    }

    let cancelled = false
    Promise.resolve().then(() => {
      if (!cancelled) {
        setLoading(true)
        setError(null)
      }
    })

    getForecastWithHistory(productId, storeId, 90)
      .then((response) => {
        if (!cancelled) setPoints(response.points || [])
      })
      .catch(() => {
        if (!cancelled) setError('Unable to load forecast data from server.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [productId, storeId])

  const activePoints = useMemo(
    () => (productId && storeId ? points : EMPTY_POINTS),
    [productId, storeId, points],
  )

  // Bridge boundary point so actual and predicted line connects smoothly
  const chartData = useMemo(() => {
    if (activePoints.length === 0) return []
    let lastActualIdx = -1
    for (let i = activePoints.length - 1; i >= 0; i--) {
      if (activePoints[i].actual_units !== null) {
        lastActualIdx = i
        break
      }
    }

    if (lastActualIdx >= 0 && lastActualIdx < activePoints.length - 1) {
      return activePoints.map((p, idx) => {
        if (idx === lastActualIdx && p.predicted_units === null) {
          return { ...p, predicted_units: p.actual_units }
        }
        return p
      })
    }
    return activePoints
  }, [activePoints])

  const boundaryDate = useMemo(() => {
    for (let i = activePoints.length - 1; i >= 0; i--) {
      if (activePoints[i].actual_units !== null) {
        return activePoints[i].date
      }
    }
    return undefined
  }, [activePoints])

  if (!productId || !storeId) {
    return (
      <div className="panel chart-panel empty-state">
        <div className="empty-state-content">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="18" y1="20" x2="18" y2="10" />
            <line x1="12" y1="20" x2="12" y2="4" />
            <line x1="6" y1="20" x2="6" y2="14" />
          </svg>
          <h3>No Series Selected</h3>
          <p>Please select a product and store above to display historical sales and ML forecasts.</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="panel chart-panel empty-state">
        <div className="loading-state-content">
          <span className="spinner" aria-label="Loading forecast" />
          <p>Fetching historical sales and running 30-day forecast projection…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="panel chart-panel empty-state">
        <div className="error-state-content">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <p className="error-text">{error}</p>
        </div>
      </div>
    )
  }

  if (chartData.length === 0) {
    return (
      <div className="panel chart-panel empty-state">
        <div className="empty-state-content">
          <p>No historical or forecast records found for this combination.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="panel chart-panel">
      <div className="chart-header">
        <div>
          <h2>Forecast vs. Historical Actuals</h2>
          <span className="chart-subtitle">90-Day History &bull; 30-Day Model Projection</span>
        </div>
        <div className="chart-legend-pills">
          <span className="chart-pill chart-pill--actual">
            <span className="chart-pill-dot" /> Historical Actuals
          </span>
          <span className="chart-pill chart-pill--predicted">
            <span className="chart-pill-dot" /> ML Predicted
          </span>
        </div>
      </div>

      <div className="chart-container-wrap">
        <ResponsiveContainer width="100%" height={380}>
          <AreaChart data={chartData} margin={{ top: 20, right: 16, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="actualGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#059669" stopOpacity={0.16} />
                <stop offset="95%" stopColor="#059669" stopOpacity={0.0} />
              </linearGradient>
              <linearGradient id="predictedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563eb" stopOpacity={0.14} />
                <stop offset="95%" stopColor="#2563eb" stopOpacity={0.0} />
              </linearGradient>
            </defs>

            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.7} />

            <XAxis
              dataKey="date"
              stroke="var(--text-muted)"
              fontSize={12}
              tickLine={false}
              axisLine={{ stroke: 'var(--border)' }}
              tickFormatter={formatDateTick}
              minTickGap={35}
            />

            <YAxis
              stroke="var(--text-muted)"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val: number) => val.toLocaleString()}
            />

            <Tooltip content={<CustomTooltip />} />

            <Legend wrapperStyle={{ display: 'none' }} />

            {boundaryDate && (
              <ReferenceLine
                x={boundaryDate}
                stroke="var(--text-muted)"
                strokeDasharray="4 4"
                strokeWidth={1.5}
                label={{
                  value: 'Forecast Start',
                  position: 'insideTopRight',
                  fill: 'var(--text-muted)',
                  fontSize: 11,
                  fontWeight: 600,
                  offset: 8,
                }}
              />
            )}

            <Area
              type="monotone"
              dataKey="actual_units"
              name="Actual"
              stroke="#059669"
              strokeWidth={2}
              fill="url(#actualGradient)"
              dot={false}
              activeDot={{ r: 4, stroke: '#059669', strokeWidth: 2, fill: '#fff' }}
              connectNulls={false}
            />

            <Area
              type="monotone"
              dataKey="predicted_units"
              name="Predicted"
              stroke="#2563eb"
              strokeWidth={2}
              strokeDasharray="5 4"
              fill="url(#predictedGradient)"
              dot={false}
              activeDot={{ r: 4, stroke: '#2563eb', strokeWidth: 2, fill: '#fff' }}
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default ForecastChart
