import { useEffect, useRef, useState } from 'react'
import axios from 'axios'
import { getPipelineStatus, triggerPipeline, uploadAndTriggerPipeline } from '../api/pipeline'
import type { PipelineStatusResponse } from '../api/types'

interface FilePick {
  file: File
  error: string | null
}

const ALLOWED_PREFIXES = ['sales_transactions', 'calendar_marketing_external']
const POLL_INTERVAL_MS = 4000
const TERMINAL_STATES = ['TERMINATED', 'SKIPPED', 'INTERNAL_ERROR']

function describeError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.code === 'ECONNABORTED') return 'The request timed out. Please try again.'
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
  return 'Something went wrong. Please try again.'
}

function validateFilename(filename: string): string | null {
  if (!filename.toLowerCase().endsWith('.csv')) {
    return 'Only CSV files are accepted.'
  }
  if (!ALLOWED_PREFIXES.some((prefix) => filename.startsWith(prefix))) {
    return `Must start with: ${ALLOWED_PREFIXES.join(' or ')}.`
  }
  return null
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function statusLabel(status: PipelineStatusResponse): {
  text: string
  tone: 'pending' | 'running' | 'success' | 'failed'
} {
  const { life_cycle_state, result_state, state_message } = status

  if (life_cycle_state === 'TERMINATED') {
    if (result_state === 'SUCCESS') return { text: 'Completed Successfully', tone: 'success' }
    return { text: `Failed: ${state_message || result_state || 'Execution error'}`, tone: 'failed' }
  }
  if (life_cycle_state === 'INTERNAL_ERROR') {
    return { text: `Failed: ${state_message || 'Internal error'}`, tone: 'failed' }
  }
  if (life_cycle_state === 'SKIPPED') {
    return { text: 'Run Skipped', tone: 'failed' }
  }
  if (life_cycle_state === 'RUNNING' || life_cycle_state === 'TERMINATING') {
    return { text: 'Pipeline Executing…', tone: 'running' }
  }
  if (life_cycle_state === 'PENDING' || life_cycle_state === 'QUEUED') {
    return { text: 'Queued on Databricks…', tone: 'pending' }
  }
  if (life_cycle_state === 'WAITING_FOR_RETRY') {
    return { text: 'Retrying step…', tone: 'pending' }
  }
  return { text: life_cycle_state, tone: 'pending' }
}

function PipelineControl() {
  const [filePicks, setFilePicks] = useState<FilePick[]>([])
  const [runId, setRunId] = useState<number | null>(null)
  const [status, setStatus] = useState<PipelineStatusResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)
  const consecutiveErrorsRef = useRef(0)

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  function startPolling(newRunId: number) {
    stopPolling()
    consecutiveErrorsRef.current = 0
    setRunId(newRunId)
    setStatus(null)
    setBusy(true)

    const poll = async () => {
      try {
        const result = await getPipelineStatus(newRunId)
        if (!mountedRef.current) return
        consecutiveErrorsRef.current = 0
        setStatus(result)
        if (TERMINAL_STATES.includes(result.life_cycle_state)) {
          stopPolling()
          setBusy(false)
        }
      } catch (error) {
        if (!mountedRef.current) return
        consecutiveErrorsRef.current += 1
        // Allow up to 3 transient network glitches before killing poll
        if (consecutiveErrorsRef.current >= 3) {
          stopPolling()
          setBusy(false)
          setActionError(describeError(error))
        }
      }
    }

    void poll()
    pollRef.current = setInterval(poll, POLL_INTERVAL_MS)
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      stopPolling()
    }
  }, [])

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? [])
    setFilePicks(selected.map((file) => ({ file, error: validateFilename(file.name) })))
  }

  function handleRemoveFile(index: number) {
    setFilePicks((prev) => {
      const updated = prev.filter((_, i) => i !== index)
      if (updated.length === 0 && fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      return updated
    })
  }

  function clearFiles() {
    setFilePicks([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const hasInvalidFile = filePicks.some((pick) => pick.error !== null)

  async function handleUploadAndTrigger() {
    if (filePicks.length === 0 || hasInvalidFile) return

    setActionError(null)
    setBusy(true)
    try {
      const filesToUpload = filePicks.map((pick) => pick.file)
      const result = await uploadAndTriggerPipeline(filesToUpload)
      clearFiles()
      startPolling(result.run_id)
    } catch (error) {
      setBusy(false)
      setActionError(describeError(error))
    }
  }

  async function handleTriggerOnly() {
    setActionError(null)
    setBusy(true)
    try {
      const result = await triggerPipeline()
      startPolling(result.run_id)
    } catch (error) {
      setBusy(false)
      setActionError(describeError(error))
    }
  }

  const label = status ? statusLabel(status) : null

  return (
    <div className="panel pipeline-panel">
      <div className="pipeline-header">
        <div className="pipeline-title-group">
          <div className="pipeline-title-icon" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
          </div>
          <div>
            <h2>Data Pipeline &amp; Model Retraining</h2>
            <p className="pipeline-subtitle">
              Orchestrates Databricks Bronze &rarr; Silver &rarr; Gold medallion pipeline and refreshes 30-day forecast models.
            </p>
          </div>
        </div>
      </div>

      <div className="pipeline-actions-grid">
        <div className="pipeline-card">
          <div className="pipeline-card-header">
            <span className="pipeline-card-title">Upload New CSVs &amp; Retrain</span>
            <span className="pipeline-tag">Ingest &amp; Train</span>
          </div>
          <p className="pipeline-card-desc">
            Upload CSV files named <code>sales_transactions*.csv</code> or <code>calendar_marketing_external*.csv</code> to stage data into Unity Catalog Volumes and trigger retraining.
          </p>

          <div className="file-upload-zone">
            <label className="file-input-label">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                multiple
                onChange={handleFileChange}
                disabled={busy}
                className="sr-only"
              />
              <span className="file-upload-button">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span>Select CSV files…</span>
              </span>
            </label>

            {filePicks.length > 0 && (
              <div className="file-list-wrap">
                <div className="file-list-header">
                  <span>Selected ({filePicks.length})</span>
                  <button type="button" className="btn-link" onClick={clearFiles} disabled={busy}>
                    Clear all
                  </button>
                </div>
                <ul className="file-chip-list">
                  {filePicks.map((pick, index) => (
                    <li key={index} className={`file-chip ${pick.error ? 'file-chip--error' : ''}`}>
                      <span className="file-chip-name" title={pick.file.name}>
                        {pick.file.name}
                      </span>
                      <span className="file-chip-size">{formatBytes(pick.file.size)}</span>
                      {pick.error && <span className="file-chip-err-msg">{pick.error}</span>}
                      <button
                        type="button"
                        className="file-chip-remove"
                        onClick={() => handleRemoveFile(index)}
                        disabled={busy}
                        title="Remove file"
                        aria-label="Remove file"
                      >
                        &times;
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void handleUploadAndTrigger()}
            disabled={busy || filePicks.length === 0 || hasInvalidFile}
          >
            {busy ? 'Processing Pipeline…' : 'Upload & Start Pipeline'}
          </button>
        </div>

        <div className="pipeline-card">
          <div className="pipeline-card-header">
            <span className="pipeline-card-title">Retrain with Existing Data</span>
            <span className="pipeline-tag">Delta Tables</span>
          </div>
          <p className="pipeline-card-desc">
            Re-runs feature engineering and ML training directly against current Gold tables on Databricks without uploading additional files.
          </p>

          <div className="pipeline-card-spacer" />

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => void handleTriggerOnly()}
            disabled={busy}
          >
            {busy ? 'Processing Pipeline…' : 'Trigger Retraining Only'}
          </button>
        </div>
      </div>

      {actionError && (
        <div className="banner error-banner" role="alert">
          <div className="banner-content">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{actionError}</span>
          </div>
        </div>
      )}

      {runId && (
        <div className="pipeline-status-bar">
          <div className="pipeline-run-meta">
            <span className="status-label">Databricks Job Run:</span>
            <span className="status-run-id">#{runId}</span>
          </div>
          {label ? (
            <span className={`status-badge status-badge--${label.tone}`}>
              {label.tone === 'running' || label.tone === 'pending' ? <span className="spinner" /> : null}
              {label.tone === 'success' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : null}
              {label.tone === 'failed' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              ) : null}
              {label.text}
            </span>
          ) : (
            <span className="status-badge status-badge--pending">
              <span className="spinner" /> Querying run state…
            </span>
          )}
        </div>
      )}
    </div>
  )
}

export default PipelineControl
