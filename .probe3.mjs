import { execFileSync } from 'node:child_process';
const q = (s) => execFileSync('docker',['compose','exec','-T','db','sh','-c',
  `psql -U "$POSTGRES_USER" -d vernier_scratch -At -c ${JSON.stringify(s.replace(/\s+/g,' ').trim())}`],
  {cwd:process.cwd(),encoding:'utf8'}).trim();

const n = Number(process.argv[2] ?? 200);
const t0 = Date.now();
q('truncate measurement, source_record, import_question, idempotency_key, write_request');
q("delete from app_meta where key in ('demo.anchor_day', 'demo.filled_through')");
q(`insert into app_meta (key, value) values ('demo.anchor_day', to_char(current_date - ${n}, 'YYYY-MM-DD'))`);
execFileSync('docker',['restart','vernier-scratch'],{encoding:'utf8'});
execFileSync('bash',['-c','for i in $(seq 1 120); do curl -fsS http://127.0.0.1:3101/healthz >/dev/null 2>&1 && exit 0; sleep 1; done; exit 1'],{encoding:'utf8'});
console.log('anchor', q("select value from app_meta where key='demo.anchor_day'"), 'filled', q("select value from app_meta where key='demo.filled_through'"));
console.log('rows', q('select count(*) from measurement'));
console.log('freshness:', q(`select string_agg(s.source || '=' || round(extract(epoch from now() - s.last)/3600) || 'h', ', ' order by s.source) from (select sr.source, max(m.measured_at) last from measurement m join source_record sr on sr.id = m.source_record_id group by sr.source) s`));
console.log('seconds', ((Date.now()-t0)/1000).toFixed(1));
