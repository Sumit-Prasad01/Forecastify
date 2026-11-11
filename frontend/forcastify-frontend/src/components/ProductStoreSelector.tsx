import type { Product, Store } from '../api/types'

interface ProductStoreSelectorProps {
  products: Product[]
  stores: Store[]
  selectedProductId: string
  selectedStoreId: string
  onSelectProduct: (productId: string) => void
  onSelectStore: (storeId: string) => void
}

function ProductStoreSelector({
  products,
  stores,
  selectedProductId,
  selectedStoreId,
  onSelectProduct,
  onSelectStore,
}: ProductStoreSelectorProps) {
  return (
    <section className="panel selector-panel" aria-label="Forecast Series Filters">
      <div className="selector-header">
        <div className="selector-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <span>Select Forecast Series</span>
        </div>
        <span className="selector-counter">
          {products.length} Products &bull; {stores.length} Stores Available
        </span>
      </div>

      <div className="selector-grid">
        <label className="selector-field">
          <span className="field-label">Product</span>
          <div className="select-wrap">
            <select
              value={selectedProductId}
              onChange={(event) => onSelectProduct(event.target.value)}
              className="select-input"
            >
              <option value="">Choose a product…</option>
              {products.map((product) => (
                <option key={product.product_id} value={product.product_id}>
                  {product.product_name} — {product.category}
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

        <label className="selector-field">
          <span className="field-label">Store Location</span>
          <div className="select-wrap">
            <select
              value={selectedStoreId}
              onChange={(event) => onSelectStore(event.target.value)}
              className="select-input"
            >
              <option value="">Choose a store…</option>
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
    </section>
  )
}

export default ProductStoreSelector
