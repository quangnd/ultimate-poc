import { useCallback, useEffect, useRef, useState } from 'react'
import sampleText from '../../fixtures/release.json?raw'
import { DashboardView } from './Dashboard'
import { changesOf, draftFrom, type Draft } from './draft'
import { Editor } from './Editor'
import { loadRelease, type LoadState, type ProblemItem } from './load'
import { checkImport, importRelease, MAX_IMPORT_BYTES, summarize } from './transfer'
import { ImportPanel, type ImportState } from './ImportPanel'

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

  const changes = state.kind === 'ready' && draft !== undefined ? changesOf(state.dashboard.doc, draft) : undefined
  const dirty = changes?.any ?? false
  // Reordering alone is a change too (see changesOf), so a dirty draft always counts at least one.
  const unsavedChanges = changes ? Math.max(changes.edited.size + changes.added.size + changes.deleted.length, dirty ? 1 : 0) : 0

  // Import: choose a file, check it here, show what it holds, and only store it once the operator confirms.
  const [importing, setImporting] = useState<ImportState>({ kind: 'idle' })
  const fileInput = useRef<HTMLInputElement>(null)
  const chooseFile = () => fileInput.current?.click()
  const onFile = async (file: File | undefined) => {
    if (!fileInput.current || !file) return
    fileInput.current.value = '' // choosing the same file again must fire change again
    // The size is checked before reading, so a huge file is never loaded into memory.
    const check = file.size > MAX_IMPORT_BYTES ? checkImport('', file.size) : checkImport(await file.text(), file.size)
    setImporting({ kind: 'checked', name: file.name, check })
  }
  const store = async (name: string, text: string) => {
    const check = checkImport(text)
    if (check.kind !== 'ready') return setImporting({ kind: 'checked', name, check })
    setImporting({ kind: 'importing', name, check })
    const outcome = await importRelease(check.text)
    if (outcome.kind !== 'imported') return setImporting({ kind: 'refused', name, outcome })
    await reload() // replaces the draft too: the operator confirmed discarding it
    setImporting({ kind: 'imported', name, summary: check.summary })
  }
  const confirmImport = () => {
    if (importing.kind === 'checked' && importing.check.kind === 'ready') void store(importing.name, importing.check.text)
  }
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
        {(state.kind === 'ready' || state.kind === 'invalid') && (
          <span className="masthead-actions">
            <button type="button" className="quiet" onClick={chooseFile}>Import…</button>
            {state.kind === 'ready' && (
              <a
                className="button quiet"
                href="/api/export"
                download="release.json"
                title={dirty ? 'Downloads the stored release; your unsaved edits are not included' : 'Downloads the stored release as release.json'}
              >
                Export
              </a>
            )}
          </span>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
      </header>
      <main>
        {importing.kind !== 'idle' && (
          <ImportPanel
            state={importing}
            stored={state.kind === 'ready' ? summarize(state.dashboard.doc) : state.kind === 'invalid' ? 'unusable' : undefined}
            unsavedChanges={unsavedChanges}
            onConfirm={confirmImport}
            onChooseAnother={chooseFile}
            onClose={() => setImporting({ kind: 'idle' })}
          />
        )}
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
        {/* Always mounted while a release is loaded, only hidden on the dashboard: the editor's save state (a save in
            flight locks the draft) must survive switching views (reviewer #5222). */}
        {state.kind === 'ready' && draft && (
          <div hidden={view !== 'edit'}>
          <Editor
            base={state.dashboard.doc}
            baseForecast={state.dashboard.forecast}
            baseReady={state.dashboard.readiness.ready}
            draft={draft}
            setDraft={setDraft}
            onSaved={reload}
            visible={view === 'edit'}
          />
          </div>
        )}
        {state.kind === 'empty' && (
          <Notice title="No release yet" tone="neutral">
            <p>There is no stored release to assess. Start from the bundled sample, or import a release file, to see readiness and the forecast.</p>
            <div className="import-actions">
              <button
                type="button"
                className="primary"
                disabled={importing.kind === 'importing'}
                onClick={() => void store('the sample release', sampleText)}
              >
                {importing.kind === 'importing' ? 'Loading…' : 'Load the sample release'}
              </button>
              <button type="button" onClick={chooseFile}>Import a file…</button>
            </div>
            <p className="muted">
              The sample is <code>fixtures/release.json</code>: Aurora Kiosk 2.0, 24 synthetic tasks in 5 streams. You can also
              import from the project folder:
            </p>
            <pre>{IMPORT_COMMAND}</pre>
            <button type="button" className="link" onClick={() => void reload()}>Check again</button>
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
