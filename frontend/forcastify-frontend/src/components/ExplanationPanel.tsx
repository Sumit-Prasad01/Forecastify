import { useState } from 'react'
import axios from 'axios'
import ReactMarkdown from 'react-markdown'
import { explainForecast } from '../api/forecast'
import type { ForecastExplanation } from '../api/types'

interface ExplanationPanelProps {
  productId: string
  storeId: string
}

function formatPercent(value: number | null): string {
  if (value === null) return 'N/A'
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

function SummaryCards({ summary }: { summary: ForecastExplanation['forecast_summary'] }) {
  const isPositive = (summary.vs_recent_history_pct_change ?? 0) >= 0

  return (
    <div className="stat-cards">
      <div className="stat-card">
        <span className="stat-label">Avg Predicted Units/Day</span>
        <span className="stat-value">{summary.avg_predicted_units.toFixed(1)}</span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Total 30-Day Volume</span>
        <span className="stat-value">{Math.round(summary.total_predicted_units).toLocaleString()}</span>
      </div>
      <div className="stat-card">
        <span className="stat-label">Vs. Recent History</span>
        <span className={`stat-value ${isPositive ? 'stat-value--positive' : 'stat-value--negative'}`}>
          {formatPercent(summary.vs_recent_history_pct_change)}
        </span>
      </div>
    </div>
  )
}

function ExplanationBody({ result }: { result: ForecastExplanation }) {
  return (
    <div className="explanation-content">
      <SummaryCards summary={result.forecast_summary} />

      <div className="explanation-section">
        <h3 className="section-heading">Analysis &amp; Context</h3>
        <div className="markdown-body">
          <ReactMarkdown>{result.explanation}</ReactMarkdown>
        </div>
      </div>

      {result.key_drivers.length > 0 && (
        <div className="explanation-section">
          <h3 className="section-heading">Key Drivers</h3>
          <ul className="bullet-list">
            {result.key_drivers.map((item, index) => (
              <li key={index} className="bullet-item">
                <span className="bullet-dot bullet-dot--driver" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.risks_or_opportunities.length > 0 && (
        <div className="explanation-section">
          <h3 className="section-heading">Risks &amp; Opportunities</h3>
          <ul className="bullet-list">
            {result.risks_or_opportunities.map((item, index) => (
              <li key={index} className="bullet-item">
                <span className="bullet-dot bullet-dot--risk" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="recommendation-card">
        <div className="recommendation-header">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <span className="recommendation-title">Strategic Recommendation</span>
        </div>
        <p className="recommendation-text">{result.recommendation}</p>
      </div>

      <div className="model-meta">
        <span>Model Version: <strong>{result.model_version}</strong></span>
      </div>
    </div>
  )
}

function describeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') {
      return 'The request timed out waiting for Databricks. Please try again.'
    }
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ')
    }
    if (typeof detail === 'object' && detail !== null) {
      return JSON.stringify(detail)
    }
    if (error.response) return `Server error (${error.response.status}).`
  }
  return 'Could not generate an explanation. Please try again.'
}

function ExplanationPanel({ productId, storeId }: ExplanationPanelProps) {
  const [generalResult, setGeneralResult] = useState<ForecastExplanation | null>(null)
  const [generalLoading, setGeneralLoading] = useState(false)
  const [generalError, setGeneralError] = useState<string | null>(null)

  async function handleExplain() {
    setGeneralLoading(true)
    setGeneralError(null)
    try {
      const result = await explainForecast(productId, storeId)
      setGeneralResult(result)
    } catch (error) {
      setGeneralError(describeError(error))
    } finally {
      setGeneralLoading(false)
    }
  }

  return (
    <div className="panel explanation-panel">
      <div className="panel-header-row">
        <div>
          <h2>Forecast Intelligence &amp; Driver Analysis</h2>
          <span className="panel-subtitle">AI-driven narrative derived from historical factors</span>
        </div>
        {!generalResult && !generalLoading && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleExplain}
            disabled={generalLoading}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            </svg>
            <span>Explain Forecast</span>
          </button>
        )}
      </div>

      {generalLoading && (
        <div className="panel-inner-loading">
          <span className="spinner" aria-label="Generating analysis" />
          <p>Analyzing trend vectors and key drivers in Databricks…</p>
        </div>
      )}

      {generalError && (
        <div className="banner error-banner" role="alert">
          <div className="banner-content">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{generalError}</span>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={handleExplain}>
            Retry
          </button>
        </div>
      )}

      {!generalResult && !generalLoading && !generalError && (
        <div className="explanation-empty-prompt">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            <path d="M8 10h.01" />
            <path d="M12 10h.01" />
            <path d="M16 10h.01" />
          </svg>
          <h3>Generate Series Narrative</h3>
          <p>Click below to evaluate seasonal variance, growth drivers, and strategic inventory recommendations for this selection.</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleExplain}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
            </svg>
            <span>Explain This Forecast</span>
          </button>
        </div>
      )}

      {generalResult && <ExplanationBody result={generalResult} />}
    </div>
  )
}

export default ExplanationPanel
