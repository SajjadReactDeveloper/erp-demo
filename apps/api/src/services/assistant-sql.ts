// Free-form business questions (RPT-10): an LLM writes ONE read-only SELECT over a curated schema; we validate it, scope it to the
// asker's company and permissions, and run it as a database role that can only SELECT. The fixed intents in ai.ts still answer first.
import { prisma } from '@erp/db';
import { ASSISTANT_KEYS, BY_KEY, can, tableOf, type Field } from '@erp/shared';
import type { Ctx } from '../core/base';
import { llm } from '../adapters';

const FORBIDDEN = /\b(insert|update|delete|drop|alter|create|truncate|grant|revoke|copy|call|execute|prepare|deallocate|do|set|reset|show|vacuum|analyze|cluster|lock|listen|notify|unlisten|load|import|refresh|reindex|comment|security|recursive|into|pg_[a-z_]+|information_schema|current_setting|set_config|lo_[a-z]+|dblink|public|erp_ro|session_user|current_user|user)\b/i;
// Every name followed by "(" must be a plain aggregate/scalar function or an SQL keyword. Functions that execute a query given as text
// (query_to_xml, table_to_xml, xpath, dblink…) would run outside the company-scoped CTEs, so they are simply not on the list.
const ALLOWED_CALLS = new Set(('count sum avg min max round ceil ceiling floor abs coalesce nullif greatest least to_char to_date to_number date_trunc date_part extract age now current_date lower upper initcap length trim ltrim rtrim concat concat_ws replace split_part substr substring left right position strpos string_agg array_agg bool_and bool_or stddev variance percentile_cont percentile_disc row_number rank dense_rank lag lead first_value last_value ntile cast mod power sqrt sign date make_date interval ' +
  'in and or not exists any all some over from join on where select as case when then else end filter within values using by having group order limit offset union intersect except between like ilike is distinct partition rows range unbounded preceding following current row asc desc nulls first last with lateral inner outer cross natural full').split(' '));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SQL_T: Record<string, string> = { string: 'text', text: 'text', int: 'int', decimal: 'numeric', bool: 'bool', date: 'date', datetime: 'timestamp', json: 'jsonb', enum: 'text', ref: 'uuid' };

/** Throws a user-facing Error when the SQL is not a single plain SELECT. */
export function validateSql(raw: string): string {
  let sql = String(raw ?? '').trim().replace(/;+\s*$/, '');
  if (!sql) throw new Error('empty');
  if (sql.length > 4000) throw new Error('too long');
  if (/[;$`\\]|--|\/\*|\*\//.test(sql)) throw new Error('only one plain statement is allowed');
  if (!/^(select|with)\b/i.test(sql)) throw new Error('only SELECT queries are allowed');
  const noStrings = sql.replace(/'(?:[^']|'')*'/g, "''");
  const bad = FORBIDDEN.exec(noStrings); if (bad) throw new Error(`"${bad[0]}" is not allowed`);
  for (const m of noStrings.matchAll(/([a-z_][a-z0-9_]*)\s*\(/gi)) if (!ALLOWED_CALLS.has(m[1].toLowerCase())) throw new Error(`function "${m[1]}" is not allowed`);
  return sql;
}

function tablesFor(ctx: Ctx) {
  return ASSISTANT_KEYS.map((k) => { const r = BY_KEY[k]; return { key: k, t: tableOf(k), res: r, allowed: !!r && can(ctx.perms, { mod: r.mod, slug: r.slug }, 'read') }; }).filter((x) => x.res);
}
const col = (f: Field) => `"${f.name}" ${SQL_T[f.type] ?? 'text'}${f.type === 'enum' && f.values ? ` (${f.values.join('|')})` : ''}${f.type === 'ref' && f.ref ? ` -> ${tableOf(f.ref)}.id` : ''}`;

export function schemaText(ctx: Ctx): string {
  return tablesFor(ctx).filter((x) => x.allowed).map((x) => `${x.t}(id uuid, ${x.res.fields.filter((f) => !f.hidden && f.type !== 'json').map(col).join(', ')}, "createdAt" timestamp)`).join('\n');
}

const cols = (x: { res: { fields: Field[] } }) => ['id', ...(x.res.fields.filter((f) => !f.hidden && f.type !== 'json').map((f) => f.name)), 'createdAt'].map((c) => `"${c}"`).join(', ');

/** Company-scoped shadows of every analytic table: unqualified names in the query resolve to these, never to the real tables. */
function ctes(ctx: Ctx): string {
  if (!UUID.test(ctx.companyId)) throw new Error('bad company');
  return tablesFor(ctx).map((x) => `"${x.t}" AS (SELECT ${cols(x)} FROM public."${x.t}" WHERE ${x.allowed ? (x.res.global ? 'true' : `"companyId" = '${ctx.companyId}'`) : 'false'})`).join(', ');
}

const plain = (v: any): any => (typeof v === 'bigint' ? Number(v) : v instanceof Date ? v.toISOString().slice(0, 19).replace('T', ' ') : v && typeof v === 'object' && typeof v.toNumber === 'function' ? v.toNumber() : v);

export async function runReadOnly(ctx: Ctx, rawSql: string) {
  const sql = validateSql(rawSql);
  const wrapped = `WITH ${ctes(ctx)} SELECT * FROM (${sql}) AS q LIMIT 200`;
  const rows: any[] = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
    await tx.$executeRawUnsafe('SET LOCAL ROLE erp_ro');
    await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '5000'");
    return tx.$queryRawUnsafe(wrapped) as Promise<any[]>;
  }, { timeout: 9000 });
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  return { sql, columns, rows: rows.map((r) => columns.map((c) => plain(r[c]))) };
}

const SYSTEM = `You turn a business question about an auto-parts trading company into ONE PostgreSQL SELECT query.
Rules:
- Use only the tables and columns listed in the schema. Columns are camelCase and MUST be double-quoted, e.g. "unitPrice".
- Rows are already limited to the user's company: never filter or join on "companyId".
- Money is in SAR. Today is {TODAY}. Use CURRENT_DATE / date_trunc for relative dates.
- Return at most 50 rows unless the question asks otherwise; order meaningfully; give columns readable aliases (e.g. AS customer, AS total_sales).
- Exclude cancelled/draft/rejected documents when summing sales or spend.
- One statement, no semicolon, no comments, no CTE named like a table. Read-only.
Answer ONLY with JSON: {"sql": string, "title": string, "chart": "bar"|"line"|"pie"|"none"}. If the question cannot be answered from the schema, return {"sql": "", "title": "", "chart": "none", "reason": "..."}.`;

export async function askFreeform(ctx: Ctx, question: string) {
  const system = SYSTEM.replace('{TODAY}', new Date().toISOString().slice(0, 10));
  const user = `Schema:\n${schemaText(ctx)}\n\nQuestion: ${question}`;
  let lastErr = ''; let ask = user;
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await llm.json(system, ask); const d = r?.data;
    if (!d) return { ok: false as const, reason: 'The AI engine did not answer. Try again in a moment.' };
    if (!d.sql) return { ok: false as const, reason: d.reason ?? 'That question cannot be answered from the data I can read.' };
    try { const out = await runReadOnly(ctx, d.sql); return { ok: true as const, title: String(d.title || question).slice(0, 120), chart: (['bar', 'line', 'pie'].includes(d.chart) ? d.chart : undefined) as 'bar' | 'line' | 'pie' | undefined, ...out, ms: r.ms }; }
    catch (e: any) { lastErr = String(e.message ?? e).slice(0, 300); ask = `${user}\n\nYour previous query failed: ${lastErr}\nPrevious query: ${d.sql}\nReturn a corrected JSON answer.`; }
  }
  return { ok: false as const, reason: `I could not build a valid query for that (${lastErr}).` };
}
