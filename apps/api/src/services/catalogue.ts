import { Tx } from '@erp/db';
import { Ctx, D } from '../core/base';

export const normPN = (s: string) => String(s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Exact/xref/fuzzy lookup. Returns the existing part when confident, else null. */
export async function findPart(tx: Tx, companyId: string, partNumber: string, opts: { fuzzy?: number } = {}): Promise<{ id: string; exact: boolean } | null> {
  const n = normPN(partNumber);
  if (!n) return null;
  const exact: any[] = await tx.$queryRawUnsafe(
    `SELECT id FROM part WHERE "companyId"=$1 AND status <> 'merged' AND regexp_replace(upper("partNumber"),'[^A-Z0-9]','','g') = $2 LIMIT 1`, companyId, n);
  if (exact[0]) return { id: exact[0].id, exact: true };
  const x: any[] = await tx.$queryRawUnsafe(
    `SELECT "partId" id FROM part_xref WHERE "companyId"=$1 AND regexp_replace(upper("xrefNumber"),'[^A-Z0-9]','','g') = $2 LIMIT 1`, companyId, n);
  if (x[0]) return { id: x[0].id, exact: true };
  const th = opts.fuzzy ?? 0.8;
  const f: any[] = await tx.$queryRawUnsafe(
    `SELECT id, similarity("partNumber", $2) s FROM part WHERE "companyId"=$1 AND status <> 'merged' AND similarity("partNumber", $2) > $3 ORDER BY s DESC LIMIT 1`, companyId, partNumber, th);
  return f[0] ? { id: f[0].id, exact: false } : null;
}

/** MDM-02: new part numbers from quotations/orders become draft catalogue entries (duplicates detected, never silently created). */
export async function ensurePart(tx: Tx, ctx: Ctx, p: { partNumber: string; name?: string; brandId?: string | null; source: 'quotation' | 'order' | 'import' | 'supplier' }) {
  const hit = await findPart(tx, ctx.companyId, p.partNumber, { fuzzy: 0.9 });
  if (hit) return { id: hit.id, created: false };
  const row = await tx.part.create({ data: { companyId: ctx.companyId, partNumber: p.partNumber.trim(), name: p.name?.trim() || p.partNumber.trim(), brandId: p.brandId ?? undefined, status: 'draft', source: p.source, createdById: ctx.userId } });
  return { id: row.id, created: true };
}

export async function recordPrice(tx: Tx, companyId: string, p: { partId: string; kind: 'supplier' | 'selling'; price: any; supplierId?: string | null; customerId?: string | null; source?: string }) {
  await tx.priceHistory.create({ data: { companyId, partId: p.partId, kind: p.kind, price: D(p.price), supplierId: p.supplierId ?? undefined, customerId: p.customerId ?? undefined, currency: 'SAR', source: p.source, recordedAt: new Date() } });
}

/** Trigram + vehicle-fit search used by AI-1, marketplace search and POS lookup. */
export async function searchParts(tx: Tx, companyId: string, q: string, vehicle?: { make?: string | null; model?: string | null; year?: number | null }, limit = 10) {
  const n = normPN(q);
  const rows: any[] = await tx.$queryRawUnsafe(
    `SELECT p.id, p."partNumber", p.name, p."nameAr",
       GREATEST(similarity(p."partNumber", $2), similarity(p.name, $2), similarity(COALESCE(p."nameAr",''), $2),
                COALESCE((SELECT MAX(similarity(x."xrefNumber", $2)) FROM part_xref x WHERE x."partId" = p.id), 0),
                CASE WHEN regexp_replace(upper(p."partNumber"),'[^A-Z0-9]','','g') = $3 THEN 1 ELSE 0 END) AS score,
       EXISTS (SELECT 1 FROM part_vehicle_fit f WHERE f."partId" = p.id AND ($4::text IS NULL OR lower(f.make) = lower($4)) AND ($5::text IS NULL OR lower(f.model) = lower($5)) AND ($6::int IS NULL OR ((f."yearFrom" IS NULL OR f."yearFrom" <= $6) AND (f."yearTo" IS NULL OR f."yearTo" >= $6)))) AS fits
     FROM part p WHERE p."companyId" = $1 AND p.status IN ('active','draft')
     ORDER BY score DESC, fits DESC LIMIT ${Math.min(limit, 50)}`,
    companyId, q, n, vehicle?.make ?? null, vehicle?.model ?? null, vehicle?.year ?? null);
  return rows.filter((r) => r.score > 0.2).map((r) => ({ ...r, score: Number(r.score), fitBoost: !!r.fits && !!(vehicle?.make) }));
}
