/** The import review: what a chosen file contains, or why it can't be imported, before anything is stored (US-07). */
import { useEffect, useRef } from 'react'
import { ProblemText } from './Editor'
import { formatBytes, MAX_IMPORT_BYTES, type ImportCheck, type ImportOutcome, type ReleaseSummary } from './transfer'
import { formatDate, STATUS_LABEL } from './view'
import { STATUSES } from '../domain/types'

/** One import from choosing a file to its end; `idle` shows nothing. */
export type ImportState =
  | { kind: 'idle' }
  | { kind: 'checked'; name: string; check: ImportCheck }
  | { kind: 'importing'; name: string; check: Extract<ImportCheck, { kind: 'ready' }> }
  | { kind: 'refused'; name: string; outcome: Exclude<ImportOutcome, { kind: 'imported' }> }
  | { kind: 'imported'; name: string; summary: ReleaseSummary }

interface Props {
  state: Exclude<ImportState, { kind: 'idle' }>
  /** What is stored now: a summary, `unusable` when the stored file fails validation, undefined when nothing is stored. */
  stored?: ReleaseSummary | 'unusable'
  /** Unsaved changes in the editor that an import would discard. */
  unsavedChanges: number
  onConfirm: () => void
  onChooseAnother: () => void
  onClose: () => void
  /** After an import with an unknown outcome: reload what is stored (this replaces any unsaved draft). */
  onReload: () => void
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function ImportPanel({ state, stored, unsavedChanges, onConfirm, onChooseAnother, onClose, onReload }: Props) {
  const ref = useRef<HTMLElement>(null)
  // Each new step takes focus, so a keyboard or screen-reader user lands on the question or the refusal.
  useEffect(() => ref.current?.focus(), [state.kind, state.name])

  if (state.kind === 'imported') {
    return (
      <section className="notice banner banner-fixed import-done" ref={ref} tabIndex={-1} role="status">
        <p>
          <strong>Imported {state.name}.</strong> The dashboard now shows its {plural(state.summary.tasks, 'task')} across{' '}
          {plural(state.summary.streams.length, 'stream')}.
        </p>
        <button type="button" className="link" onClick={onClose}>Dismiss</button>
      </section>
    )
  }

  if (state.kind === 'checked' && state.check.kind !== 'ready') return <Refusal {...{ ref, name: state.name, onChooseAnother, onClose, onReload }} reason={state.check} where="browser" />
  if (state.kind === 'refused') return <Refusal {...{ ref, name: state.name, onChooseAnother, onClose, onReload }} reason={state.outcome} where="server" />

  const { summary } = state.check as Extract<ImportCheck, { kind: 'ready' }>
  const busy = state.kind === 'importing'
  return (
    <section className="notice banner import-review" ref={ref} tabIndex={-1} aria-labelledby="import-title" aria-busy={busy}>
      <div className="import-head">
        <p className="eyebrow">Import</p>
        <h1 id="import-title">
          {stored ? 'Replace the stored release with' : 'Import the release from'} <span className="file-name">{state.name}</span>?
        </h1>
      </div>
      <SummaryFacts summary={summary} />
      {stored === 'unusable' ? (
        <p>This replaces the stored file, which fails validation and can't be used.</p>
      ) : stored ? (
        <p>
          This replaces everything stored now ({plural(stored.tasks, 'task')}, {plural(stored.streams.length, 'stream')}) and
          can't be undone. <a href="/api/export" download="release.json">Export the stored release</a> first to keep a copy.
        </p>
      ) : (
        <p className="muted">Nothing is stored yet, so nothing is replaced.</p>
      )}
      {unsavedChanges > 0 && (
        <p className="import-warn" role="note">
          <strong>Your unsaved edits will be discarded.</strong> The editor has {plural(unsavedChanges, 'unsaved change')};
          importing replaces {unsavedChanges === 1 ? 'it' : 'them'} with this file. <a href="#edit">Back to the editor</a> to save them first.
        </p>
      )}
      <div className="import-actions">
        <button type="button" className="primary" onClick={onConfirm} disabled={busy}>
          {busy ? 'Importing…' : unsavedChanges > 0 ? 'Discard edits and replace' : stored ? 'Replace stored release' : 'Import release'}
        </button>
        <button type="button" onClick={onClose} disabled={busy}>Cancel</button>
      </div>
    </section>
  )
}

function SummaryFacts({ summary }: { summary: ReleaseSummary }) {
  const statusLine = STATUSES.filter((s) => summary.byStatus[s] > 0)
    .map((s) => `${summary.byStatus[s]} ${STATUS_LABEL[s].toLowerCase()}`)
    .join(' · ')
  return (
    <dl className="import-facts">
      <div>
        <dt>Tasks</dt>
        <dd>{summary.tasks}</dd>
        <dd className="import-fact-sub">{statusLine || 'No tasks'}</dd>
      </div>
      <div>
        <dt>Streams</dt>
        <dd>{summary.streams.length}</dd>
        <dd className="import-fact-sub">{summary.streams.join(', ') || 'None'}</dd>
      </div>
      <div>
        <dt>Start</dt>
        <dd>{formatDate(summary.startDate)}</dd>
      </div>
      <div>
        <dt>Target</dt>
        <dd>{summary.targetDate ? formatDate(summary.targetDate) : <span className="muted">None set</span>}</dd>
      </div>
    </dl>
  )
}

type Reason = Exclude<ImportCheck, { kind: 'ready' }> | Exclude<ImportOutcome, { kind: 'imported' }>

function Refusal({
  ref,
  name,
  reason,
  where,
  onChooseAnother,
  onClose,
  onReload,
}: {
  ref: React.RefObject<HTMLElement | null>
  name: string
  reason: Reason
  where: 'browser' | 'server'
  onChooseAnother: () => void
  onClose: () => void
  onReload: () => void
}) {
  const unchanged = 'Nothing was imported; the stored release is unchanged.'
  let lead: React.ReactNode
  if (reason.kind === 'not-json') lead = <>This file isn't JSON, so it can't be a release. {unchanged}</>
  else if (reason.kind === 'too-large') {
    lead = (
      <>
        {'bytes' in reason ? `This file is ${formatBytes(reason.bytes)}, over` : 'The server refused this file as over'} the{' '}
        {MAX_IMPORT_BYTES / (1024 * 1024)} MB import limit. {unchanged}
      </>
    )
  } else if (reason.kind === 'failed') {
    // The request may have reached the server and been stored before the answer was lost (reviewer #5740).
    lead = (
      <>
        No answer came back from the release API, so it is <strong>unknown whether the file was imported</strong>. Reload
        the stored release to see which one is stored now. If the API is not running, start it with{' '}
        <code>npm run server</code>.
      </>
    )
  } else {
    lead = (
      <>
        {where === 'server' ? 'The server refused it' : 'It failed validation'}: {plural(reason.errors.length, 'problem')}.{' '}
        {unchanged}
      </>
    )
  }
  return (
    <section className="notice notice-bad banner" ref={ref} tabIndex={-1} role="alert" aria-labelledby="import-title">
      <h1 id="import-title">
        Can't import <span className="file-name">{name}</span>
      </h1>
      <p>{lead}</p>
      {(reason.kind === 'not-json' || reason.kind === 'failed') && <p className="muted">Detail: {reason.detail}</p>}
      {reason.kind === 'invalid' || reason.kind === 'refused' ? (
        <ul className="problems banner-problems">
          {reason.errors.map((e, i) => (
            <li key={i}>
              <span className="problem-where">
                {e.taskId === undefined ? <span className="muted">Release</span> : <span className="id">{e.taskId}</span>}
              </span>
              <span className="problem-body">
                <ProblemText error={e} />
                <code className="problem-code">{e.code}</code>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="import-actions">
        {reason.kind === 'failed' && (
          <button type="button" className="primary" onClick={onReload}>Reload stored release</button>
        )}
        <button type="button" onClick={onChooseAnother}>Choose another file</button>
        <button type="button" className="link" onClick={onClose}>Dismiss</button>
      </div>
    </section>
  )
}
