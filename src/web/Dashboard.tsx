import type { NotReadyReason } from '../domain/readiness'
import { formatDate, slipText, slipTone, STATUS_LABEL, type Dashboard, type TaskRow } from './view'

export function DashboardView({ dashboard }: { dashboard: Dashboard }) {
  return (
    <>
      <Summary d={dashboard} />
      <Reasons d={dashboard} />
      <div className="forecast-grid">
        <Forecast d={dashboard} />
        <Assumptions />
      </div>
      <DrivingChain d={dashboard} />
      <Streams d={dashboard} />
    </>
  )
}

/** The three answers first: can we ship, what is in the way, when will we realistically finish. */
function Summary({ d }: { d: Dashboard }) {
  const { readiness, forecast, doc } = d
  const next = d.chainForward.find((id) => readiness.criticalBlockers.includes(id))
  const nextRow = next === undefined ? undefined : d.tasks.get(next)
  const allDone = readiness.drivingChain.length === 0
  return (
    <section className="summary" aria-label="Summary">
      <div className="verdict-block">
        <p className="eyebrow">Release readiness</p>
        <h1 className={`verdict ${readiness.ready ? 'verdict-ready' : 'verdict-not-ready'}`}>
          {readiness.ready ? 'Ready' : 'Not ready'}
        </h1>
        <p className="verdict-sub">
          {readiness.ready
            ? 'All four mandatory gates are done and no blocking task remains.'
            : `${readiness.reasons.length} ${readiness.reasons.length === 1 ? 'reason' : 'reasons'} below · ${readiness.blockingTasks.length} blocking ${readiness.blockingTasks.length === 1 ? 'task' : 'tasks'} open`}
        </p>
      </div>
      <div className="fact">
        <p className="eyebrow">Estimated finish</p>
        {allDone ? (
          <p className="fact-value">Complete</p>
        ) : (
          <>
            <p className="fact-value">{formatDate(forecast.finishDate)}</p>
            <p className="fact-sub">
              {forecast.slipDays === undefined ? (
                'No release target set'
              ) : (
                <>
                  <span className={`slip slip-${slipTone(forecast.slipDays)}`}>{slipText(forecast.slipDays)}</span>
                  {' · target '}
                  {formatDate(doc.release.targetDate!)}
                </>
              )}
            </p>
            <p className="estimate-tag">Estimate, not a commitment</p>
          </>
        )}
      </div>
      <div className="fact">
        <p className="eyebrow">First critical blocker</p>
        {nextRow ? (
          <>
            <p className="fact-value">
              <span className="id">{nextRow.task.id}</span> {nextRow.task.title}
            </p>
            <p className="fact-sub">
              {STATUS_LABEL[nextRow.task.status]} · {nextRow.task.stream} · est. done {formatDate(nextRow.slot.finishDate)}
            </p>
          </>
        ) : (
          <p className="fact-value muted">None</p>
        )}
      </div>
    </section>
  )
}

function Reasons({ d }: { d: Dashboard }) {
  const { readiness, tasks } = d
  if (readiness.ready) return null
  return (
    <section className="section" aria-labelledby="reasons-title">
      <h2 id="reasons-title">Why it is not ready</h2>
      <p className="section-note">Every reason, in the order the readiness rule checks them.</p>
      <ol className="reasons">
        {readiness.reasons.map((reason, i) => (
          <li key={i} className={`reason reason-${reason.kind}`}>
            <ReasonText reason={reason} titleOf={(id) => tasks.get(id)?.task.title} />
          </li>
        ))}
      </ol>
      {readiness.inconsistencies.length > 0 && (
        <p className="section-note">
          Inconsistent statuses never make a release not ready on their own; they are listed because another reason applies.
        </p>
      )}
    </section>
  )
}

function ReasonText({ reason, titleOf }: { reason: NotReadyReason; titleOf: (id: string) => string | undefined }) {
  switch (reason.kind) {
    case 'missing-gate':
      return (
        <>
          <span className="reason-head">Gate <code>{reason.gate}</code> is not defined</span>
          <span className="reason-detail">No task carries this mandatory gate.</span>
        </>
      )
    case 'open-gate':
      return (
        <>
          <span className="reason-head">
            Gate <code>{reason.gate}</code> is not done
          </span>
          <span className="reason-detail">
            <Id id={reason.taskId} /> {titleOf(reason.taskId)}
          </span>
        </>
      )
    case 'blocking-tasks':
      return (
        <>
          <span className="reason-head">
            {reason.taskIds.length} blocking {reason.taskIds.length === 1 ? 'task is' : 'tasks are'} not done
          </span>
          <span className="reason-detail">Open tasks that feed a mandatory gate, directly or through other tasks.</span>
          <IdList ids={reason.taskIds} />
        </>
      )
    case 'inconsistency':
      return (
        <>
          <span className="reason-head">
            <Id id={reason.taskId} /> is done, but its predecessors are not
          </span>
          <IdList ids={reason.openPredecessors} label="Open predecessors" />
        </>
      )
  }
}

function Forecast({ d }: { d: Dashboard }) {
  const { forecast, doc, readiness } = d
  const allDone = readiness.drivingChain.length === 0
  const slip = forecast.slipDays
  // Working-day index of the target: slip = workdays(finish) - workdays(target), so target = finish - slip.
  const targetDay = slip === undefined ? undefined : forecast.finish - slip
  const span = Math.max(forecast.finish, targetDay ?? 0) + 1
  const pct = (day: number) => `${Math.min(100, Math.max(0, ((day + 1) / span) * 100))}%`
  return (
    <section className="section forecast" aria-labelledby="forecast-title">
      <h2 id="forecast-title">
        Forecast vs target <span className="estimate-tag">Estimate, not a commitment</span>
      </h2>
      {allDone ? (
        <p>Every task is done; there is nothing left to forecast.</p>
      ) : (
        <>
          <dl className="forecast-facts">
            <div>
              <dt>Estimated finish</dt>
              <dd>{formatDate(forecast.finishDate)}</dd>
            </div>
            <div>
              <dt>Release target</dt>
              <dd>{doc.release.targetDate ? formatDate(doc.release.targetDate) : 'Not set'}</dd>
            </div>
            <div>
              <dt>Slip</dt>
              <dd>
                {slip === undefined ? '—' : <span className={`slip slip-${slipTone(slip)}`}>{slipText(slip)}</span>}
              </dd>
            </div>
          </dl>
          <div className="track" aria-hidden="true">
            <div className={`track-fill ${slip !== undefined && slip > 0 ? 'track-fill-late' : ''}`} style={{ width: pct(forecast.finish) }} />
            {targetDay !== undefined && <div className="track-target" style={{ left: pct(targetDay) }} />}
          </div>
          <div className="track-legend" aria-hidden="true">
            <span>Start {formatDate(forecast.day0)}</span>
            <span>
              <i className="key key-fill" /> estimated work
              {targetDay !== undefined && (
                <>
                  {'  '}
                  <i className="key key-target" /> target
                </>
              )}
            </span>
          </div>
          <p className="section-note">
            The finish is the latest forecast finish of any task, counted in working days from {formatDate(forecast.day0)}.
            Target dates are compared with the forecast, never used to schedule it. It moves whenever an estimate or status
            changes.
          </p>
        </>
      )}
    </section>
  )
}

function Assumptions() {
  return (
    <aside className="section assumptions" aria-labelledby="assumptions-title">
      <h2 id="assumptions-title">What the forecast assumes</h2>
      <ul>
        <li>Working days are Monday to Friday, with no holidays.</li>
        <li>Each stream works on one task at a time.</li>
        <li>Work is counted in whole days.</li>
        <li>Estimates are the work remaining, not the original size.</li>
        <li>
          Tasks are placed by a simple greedy rule (earliest possible start, ties by id). It is not an optimal plan; a
          different order could finish sooner.
        </li>
      </ul>
    </aside>
  )
}

function DrivingChain({ d }: { d: Dashboard }) {
  const { chainForward, chainTies, readiness, tasks } = d
  if (chainForward.length === 0) return null
  const critical = new Set(readiness.criticalBlockers)
  return (
    <section className="section" aria-labelledby="chain-title">
      <h2 id="chain-title">Driving chain under v1 capacity assumptions</h2>
      <p className="section-note">
        The tasks that set the estimated finish, earliest first: each one starts the working day after the one before it
        ends. A delay to any of them moves the finish. Open blocking tasks on this chain are the{' '}
        <strong>critical blockers</strong> ({readiness.criticalBlockers.length}).
      </p>
      <ol className="chain">
        {chainForward.map((id) => {
          const row = tasks.get(id)!
          return (
            <li key={id} className={critical.has(id) ? 'chain-step is-critical' : 'chain-step'}>
              <span className="chain-id">
                <Id id={id} />
                {critical.has(id) && <span className="badge badge-critical">Critical blocker</span>}
              </span>
              <span className="chain-title">{row.task.title}</span>
              <span className="chain-meta">
                {STATUS_LABEL[row.task.status]} · {row.task.stream} · est. done {formatDate(row.slot.finishDate)}
              </span>
            </li>
          )
        })}
      </ol>
      <p className="limit">
        <strong>Limit:</strong> this follows one chain only. Where two tasks tie, it takes one of them, so a task on
        another path that finishes at the same time is not shown here.
        {chainTies.length > 0 && (
          <>
            {' '}
            In this release, <IdList ids={chainTies} inline /> {chainTies.length === 1 ? 'ties' : 'tie'} with the end of the
            chain, <Id id={chainForward[chainForward.length - 1]!} />, and {chainTies.length === 1 ? 'is' : 'are'} just as
            late.
          </>
        )}
      </p>
    </section>
  )
}

function Streams({ d }: { d: Dashboard }) {
  return (
    <section className="section" aria-labelledby="streams-title">
      <h2 id="streams-title">Tasks by stream</h2>
      <p className="section-note">
        <span className="badge badge-critical">Critical</span> on the driving chain ·{' '}
        <span className="badge badge-blocking">Blocking</span> open and needed for a gate ·{' '}
        <span className="badge badge-gate">Gate</span> mandatory readiness gate · <em>Blocked by</em> lists open direct
        predecessors.
      </p>
      <div className="table-wrap">
        <table className="tasks">
          <thead>
            <tr>
              <th scope="col">Task</th>
              <th scope="col">Status</th>
              <th scope="col">Est. done</th>
              <th scope="col">Blocked by</th>
            </tr>
          </thead>
          {d.streams.map((group) => (
            <tbody key={group.stream}>
              <tr className="stream-row">
                <th scope="rowgroup" colSpan={4}>
                  <span className="stream-name">{group.stream}</span>
                  <span className="stream-counts">
                    {group.counts.in_progress} in progress · {group.counts.todo} to do · {group.counts.done} done
                  </span>
                </th>
              </tr>
              {group.rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">No tasks in this stream.</td>
                </tr>
              )}
              {group.rows.map((row) => (
                <TaskLine key={row.task.id} row={row} />
              ))}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  )
}

function TaskLine({ row }: { row: TaskRow }) {
  const { task, slot } = row
  const done = task.status === 'done'
  return (
    <tr className={done ? 'is-done' : undefined}>
      <td>
        <span className="task-cell">
          <Id id={task.id} />
          <span className="task-title">{task.title}</span>
          {task.gate !== undefined && <span className="badge badge-gate">Gate</span>}
          {row.critical ? (
            <span className="badge badge-critical">Critical</span>
          ) : (
            row.blocking && <span className="badge badge-blocking">Blocking</span>
          )}
        </span>
      </td>
      <td>
        <span className={`status status-${task.status}`}>{STATUS_LABEL[task.status]}</span>
      </td>
      <td className="nowrap">
        {done ? (
          <span className="muted">—</span>
        ) : (
          <>
            {formatDate(slot.finishDate)}
            {slot.slipDays !== undefined && slot.slipDays > 0 && (
              <span className="slip slip-late task-slip">{slipText(slot.slipDays)}</span>
            )}
          </>
        )}
      </td>
      <td>{row.waitingOn.length > 0 ? <IdList ids={row.waitingOn} inline /> : <span className="muted">—</span>}</td>
    </tr>
  )
}

function Id({ id }: { id: string }) {
  return <span className="id">{id}</span>
}

function IdList({ ids, label, inline }: { ids: string[]; label?: string; inline?: boolean }) {
  const list = (
    <span className="id-list">
      {ids.map((id, i) => (
        <span key={id}>
          <Id id={id} />
          {inline && i < ids.length - 1 ? ', ' : ''}
        </span>
      ))}
    </span>
  )
  return label ? (
    <span className="reason-detail">
      {label}: {list}
    </span>
  ) : (
    list
  )
}
