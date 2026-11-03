#!/bin/bash
# Read-only status of one arm's storage. Usage: status.sh <label>
DB=/tmp/exp12/runs/$1/state.sqlite
sqlite3 -readonly -separator ' | ' "$DB" "select e.conversation_id, coalesce((select json_extract(s.record,'$.data.data.agent') from entries s where json_extract(s.record,'$.kind')='event.subagents.started' and json_extract(s.record,'$.data.data.id')=e.conversation_id), 'root'), json_extract(e.record,'$.model[0].provider')||'/'||json_extract(e.record,'$.model[0].model'), count(*), round(sum(json_extract(e.record,'$.model[0].usage.cost.total')),3), datetime(max(json_extract(e.record,'$.model[0].timestamp'))/1000,'unixepoch') from entries e where json_extract(e.record,'$.kind')='pi.assistant' group by 1,2,3"
