import { ClipboardCheckIcon, RotateCwIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Row, Rows } from '@/components/ui/rows'
import { actionRef, defineWebExtension, useAction } from '@/sdk'

type Phase = { phase: string; open: number; closed: number; source: string }
type Line = { label: string; value: string; source: string }
type Tokens = { phase: string; tokens: string; cost: string; source: string }
type Status = {
  phase: string | null
  updated: string | null
  defects: { log: string; total: number; severities: Record<string, number> }[]
  summary: {
    updated: string | null
    issues: Phase[] | null
    tests: Line[] | null
    tokens: Tokens[] | null
  } | null
  summaryError: string | null
}

/** No arguments → the phase, defect counts and the committed summary, read from repo files. */
const StatusAction = actionRef<null, Status>('poc-status', 'status')

function Section({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-border/60 px-3 pt-2 pb-3 last:border-b-0">
      <div className="flex h-6 items-center font-mono text-[11px] text-muted-foreground">
        {title}
        {meta !== undefined && <span className="ml-auto truncate pl-2 text-muted-foreground/70">{meta}</span>}
      </div>
      {children}
    </section>
  )
}

function Muted({ children }: { children: ReactNode }) {
  return <span className="truncate text-muted-foreground/70">{children}</span>
}

function StatusPanel() {
  const { data, error, loading, refetch } = useAction(StatusAction)
  if (!data)
    return (
      <div className="p-3 font-mono text-[11.5px] text-muted-foreground">
        {error ? error.message : loading ? 'reading…' : 'no data'}
      </div>
    )
  const summary = data.summary
  const totalDefects = data.defects.reduce((sum, log) => sum + log.total, 0)
  return (
    <div className="pb-4">
      <Section
        meta={
          <Button className="size-5" onClick={() => void refetch()} size="icon" title="Read again" variant="ghost">
            <RotateCwIcon className="size-3" />
          </Button>
        }
        title="Phase"
      >
        <Rows>
          <Row label="current">{data.phase ?? <Muted>not found</Muted>}</Row>
          <Row label="updated">{data.updated ?? '—'}</Row>
        </Rows>
      </Section>
      {data.summaryError && (
        <div className="mx-3 mt-2 font-mono text-[11px] text-error">{data.summaryError}</div>
      )}
      {summary?.issues && (
        <Section meta="open / closed" title="Issues">
          <Rows>
            {summary.issues.map((row) => (
              <Row key={row.phase} label={row.phase}>
                <span title={row.source}>
                  <span className={row.open ? 'text-warning' : undefined}>{row.open}</span>
                  <span className="text-muted-foreground/70"> / </span>
                  {row.closed}
                </span>
              </Row>
            ))}
          </Rows>
        </Section>
      )}
      {summary?.tests && (
        <Section title="Tests">
          <Rows>
            {summary.tests.map((row) => (
              <Row key={row.label} label={row.label}>
                <span className="truncate" title={row.source}>
                  {row.value}
                </span>
              </Row>
            ))}
          </Rows>
        </Section>
      )}
      <Section meta={totalDefects} title="Defects">
        <Rows>
          {data.defects.map((log) => (
            <Row key={log.log} label={log.log.split('/')[1] ?? log.log}>
              <span title={log.log}>
                {log.total}
                <span className="text-muted-foreground/70">
                  {' · '}
                  {Object.entries(log.severities)
                    .map(([severity, count]) => `${count} ${severity}`)
                    .join(', ')}
                </span>
              </span>
            </Row>
          ))}
          {data.defects.length === 0 && <Row label="logs">none</Row>}
        </Rows>
      </Section>
      {summary?.tokens && (
        <Section meta="list-price proxy" title="Tokens / cost">
          <Rows>
            {summary.tokens.map((row) => (
              <Row key={row.phase} label={row.phase}>
                <span className="truncate" title={row.source}>
                  {row.tokens} <Muted>{row.cost}</Muted>
                </span>
              </Row>
            ))}
          </Rows>
        </Section>
      )}
      {summary?.updated && (
        <div className="px-3 pt-2 font-mono text-[10.5px] text-muted-foreground/60">
          summary {summary.updated} · experiments/EXP-05/status.json
        </div>
      )}
    </div>
  )
}

export default defineWebExtension({
  panels: [{ id: 'poc-status', title: 'POC status', icon: ClipboardCheckIcon, component: StatusPanel }],
  commands: [
    { id: 'poc-status.open', title: 'Show POC status', run: (context) => context.openPanel('poc-status') },
  ],
})
