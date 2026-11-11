import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import ReactMarkdown from 'react-markdown'
import { sendChatMessage, sendQuickAction } from '../api/chat'
import type { ChatTurnHistory } from '../api/types'

interface ChatPanelProps {
  categories: string[]
  selectedStoreId: string
  selectedStoreName: string
}

interface Turn {
  id: string
  role: 'user' | 'assistant'
  content: string
  error?: string
  pending?: boolean
}

interface QuickAction {
  id: string
  label: string
  question: string
  run: () => Promise<{ answer: string }>
}

let turnCounter = 0
function generateTurnId(prefix: string): string {
  turnCounter += 1
  return `${prefix}-${Date.now()}-${turnCounter}`
}

function describeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') return 'The request timed out waiting for Databricks. Please try again.'
    const detail = error.response?.data?.detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ')
    }
    if (typeof detail === 'object' && detail !== null) {
      return JSON.stringify(detail)
    }
    if (error.response) return `Request failed (${error.response.status}).`
  }
  return 'Something went wrong while querying Databricks. Please try again.'
}

function ChatPanel({ categories, selectedStoreId, selectedStoreName }: ChatPanelProps) {
  const [turns, setTurns] = useState<Turn[]>([])
  const [busy, setBusy] = useState(false)
  const [input, setInput] = useState('')
  const [categoryA, setCategoryA] = useState('')
  const [categoryB, setCategoryB] = useState('')

  const bottomRef = useRef<HTMLDivElement | null>(null)
  const initializedCategories = useRef(false)

  // Initialize comparison categories safely without causing cascading renders
  useEffect(() => {
    if (!initializedCategories.current && categories.length >= 2) {
      setCategoryA(categories[0])
      setCategoryB(categories[1])
      initializedCategories.current = true
    }
  }, [categories])

  // Only scroll into view when turns are added (not on initial mount when empty)
  useEffect(() => {
    if (turns.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [turns])

  async function runTurn(question: string, task: () => Promise<{ answer: string }>) {
    if (busy) return
    setBusy(true)

    const userId = generateTurnId('user')
    const assistantId = generateTurnId('assistant')

    setTurns((prev) => [
      ...prev,
      { id: userId, role: 'user', content: question },
      { id: assistantId, role: 'assistant', content: '', pending: true },
    ])

    try {
      const result = await task()
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === assistantId ? { ...turn, content: result.answer, pending: false } : turn,
        ),
      )
    } catch (error) {
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === assistantId ? { ...turn, pending: false, error: describeError(error) } : turn,
        ),
      )
    } finally {
      setBusy(false)
    }
  }

  const storeScopeLabel = selectedStoreId ? ` at ${selectedStoreName || selectedStoreId}` : ' across all stores'

  const quickActions: QuickAction[] = [
    {
      id: 'top_category',
      label: 'Top Selling Category',
      question: `What is the top selling category${storeScopeLabel}?`,
      run: () => sendQuickAction('top_category', { store_id: selectedStoreId || undefined }),
    },
    {
      id: 'top_product',
      label: 'Top Selling Product',
      question: `What is the top selling product${storeScopeLabel}?`,
      run: () => sendQuickAction('top_product', { store_id: selectedStoreId || undefined }),
    },
    {
      id: 'underperforming_stores',
      label: 'Underperforming Stores',
      question: 'Which stores are underperforming?',
      run: () => sendQuickAction('underperforming_stores'),
    },
    {
      id: 'trending_down_products',
      label: 'Products Trending Down',
      question: 'Which products are trending down?',
      run: () => sendQuickAction('trending_down_products'),
    },
    {
      id: 'predicted_revenue',
      label: 'Total Predicted Revenue',
      question: 'What is the total predicted revenue?',
      run: () => sendQuickAction('predicted_revenue'),
    },
  ]

  function handleCompareCategories() {
    if (!categoryA || !categoryB) return
    void runTurn(`Compare ${categoryA} vs ${categoryB}`, () =>
      sendQuickAction('compare_categories', { category_a: categoryA, category_b: categoryB }),
    )
  }

  function handleStorePerformance() {
    if (!selectedStoreId) return
    void runTurn(`How is ${selectedStoreName || selectedStoreId} performing vs. its history?`, () =>
      sendQuickAction('store_performance', { store_id: selectedStoreId }),
    )
  }

  function handleSend() {
    const message = input.trim()
    if (!message || busy) return
    setInput('')

    const history: ChatTurnHistory[] = turns
      .filter((turn) => !turn.pending && !turn.error)
      .map((turn) => ({ role: turn.role, content: turn.content }))

    void runTurn(message, () => sendChatMessage(message, history, selectedStoreId, selectedStoreName))
  }

  return (
    <div className="panel chat-panel">
      <div className="chat-panel-header">
        <div>
          <h2>Analytics Assistant</h2>
          <div className="chat-scope-badge">
            <span className="scope-dot" />
            <span>Scope: <strong>{selectedStoreId ? selectedStoreName || selectedStoreId : 'All Stores (Global)'}</strong></span>
          </div>
        </div>
      </div>

      <div className="quick-actions-section">
        <span className="section-micro-label">Quick Insights:</span>
        <div className="quick-actions">
          {quickActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="chip-btn"
              disabled={busy}
              onClick={() => void runTurn(action.question, action.run)}
            >
              {action.label}
            </button>
          ))}

          {selectedStoreId && (
            <button type="button" className="chip-btn chip-btn--accent" disabled={busy} onClick={handleStorePerformance}>
              Current Store vs. History
            </button>
          )}
        </div>
      </div>

      {categories.length >= 2 && (
        <div className="compare-bar">
          <span className="section-micro-label">Compare Categories:</span>
          <div className="compare-controls">
            <select
              value={categoryA}
              onChange={(event) => setCategoryA(event.target.value)}
              disabled={busy}
              className="select-input select-input--sm"
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <span className="compare-vs">vs.</span>
            <select
              value={categoryB}
              onChange={(event) => setCategoryB(event.target.value)}
              disabled={busy}
              className="select-input select-input--sm"
            >
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={busy || !categoryA || !categoryB}
              onClick={handleCompareCategories}
            >
              Compare
            </button>
          </div>
        </div>
      )}

      <div className="chat-thread" aria-label="Conversation thread">
        {turns.length === 0 ? (
          <div className="chat-empty-hint">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <p className="empty-hint-title">Ask business &amp; forecast questions in plain English</p>
            <p className="empty-hint-desc">
              Type any question or click a quick action above. The assistant queries live Databricks aggregates and models.
            </p>
          </div>
        ) : (
          turns.map((turn) => (
            <div key={turn.id} className={`chat-message chat-message--${turn.role}`}>
              <div className="chat-message-bubble">
                {turn.role === 'assistant' && (
                  <div className="assistant-badge">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                    <span>Forecastify AI</span>
                  </div>
                )}
                {turn.pending ? (
                  <div className="thinking-indicator">
                    <span className="spinner" aria-label="Thinking" />
                    <span>Analyzing Databricks data…</span>
                  </div>
                ) : turn.error ? (
                  <div className="chat-error-text">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{turn.error}</span>
                  </div>
                ) : (
                  <div className="markdown-body">
                    <ReactMarkdown>{turn.content}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="chat-input-bar"
        onSubmit={(event) => {
          event.preventDefault()
          handleSend()
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask a question about inventory, trends, top products, or stores…"
          disabled={busy}
          className="chat-input"
        />
        <button
          type="submit"
          className="btn btn-primary"
          disabled={busy || !input.trim()}
        >
          {busy ? (
            <span>Thinking…</span>
          ) : (
            <>
              <span>Send</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </>
          )}
        </button>
      </form>
    </div>
  )
}

export default ChatPanel
