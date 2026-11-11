import { useEffect, useState } from 'react'
import { getKPIs } from '../api/chat'
import type { KPISummary } from '../api/types'
import { useCountUp } from '../hooks/useCountUp'

function formatUnits(value: number | null): string {
  if (value === null) return '—'
  return Math.round(value).toLocaleString()
}

function formatCurrency(value: number | null): string {
  if (value === null) return '—'
  return `$${Math.round(value).toLocaleString()}`
}

function CategoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  )
}

function ProductIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m7.5 4.27 9 5.15" />
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  )
}

function RiskIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function RevenueIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="12" y1="1" x2="12" y2="23" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  )
}

function KPIBar() {
  const [kpis, setKpis] = useState<KPISummary | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    getKPIs()
      .then((data) => {
        if (!cancelled) {
          setKpis(data)
          setError(false)
        }
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [retryCount])

  const handleRetry = () => {
    setLoading(true)
    setError(false)
    setRetryCount((prev) => prev + 1)
  }

  const categoryUnits = useCountUp(kpis?.top_category.total_units ?? null)
  const productUnits = useCountUp(kpis?.top_product.total_units ?? null)
  const atRiskCount = useCountUp(kpis ? kpis.at_risk_count : null, 700)
  const revenue = useCountUp(kpis?.predicted_revenue.total_predicted_revenue ?? null, 1000)

  if (error) {
    return (
      <div className="banner error-banner kpi-error" role="alert">
        <div className="banner-content">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>Unable to connect to Databricks for KPI summary metrics.</span>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={handleRetry} disabled={loading}>
          {loading ? 'Retrying…' : 'Retry'}
        </button>
      </div>
    )
  }

  return (
    <div className="kpi-bar" aria-label="Key Performance Indicators">
      <div className="kpi-card kpi-card--category">
        <div className="kpi-card-header">
          <span className="kpi-label">Top Category</span>
          <div className="kpi-icon-wrap" aria-hidden="true">
            <CategoryIcon />
          </div>
        </div>
        <div className="kpi-value-row">
          <span className="kpi-value" title={kpis?.top_category.category ?? undefined}>
            {loading ? <span className="kpi-skeleton" /> : (kpis?.top_category.category ?? '—')}
          </span>
        </div>
        <div className="kpi-subvalue">
          {loading ? (
            <span className="kpi-skeleton kpi-skeleton--sm" />
          ) : kpis?.top_category.total_units != null ? (
            <span><strong>{formatUnits(categoryUnits)}</strong> units sold</span>
          ) : (
            <span>No historical data</span>
          )}
        </div>
      </div>

      <div className="kpi-card kpi-card--product">
        <div className="kpi-card-header">
          <span className="kpi-label">Top Product</span>
          <div className="kpi-icon-wrap" aria-hidden="true">
            <ProductIcon />
          </div>
        </div>
        <div className="kpi-value-row">
          <span className="kpi-value" title={kpis?.top_product.product_name ?? undefined}>
            {loading ? <span className="kpi-skeleton" /> : (kpis?.top_product.product_name ?? '—')}
          </span>
        </div>
        <div className="kpi-subvalue">
          {loading ? (
            <span className="kpi-skeleton kpi-skeleton--sm" />
          ) : kpis?.top_product.total_units != null ? (
            <span><strong>{formatUnits(productUnits)}</strong> units sold</span>
          ) : (
            <span>No historical data</span>
          )}
        </div>
      </div>

      <div className="kpi-card kpi-card--risk">
        <div className="kpi-card-header">
          <span className="kpi-label">At-Risk Items</span>
          <div className="kpi-icon-wrap" aria-hidden="true">
            <RiskIcon />
          </div>
        </div>
        <div className="kpi-value-row">
          <span className="kpi-value">
            {loading ? <span className="kpi-skeleton" /> : (atRiskCount !== null ? Math.round(atRiskCount) : '—')}
          </span>
        </div>
        <div className="kpi-subvalue">
          {loading ? (
            <span className="kpi-skeleton kpi-skeleton--sm" />
          ) : (
            <span className="kpi-tag kpi-tag--warning">Trending down &gt;10%</span>
          )}
        </div>
      </div>

      <div className="kpi-card kpi-card--revenue">
        <div className="kpi-card-header">
          <span className="kpi-label">Predicted Revenue (30d)</span>
          <div className="kpi-icon-wrap" aria-hidden="true">
            <RevenueIcon />
          </div>
        </div>
        <div className="kpi-value-row">
          <span className="kpi-value">
            {loading ? <span className="kpi-skeleton" /> : formatCurrency(revenue)}
          </span>
        </div>
        <div className="kpi-subvalue">
          {loading ? (
            <span className="kpi-skeleton kpi-skeleton--sm" />
          ) : (
            <span>Estimated aggregate forecast</span>
          )}
        </div>
      </div>
    </div>
  )
}

export default KPIBar
