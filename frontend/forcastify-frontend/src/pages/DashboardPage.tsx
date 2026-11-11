import { useEffect, useState } from 'react'
import { getProducts, getStores } from '../api/forecast'
import type { Product, Store } from '../api/types'
import ProductStoreSelector from '../components/ProductStoreSelector'
import ForecastChart from '../components/ForecastChart'
import ExplanationPanel from '../components/ExplanationPanel'
import KPIBar from '../components/KPIBar'
import PipelineControl from '../components/PipelineControl'
import TrendBackdrop from '../components/TrendBackdrop'

function DashboardPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  const [selectedProductId, setSelectedProductId] = useState('')
  const [selectedStoreId, setSelectedStoreId] = useState('')

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

  return (
    <div className="dashboard-container">
      <header className="page-header">
        <div className="header-meta">
          <div className="header-badge">
            <span className="live-dot" />
            <span>Databricks Lakehouse Connected</span>
          </div>
          <h1>Sales Forecast Dashboard</h1>
          <p className="page-subtitle">
            Historical sales tracking, 30-day demand predictions, and driver explanations across products and stores.
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

      <KPIBar />

      <PipelineControl />

      <ProductStoreSelector
        products={products}
        stores={stores}
        selectedProductId={selectedProductId}
        selectedStoreId={selectedStoreId}
        onSelectProduct={setSelectedProductId}
        onSelectStore={setSelectedStoreId}
      />

      <div className="dashboard-grid">
        <ForecastChart productId={selectedProductId} storeId={selectedStoreId} />

        {selectedProductId && selectedStoreId ? (
          <ExplanationPanel
            key={`${selectedProductId}-${selectedStoreId}`}
            productId={selectedProductId}
            storeId={selectedStoreId}
          />
        ) : (
          <div className="panel explanation-panel empty-state">
            <div className="empty-state-content">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <line x1="10" y1="9" x2="8" y2="9" />
              </svg>
              <h3>Explanation Narrative</h3>
              <p>Select both a product and store series above to inspect ML driver factors and recommendations.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default DashboardPage
