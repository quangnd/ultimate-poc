import { useEffect, useMemo, useRef, useState } from 'react'
import type { Forecast } from '../domain/schedule'
import { GATES, STATUSES, type ReleaseDocument } from '../domain/types'
import type { ValidationError } from '../domain/validate'
import {
  addTask,
  changesOf,
  check,
  cycleLinks,
  deleteTask,
  dependentsOf,
  draftFrom,
  placeErrors,
  restoreTask,
  toDocument,
  type Draft,
  type DraftTask,
  type Field,
  type PlacedError,
} from './draft'
import { saveRelease, type ProblemItem } from './load'
import { formatDate, slipText, slipTone, STATUS_LABEL } from './view'

/** What the last save attempt said; `browser` errors are re-checked live as the operator fixes them. */
type Attempt =
  | { kind: 'none' }
  | { kind: 'saving' }
  | { kind: 'refused-browser' }
  | { kind: 'refused-server'; errors: ProblemItem[] }
  | { kind: 'failed'; detail: string }
  | { kind: 'saved' }

interface Props {
  base: ReleaseDocument
  baseForecast: Forecast
  baseReady: boolean
  draft: Draft
  setDraft: (draft: Draft) => void
  /** Reloads the stored release after a save; resolves once the dashboard shows it. */
  onSaved: () => Promise<void>
}

export function Editor({ base, baseForecast, baseReady, draft, setDraft, onSaved }: Props) {
  const [attempt, setAttempt] = useState<Attempt>({ kind: 'none' })
  const [newStream, setNewStream] = useState(base.workstreams[0] ?? '')
  const [focusKey, setFocusKey] = useState<number | undefined>()
  const bannerRef = useRef<HTMLDivElement>(null)

  const checked = useMemo(() => check(base, draft), [base, draft])
  const changes = useMemo(() => changesOf(base, draft), [base, draft])
  const liveErrors = checked.ok ? [] : checked.errors
  const serverErrors = attempt.kind === 'refused-server' ? (attempt.errors as ValidationError[]) : []
  const placed = useMemo(() => placeErrors([...liveErrors, ...serverErrors], draft), [liveErrors, serverErrors, draft])
  const badLinks = useMemo(() => cycleLinks(liveErrors), [liveErrors])
  const known = useMemo(() => new Set(draft.tasks.map((t) => t.id)), [draft])

  const byKey = useMemo(() => {
    const map = new Map<number, PlacedError[]>()
    for (const p of placed) for (const k of p.keys) map.set(k, [...(map.get(k) ?? []), p])
    return map
  }, [placed])

  const edit = (next: Draft) => {
    setDraft(next)
    // A server refusal describes the document it was sent; after any edit, the live check speaks again.
    setAttempt((a) => (a.kind === 'refused-server' || a.kind === 'failed' || a.kind === 'saved' ? { kind: 'none' } : a))
  }
  const update = (key: number, patch: Partial<DraftTask>) =>
    edit({ ...draft, tasks: draft.tasks.map((t) => (t.key === key ? { ...t, ...patch } : t)) })

  async function save() {
    if (attempt.kind === 'saving') return
    if (!checked.ok) {
      setAttempt({ kind: 'refused-browser' })
      requestAnimationFrame(() => bannerRef.current?.focus())
      return
    }
    setAttempt({ kind: 'saving' })
    const outcome = await saveRelease(toDocument(base, draft))
    if (outcome.kind === 'saved') {
      await onSaved()
      setAttempt({ kind: 'saved' })
    } else {
      setAttempt(outcome.kind === 'refused' ? { kind: 'refused-server', errors: outcome.errors } : outcome)
      requestAnimationFrame(() => bannerRef.current?.focus())
    }
  }

  // ⌘S / Ctrl+S saves, as in any editor; the browser's own "save page" would be useless here.
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void saveRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (focusKey === undefined) return
    document.getElementById(`task-${focusKey}-id`)?.focus()
    setFocusKey(undefined)
  }, [focusKey])

  const add = () => {
    const { draft: next, key } = addTask(draft, newStream)
    // New tasks join the end of their stream's block, so the list keeps reading by stream.
    const tasks = next.tasks.filter((t) => t.key !== key)
    const after = tasks.map((t) => t.stream).lastIndexOf(newStream)
    tasks.splice(after === -1 ? tasks.length : after + 1, 0, next.tasks.find((t) => t.key === key)!)
    edit({ ...next, tasks })
    setFocusKey(key)
  }

  const goTo = (key: number) => {
    const el = document.getElementById(`task-${key}`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    document.getElementById(`task-${key}-id`)?.focus({ preventScroll: true })
  }

  // Deleted stored tasks keep a placeholder at their place, so the gap (and Restore) stays where it was.
  const rows: ({ kind: 'task'; task: DraftTask } | { kind: 'deleted'; key: number; id: string })[] = []
  const deleted = [...changes.deleted]
  for (const task of draft.tasks) {
    while (deleted.length > 0 && task.key < base.tasks.length && deleted[0]!.key < task.key) rows.push({ kind: 'deleted', ...deleted.shift()! })
    rows.push({ kind: 'task', task })
  }
  for (const d of deleted) rows.push({ kind: 'deleted', ...d })

  const changeCount = changes.edited.size + changes.added.size + changes.deleted.length

  return (
    <div className="editor">
      <SaveBar
        checked={checked}
        baseForecast={baseForecast}
        baseReady={baseReady}
        changeCount={changeCount}
        dirty={changes.any}
        problems={liveErrors.length}
        attempt={attempt}
        onSave={save}
        onDiscard={() => {
          setDraft(draftFrom(base))
          setAttempt({ kind: 'none' })
        }}
        onShowProblems={() => {
          const first = placed.find((p) => p.keys.length > 0)
          if (first) goTo(first.keys[0]!)
        }}
      />

      <Banner
        bannerRef={bannerRef}
        attempt={attempt}
        placed={placed}
        draft={draft}
        onGoTo={goTo}
      />

      <section className="section editor-table-section" aria-labelledby="editor-title">
        <div className="editor-head">
          <h2 id="editor-title">Tasks, links and gates</h2>
          <p className="section-note">
            Changes stay in this browser until you save. Every save is checked first; a refused save stores nothing and
            keeps what you typed. Predecessors are finish-to-start: a task starts after all of them finish.
          </p>
        </div>
        <div className="table-wrap">
          <table className="tasks editor-tasks">
            <colgroup>
              <col className="col-id" />
              <col />
              <col className="col-stream" />
              <col className="col-owner" />
              <col className="col-status" />
              <col className="col-estimate" />
              <col className="col-date" />
              <col className="col-gate" />
              <col className="col-preds" />
              <col className="col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Title</th>
                <th scope="col">Stream</th>
                <th scope="col">Owner role</th>
                <th scope="col">Status</th>
                <th scope="col" className="num" title="Estimate in working days">Days</th>
                <th scope="col">Target date</th>
                <th scope="col">Gate</th>
                <th scope="col">Predecessors</th>
                <th scope="col"><span className="visually-hidden">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) =>
                row.kind === 'deleted' ? (
                  <DeletedRow
                    key={`deleted-${row.key}`}
                    id={row.id}
                    title={base.tasks[row.key]!.title}
                    dependents={dependentsOf(draft, row.id)}
                    onRestore={() => edit(restoreTask(base, draft, row.key))}
                  />
                ) : (
                  <TaskRow
                    key={row.task.key}
                    task={row.task}
                    draft={draft}
                    workstreams={base.workstreams}
                    known={known}
                    badLinks={badLinks}
                    errors={byKey.get(row.task.key) ?? []}
                    state={changes.added.has(row.task.key) ? 'added' : changes.edited.has(row.task.key) ? 'edited' : undefined}
                    onChange={(patch) => update(row.task.key, patch)}
                    onDelete={() => edit(deleteTask(draft, row.task.key))}
                  />
                ),
              )}
            </tbody>
          </table>
        </div>
        <div className="editor-add">
          <label>
            <span className="visually-hidden">Stream for the new task</span>
            <select value={newStream} onChange={(e) => setNewStream(e.target.value)}>
              {base.workstreams.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <button type="button" onClick={add}>Add task to {newStream}</button>
        </div>
      </section>
    </div>
  )
}

function SaveBar(props: {
  checked: ReturnType<typeof check>
  baseForecast: Forecast
  baseReady: boolean
  changeCount: number
  dirty: boolean
  problems: number
  attempt: Attempt
  onSave: () => void
  onDiscard: () => void
  onShowProblems: () => void
}) {
  const { checked, baseForecast, baseReady, changeCount, dirty, problems, attempt } = props
  const saving = attempt.kind === 'saving'
  return (
    <div className="save-bar" role="region" aria-label="Draft">
      <div className="save-bar-state">
        {attempt.kind === 'saved' && !dirty ? (
          <span className="saved" role="status">Saved. The dashboard shows the new plan.</span>
        ) : dirty ? (
          <span>
            <strong>{changeCount} unsaved {changeCount === 1 ? 'change' : 'changes'}</strong>
            {problems > 0 && (
              <>
                {' · '}
                <button type="button" className="link link-bad" onClick={props.onShowProblems}>
                  {problems} {problems === 1 ? 'problem' : 'problems'}
                </button>
              </>
            )}
          </span>
        ) : (
          <span className="muted">No changes. Edit any field below.</span>
        )}
      </div>
      <Effect checked={checked} baseForecast={baseForecast} baseReady={baseReady} dirty={dirty} />
      <div className="save-bar-actions">
        <button type="button" onClick={props.onDiscard} disabled={!dirty || saving}>Discard changes</button>
        <button type="button" className="primary" onClick={props.onSave} disabled={!dirty || saving} aria-keyshortcuts="Meta+S Control+S">
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </div>
  )
}

/** The draft's effect on the two answers that matter, against what is stored. */
function Effect({ checked, baseForecast, baseReady, dirty }: { checked: ReturnType<typeof check>; baseForecast: Forecast; baseReady: boolean; dirty: boolean }) {
  if (!checked.ok) {
    return (
      <div className="effect">
        <span className="effect-label">If saved</span>
        <span className="muted">No forecast until the problems are fixed.</span>
      </div>
    )
  }
  const { forecast, readiness } = checked
  const allDone = readiness.drivingChain.length === 0
  const moved = forecast.finish - baseForecast.finish
  return (
    <div className="effect">
      <span className="effect-label">{dirty ? 'If saved' : 'Stored plan'}</span>
      <span className="effect-fact">
        <span className="effect-key">Est. finish</span>
        <strong>{allDone ? 'Complete' : formatDate(forecast.finishDate)}</strong>
        {!allDone && <span className="muted">day {forecast.finish}</span>}
        {!allDone && forecast.slipDays !== undefined && (
          <span className={`slip slip-${slipTone(forecast.slipDays)}`}>{slipText(forecast.slipDays)}</span>
        )}
      </span>
      {dirty && (
        <span className="effect-fact">
          <span className="effect-key">vs stored</span>
          {moved === 0 ? (
            <span className="muted">unchanged</span>
          ) : (
            <span className={`delta ${moved > 0 ? 'delta-later' : ''}`}>
              {moved > 0 ? `${moved} working ${moved === 1 ? 'day' : 'days'} later` : `${-moved} working ${moved === -1 ? 'day' : 'days'} sooner`}
            </span>
          )}
        </span>
      )}
      <span className="effect-fact">
        <span className={readiness.ready ? 'verdict-chip verdict-chip-ready' : 'verdict-chip verdict-chip-not-ready'}>
          {readiness.ready ? 'Ready' : 'Not ready'}
        </span>
        {dirty && readiness.ready !== baseReady && <span className="muted">was {baseReady ? 'ready' : 'not ready'}</span>}
      </span>
      <span className="estimate-tag">Estimate</span>
    </div>
  )
}

function Banner({
  bannerRef,
  attempt,
  placed,
  draft,
  onGoTo,
}: {
  bannerRef: React.RefObject<HTMLDivElement | null>
  attempt: Attempt
  placed: PlacedError[]
  draft: Draft
  onGoTo: (key: number) => void
}) {
  if (attempt.kind === 'failed') {
    return (
      <div className="notice notice-bad banner" ref={bannerRef} tabIndex={-1} role="alert">
        <h1>Not saved: the release API did not answer</h1>
        <p>Your changes are still here. Check that <code>npm run server</code> is running, then save again.</p>
        <p className="muted">Detail: {attempt.detail}</p>
      </div>
    )
  }
  if (attempt.kind !== 'refused-browser' && attempt.kind !== 'refused-server') return null
  if (placed.length === 0) {
    return (
      <div className="notice banner banner-fixed" ref={bannerRef} tabIndex={-1} role="status">
        <h1>The problems are fixed</h1>
        <p>Nothing has been stored yet. Save again to store your changes.</p>
      </div>
    )
  }
  const n = placed.length
  return (
    <div className="notice notice-bad banner" ref={bannerRef} tabIndex={-1} role="alert" aria-labelledby="banner-title">
      <h1 id="banner-title">
        Not saved: {n} {n === 1 ? 'problem' : 'problems'}
      </h1>
      <p>
        {attempt.kind === 'refused-server' ? 'The server refused the release' : 'The release failed validation'}. Nothing
        was stored, and everything you typed is still here. Fix {n === 1 ? 'it' : 'each one'}, then save again.
      </p>
      <ul className="problems banner-problems">
        {placed.map((p, i) => (
          <li key={i}>
            <span className="problem-where">
              {p.keys.length === 0 && <span className="muted">Release</span>}
              {p.keys.map((k) => {
                const id = draft.tasks.find((t) => t.key === k)?.id
                return (
                  <button key={k} type="button" className="link" onClick={() => onGoTo(k)} title="Show this task">
                    {id ? <span className="id">{id}</span> : 'task without id'}
                  </button>
                )
              })}
            </span>
            <span className="problem-body">
              <ProblemText error={p.error} />
              <code className="problem-code">{p.error.code}</code>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A cycle reads as a path of ids; every other error is the validator's own message. */
function ProblemText({ error, inRow }: { error: ValidationError; inRow?: boolean }) {
  if (!error.cycle) return <span className="problem-message">{error.message}</span>
  const path = [...error.cycle, error.cycle[0]!]
  return (
    <span className="problem-message">
      {inRow ? 'In a dependency cycle:' : 'Dependency cycle: each task waits for the next, so none can start.'}
      <span className="cycle-path" aria-label={`cycle ${path.join(' waits for ')}`}>
        {path.map((id, i) => (
          <span key={i}>
            {i > 0 && <span className="cycle-arrow" aria-hidden="true">→</span>}
            <span className="id">{id}</span>
          </span>
        ))}
      </span>
    </span>
  )
}

function TaskRow({
  task,
  draft,
  workstreams,
  known,
  badLinks,
  errors,
  state,
  onChange,
  onDelete,
}: {
  task: DraftTask
  draft: Draft
  workstreams: string[]
  known: Set<string>
  badLinks: Set<string>
  errors: PlacedError[]
  state?: 'added' | 'edited'
  onChange: (patch: Partial<DraftTask>) => void
  onDelete: () => void
}) {
  const base = `task-${task.key}`
  const errorsId = `${base}-errors`
  const bad = (field: Field) => errors.some((e) => e.field === field)
  const field = (name: Field, empty = false) => ({
    id: `${base}-${name}`,
    'aria-invalid': bad(name) || undefined,
    'aria-describedby': bad(name) ? errorsId : undefined,
    className: bad(name) ? 'is-invalid' : empty ? 'is-empty' : undefined,
  })
  const label = task.id || 'new task'
  const candidates = draft.tasks.filter((t) => t.id !== '' && t.key !== task.key && !task.predecessors.includes(t.id))
  const dependents = task.id === '' ? [] : dependentsOf(draft, task.id)
  const isGate = task.gate !== ''
  return (
    <>
      <tr id={base} className={[errors.length > 0 ? 'has-errors' : '', state ? `is-${state}` : ''].join(' ').trim() || undefined}>
        <td className="cell-id">
          <input {...field('id')} value={task.id} onChange={(e) => onChange({ id: e.target.value })} aria-label={`ID of ${label}`} spellCheck={false} placeholder="ID" />
        </td>
        <td className="cell-title">
          <input {...field('title')} value={task.title} onChange={(e) => onChange({ title: e.target.value })} aria-label={`Title of ${label}`} placeholder="Untitled" />
        </td>
        <td>
          <select {...field('stream')} value={task.stream} onChange={(e) => onChange({ stream: e.target.value })} aria-label={`Stream of ${label}`}>
            {!workstreams.includes(task.stream) && <option value={task.stream}>{task.stream || '—'}</option>}
            {workstreams.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </td>
        <td className="cell-owner">
          <input {...field('ownerRole')} value={task.ownerRole} onChange={(e) => onChange({ ownerRole: e.target.value })} aria-label={`Owner role of ${label}`} spellCheck={false} placeholder="—" />
        </td>
        <td>
          <select {...field('status')} value={task.status} onChange={(e) => onChange({ status: e.target.value })} aria-label={`Status of ${label}`}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
            ))}
          </select>
        </td>
        <td className="num cell-estimate">
          {/* Text, not type=number: the operator's "1.5" or "-2" must reach the validator as typed, never be dropped. */}
          <input
            {...field('estimate')}
            value={task.estimate}
            onChange={(e) => onChange({ estimate: e.target.value })}
            aria-label={`Estimate in working days of ${label}${isGate ? ' (0 allowed for a gate)' : ''}`}
            inputMode="numeric"
            spellCheck={false}
          />
        </td>
        <td>
          <input {...field('targetDate', task.targetDate === '')} type="date" value={task.targetDate} onChange={(e) => onChange({ targetDate: e.target.value })} aria-label={`Target date of ${label}`} />
        </td>
        <td>
          <select {...field('gate', !isGate)} value={task.gate} onChange={(e) => onChange({ gate: e.target.value })} aria-label={`Gate of ${label}`}>
            <option value="">Not a gate</option>
            {GATES.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </td>
        <td className="cell-preds">
          <ul className="chips" aria-label={`Predecessors of ${label}`}>
            {task.predecessors.map((p, i) => {
              const problem = !known.has(p) ? 'unknown' : p === task.id ? 'self' : badLinks.has(`${task.id}>${p}`) ? 'cycle' : task.predecessors.indexOf(p) !== i ? 'repeated' : undefined
              return (
                <li key={`${p}-${i}`} className={problem ? 'chip chip-bad' : 'chip'} title={problem ? `${p}: ${problem === 'unknown' ? 'no such task' : problem === 'cycle' ? 'part of a cycle' : problem}` : undefined}>
                  <span className="id">{p}</span>
                  {problem === 'unknown' && <span className="chip-note">missing</span>}
                  <button
                    type="button"
                    className="chip-remove"
                    aria-label={`Remove link: ${label} waits for ${p}`}
                    onClick={() => onChange({ predecessors: task.predecessors.filter((_, j) => j !== i) })}
                  >
                    ×
                  </button>
                </li>
              )
            })}
            <li>
              <select
                className="add-link"
                value=""
                onChange={(e) => e.target.value && onChange({ predecessors: [...task.predecessors, e.target.value] })}
                aria-label={`Add a predecessor to ${label}`}
              >
                <option value="">+ Link</option>
                {candidates.map((t) => (
                  <option key={t.key} value={t.id}>
                    {t.id}
                    {t.title ? ` · ${t.title}` : ''}
                  </option>
                ))}
              </select>
            </li>
          </ul>
        </td>
        <td className="cell-actions">
          <button
            type="button"
            className="icon-button"
            onClick={onDelete}
            aria-label={`Delete ${label}`}
            title={dependents.length > 0 ? `Delete ${label}. ${dependents.join(', ')} still ${dependents.length === 1 ? 'links' : 'link'} to it and will need fixing.` : `Delete ${label}`}
          >
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
              <path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.6 8.5h4.8l.6-8.5" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </td>
      </tr>
      {errors.length > 0 && (
        <tr className="row-errors" id={errorsId}>
          <td colSpan={10}>
            <ul>
              {errors.map((e, i) => (
                <li key={i}>
                  <ProblemText error={e.error} inRow />
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  )
}

function DeletedRow({ id, title, dependents, onRestore }: { id: string; title: string; dependents: string[]; onRestore: () => void }) {
  return (
    <tr className="is-deleted">
      <td className="cell-id"><span className="id">{id}</span></td>
      <td colSpan={8}>
        <span className="deleted-title">{title}</span>
        <span className="deleted-note">
          Deleted, not saved yet
          {dependents.length > 0 && (
            <>
              {' · still a predecessor of '}
              {dependents.map((d, i) => (
                <span key={d}>
                  {i > 0 && ', '}
                  <span className="id">{d}</span>
                </span>
              ))}
            </>
          )}
        </span>
      </td>
      <td className="cell-actions">
        <button type="button" className="link" onClick={onRestore} aria-label={`Restore ${id}`}>Restore</button>
      </td>
    </tr>
  )
}
