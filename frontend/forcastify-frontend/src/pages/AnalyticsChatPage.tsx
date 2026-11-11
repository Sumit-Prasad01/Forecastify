import { useEffect, useMemo, useState } from 'react'
import { getProducts, getStores } from '../api/forecast'
import type { Product, Store } from '../api/types'
import ChatPanel from '../components/ChatPanel'
import TrendBackdrop from '../components/TrendBackdrop'

function AnalyticsChatPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedStoreId, setSelectedStoreId] = useState('')
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    let cancelled = false

    Promise.all([getProducts(), getStores()])
      .then(([productList, storeList]) => {
        if (!cancelled) {
          setProducts(productList)
          setStores(storeList)
          setLoadError(null)
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError('Unable to connect to Databricks backend services.')
      })

    return () => {
      cancelled = true
    }
  }, [retryKey])

  const categories = useMemo(() => [...new Set(products.map((product) => product.category))], [products])
  const selectedStoreName = stores.find((store) => store.store_id === selectedStoreId)?.store_name ?? ''

  return (
    <div className="dashboard-container">
      <header className="page-header">
        <div className="header-meta">
          <div className="header-badge">
            <span className="live-dot" />
            <span>Databricks Lakehouse Connected</span>
          </div>
          <h1>Analytics Chat</h1>
          <p className="page-subtitle">
            Query demand patterns, store performance, and sales risks in natural language backed by real SQL queries.
          </p>
        </div>
        <TrendBackdrop />
      </header>

      {loadError && (
        <div className="banner error-banner" role="alert">
          <div className="banner-content">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setRetryKey((k) => k + 1)}
          >
            Retry Connection
          </button>
        </div>
      )}

      {stores.length > 0 && (
        <div className="panel selector-panel">
          <div className="selector-header">
            <div className="selector-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span>Store Scope (Optional)</span>
            </div>
            <span className="selector-counter">Scope answers to a specific store location or leave global</span>
          </div>

          <div className="selector-grid selector-grid--single">
            <label className="selector-field">
              <span className="field-label">Target Store</span>
              <div className="select-wrap">
                <select
                  value={selectedStoreId}
                  onChange={(event) => setSelectedStoreId(event.target.value)}
                  className="select-input"
                >
                  <option value="">All Stores (Global Fleet)</option>
                  {stores.map((store) => (
                    <option key={store.store_id} value={store.store_id}>
                      {store.store_name} ({store.city}, {store.region})
                    </option>
                  ))}
                </select>
                <div className="select-chevron" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </div>
            </label>
          </div>
        </div>
      )}

      <ChatPanel
        categories={categories}
        selectedStoreId={selectedStoreId}
        selectedStoreName={selectedStoreName}
      />
    </div>
  )
}

export default AnalyticsChatPage
