import { useCallback, useEffect, useState } from 'react'
import { DashboardView } from './Dashboard'
import { changesOf, draftFrom, type Draft } from './draft'
import { Editor } from './Editor'
import { loadRelease, type LoadState, type ProblemItem } from './load'

type View = 'dashboard' | 'edit'
const viewFromHash = (): View => (window.location.hash === '#edit' ? 'edit' : 'dashboard')

const IMPORT_COMMAND =
  "curl -X POST -H 'content-type: application/json' \\\n  --data @fixtures/release.json http://127.0.0.1:5174/api/import"

export function App() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [view, setView] = useState<View>(viewFromHash)
  /** The editor's draft lives here, so switching to the dashboard and back never loses what was typed. */
  const [draft, setDraft] = useState<Draft | undefined>()

  const reload = useCallback(async () => {
    const next = await loadRelease()
    setState(next)
    // A fresh load (first, or after a save) starts the draft from what is stored.
    setDraft(next.kind === 'ready' ? draftFrom(next.dashboard.doc) : undefined)
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    const onHash = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const dirty = state.kind === 'ready' && draft !== undefined && changesOf(state.dashboard.doc, draft).any
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  return (
    <div className={view === 'edit' && state.kind === 'ready' ? 'page page-wide' : 'page'}>
      <header className="masthead">
        <span className="brand">Release Readiness Lab</span>
        {state.kind === 'ready' && (
          <nav className="views" aria-label="Views">
            <a href="#" aria-current={view === 'dashboard' ? 'page' : undefined}>Dashboard</a>
            <a href="#edit" aria-current={view === 'edit' ? 'page' : undefined}>
              Edit plan{dirty && <span className="dot" aria-label="(unsaved changes)" />}
            </a>
          </nav>
        )}
        {state.kind === 'ready' && (
          <span className="masthead-meta">Synthetic data · computed in your browser from the stored release</span>
        )}
      </header>
      <main>
        {state.kind === 'loading' && <p className="muted" role="status">Loading release…</p>}
        {state.kind === 'ready' && view === 'dashboard' && (
          <>
            {dirty && (
              <p className="draft-note">
                You have unsaved edits. This dashboard shows the stored plan. <a href="#edit">Back to the editor</a>
              </p>
            )}
            <DashboardView dashboard={state.dashboard} />
          </>
        )}
        {state.kind === 'ready' && view === 'edit' && draft && (
          <Editor
            base={state.dashboard.doc}
            baseForecast={state.dashboard.forecast}
            baseReady={state.dashboard.readiness.ready}
            draft={draft}
            setDraft={setDraft}
            onSaved={reload}
          />
        )}
        {state.kind === 'empty' && (
          <Notice title="No release yet" tone="neutral">
            <p>There is no stored release to assess. Import one to see readiness and the forecast.</p>
            <p>From the project folder, with the API running (<code>npm run server</code>):</p>
            <pre>{IMPORT_COMMAND}</pre>
            <button type="button" onClick={() => void reload()}>Check again</button>
          </Notice>
        )}
        {state.kind === 'invalid' && <InvalidNotice source={state.source} errors={state.errors} onRetry={reload} />}
        {state.kind === 'unreachable' && (
          <Notice title="Can't reach the release API" tone="bad">
            <p>
              The dashboard reads the release from the local API on <code>127.0.0.1:5174</code>. Start it with{' '}
              <code>npm run server</code>, then check again.
            </p>
            <p className="muted">Detail: {state.detail}</p>
            <button type="button" onClick={() => void reload()}>Check again</button>
          </Notice>
        )}
      </main>
    </div>
  )
}

function InvalidNotice({ source, errors, onRetry }: { source: 'server' | 'client'; errors: ProblemItem[]; onRetry: () => void }) {
  return (
    <Notice title="The stored release can't be used" tone="bad">
      <p>
        {source === 'server' ? 'The stored file failed validation' : 'The release failed validation in the browser'}, so no
        readiness or forecast is shown. Nothing was changed or repaired. Fix <code>data/release.json</code> or import a valid
        release.
      </p>
      <h2 className="notice-subhead">
        {errors.length} {errors.length === 1 ? 'problem' : 'problems'}
      </h2>
      <ul className="problems">
        {errors.map((e, i) => (
          <li key={i}>
            <span className="problem-message">{e.message}</span>
            <span className="problem-meta">
              <code>{e.code}</code>
              {e.taskId !== undefined && <span className="id">{e.taskId}</span>}
            </span>
          </li>
        ))}
      </ul>
      <button type="button" onClick={onRetry}>Check again</button>
    </Notice>
  )
}

function Notice({ title, tone, children }: { title: string; tone: 'neutral' | 'bad'; children: React.ReactNode }) {
  return (
    <section className={`notice notice-${tone}`} aria-labelledby="notice-title">
      <h1 id="notice-title">{title}</h1>
      {children}
    </section>
  )
}
