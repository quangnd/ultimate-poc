import { useCallback, useEffect, useState } from 'react'
import { DashboardView } from './Dashboard'
import { loadRelease, type LoadState, type ProblemItem } from './load'

const IMPORT_COMMAND =
  "curl -X POST -H 'content-type: application/json' \\\n  --data @fixtures/release.json http://127.0.0.1:5174/api/import"

export function App() {
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const reload = useCallback(() => {
    loadRelease().then(setState)
  }, [])
  useEffect(reload, [reload])

  return (
    <div className="page">
      <header className="masthead">
        <span className="brand">Release Readiness Lab</span>
        {state.kind === 'ready' && (
          <span className="masthead-meta">Synthetic data · computed in your browser from the stored release</span>
        )}
      </header>
      <main>
        {state.kind === 'loading' && <p className="muted" role="status">Loading release…</p>}
        {state.kind === 'ready' && <DashboardView dashboard={state.dashboard} />}
        {state.kind === 'empty' && (
          <Notice title="No release yet" tone="neutral">
            <p>There is no stored release to assess. Import one to see readiness and the forecast.</p>
            <p>From the project folder, with the API running (<code>npm run server</code>):</p>
            <pre>{IMPORT_COMMAND}</pre>
            <button type="button" onClick={reload}>Check again</button>
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
            <button type="button" onClick={reload}>Check again</button>
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
