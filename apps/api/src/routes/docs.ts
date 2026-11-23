import type { FastifyInstance } from 'fastify';
import QRCode from 'qrcode';
import { prisma } from '@erp/db';
import { BY_KEY } from '@erp/shared';
import { Ctx, bad, delegateOf, notFound, num } from '../core/base';
import { authenticate } from '../core/auth-plugin';
import { authorize, scopeWhere } from '../core/crud';
import { customerStatement } from './reports';

const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const money = (n: any) => num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const L = {
  ar: { quotation: 'عرض سعر', purchase_order: 'أمر شراء', delivery_note: 'إشعار تسليم', invoice: 'فاتورة ضريبية', simplified: 'فاتورة ضريبية مبسطة', credit_note: 'إشعار دائن', statement: 'كشف حساب', receipt: 'سند قبض', no: 'الرقم', date: 'التاريخ', customer: 'العميل', supplier: 'المورد', vat: 'الرقم الضريبي', part: 'الصنف', qty: 'الكمية', price: 'السعر', total: 'الإجمالي', subtotal: 'المجموع قبل الضريبة', tax: 'ضريبة القيمة المضافة 15%', grand: 'الإجمالي شامل الضريبة', valid: 'صالح حتى', due: 'تاريخ الاستحقاق', lead: 'التوريد (أيام)', warranty: 'الضمان', sign: 'توقيع المستلم', notes: 'ملاحظات', print: 'طباعة / حفظ PDF', margin: 'العنوان', received: 'المستلم', delivered: 'المسلّم', alt: 'بديل', original: 'الفاتورة الأصلية', cr: 'سجل تجاري', balance: 'الرصيد', debit: 'مدين', credit: 'دائن', doc: 'المستند', type: 'النوع', method: 'طريقة الدفع', amount: 'المبلغ' },
  en: { quotation: 'Quotation', purchase_order: 'Purchase order', delivery_note: 'Delivery note', invoice: 'Tax invoice', simplified: 'Simplified tax invoice', credit_note: 'Credit note', statement: 'Statement of account', receipt: 'Receipt voucher', no: 'No.', date: 'Date', customer: 'Customer', supplier: 'Supplier', vat: 'VAT no.', part: 'Item', qty: 'Qty', price: 'Unit price', total: 'Total', subtotal: 'Subtotal', tax: 'VAT 15%', grand: 'Total incl. VAT', valid: 'Valid until', due: 'Due date', lead: 'Lead (days)', warranty: 'Warranty', sign: 'Receiver signature', notes: 'Notes', print: 'Print / Save PDF', margin: 'Address', received: 'Received', delivered: 'Delivered', alt: 'Alternative', original: 'Original invoice', cr: 'CR', balance: 'Balance', debit: 'Debit', credit: 'Credit', doc: 'Document', type: 'Type', method: 'Method', amount: 'Amount' },
};
type T = typeof L.en;

function page(title: string, body: string, lang: 'ar' | 'en', color = '#0f766e') {
  return `<!doctype html><html lang="${lang}" dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>:root{--c:${color}}*{box-sizing:border-box}body{font-family:"Segoe UI",Tahoma,Arial,sans-serif;color:#111827;margin:0;background:#f3f4f6}.sheet{max-width:820px;margin:16px auto;background:#fff;padding:32px;border-radius:8px;box-shadow:0 1px 4px #0002}
header{display:flex;justify-content:space-between;gap:16px;border-bottom:3px solid var(--c);padding-bottom:12px;margin-bottom:16px}h1{margin:0;font-size:22px;color:var(--c)}h2{font-size:15px;margin:0 0 4px}.muted{color:#6b7280;font-size:12px}
table{width:100%;border-collapse:collapse;margin:12px 0}th{background:var(--c);color:#fff;font-size:12px;text-align:start;padding:7px}td{border-bottom:1px solid #e5e7eb;padding:7px;font-size:13px;vertical-align:top}td.n,th.n{text-align:end;font-variant-numeric:tabular-nums}
.meta{display:grid;grid-template-columns:1fr 1fr;gap:16px}.tot{margin-inline-start:auto;width:300px}.tot td{border:0;padding:4px 7px}.tot tr:last-child td{font-weight:700;border-top:2px solid var(--c);font-size:15px}.qr{text-align:center}.sig{height:70px;border:1px dashed #9ca3af;border-radius:6px;display:flex;align-items:center;justify-content:center}.sig img{max-height:64px}
.btn{position:fixed;inset-block-start:12px;inset-inline-end:12px;background:var(--c);color:#fff;border:0;padding:10px 16px;border-radius:8px;font-size:14px;cursor:pointer}.alt{color:#6b7280;font-style:italic}@media print{body{background:#fff}.sheet{box-shadow:none;margin:0;max-width:none}.btn{display:none}}</style></head><body><button class="btn" onclick="print()">🖨</button><div class="sheet">${body}</div></body></html>`;
}
async function head(companyId: string, title: string, number: string, date: any, t: T) {
  const c = (await prisma.company.findUnique({ where: { id: companyId } }))!;
  return { company: c, html: `<header><div><h1>${esc(title)}</h1><div class="muted">${esc(t.no)}: <b>${esc(number || '—')}</b> · ${esc(t.date)}: ${date ? new Date(date).toISOString().slice(0, 10) : ''}</div></div><div style="text-align:end"><h2>${esc(c.name)}${c.nameAr ? ' · ' + esc(c.nameAr) : ''}</h2><div class="muted">${esc(t.vat)}: ${esc(c.vatNumber)} · ${esc(t.cr)}: ${esc(c.crNumber)}<br>${esc(c.address)} ${esc(c.phone)}</div></div></header>` };
}
const linesTable = (t: T, cols: string[], rows: string[][], numCols: number[] = []) => `<table><thead><tr>${cols.map((c, i) => `<th class="${numCols.includes(i) ? 'n' : ''}">${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((x, i) => `<td class="${numCols.includes(i) ? 'n' : ''}">${x}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const totals = (t: T, sub: any, vat: any, total: any) => `<table class="tot"><tr><td>${esc(t.subtotal)}</td><td class="n">${money(sub)}</td></tr><tr><td>${esc(t.tax)}</td><td class="n">${money(vat)}</td></tr><tr><td>${esc(t.grand)}</td><td class="n">${money(total)} SAR</td></tr></table>`;

async function applyTemplate(companyId: string, docType: string, lang: string, html: string) {
  const tpl = await prisma.template.findFirst({ where: { companyId, docType, language: lang, isDefault: true } });
  if (!tpl || tpl.body.trim() === '{{default}}') return html;
  return tpl.body.replace('{{default}}', html).replace(/\{\{content\}\}/g, html);
}

export function registerDocRoutes(app: FastifyInstance) {
  app.get('/api/v1/docs/:type/:id', { preHandler: authenticate, config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req: any, reply) => {
    const ctx: Ctx = req.ctx; const { type, id } = req.params; const lang: 'ar' | 'en' = (req.query as any).lang === 'en' ? 'en' : (req.query as any).lang === 'ar' ? 'ar' : ctx.locale;
    const t: T = L[lang];
    const get = async (key: string, include?: any) => { const res = BY_KEY[key]; authorize(ctx, res, 'read'); const r = await delegateOf(prisma, key).findFirst({ where: { id, ...scopeWhere(res, ctx) }, include }); if (!r) throw notFound(res.en); return r; };
    let html = '';
    if (type === 'quotation') {
      const q: any = await get('Quotation'); const cu = await prisma.customer.findUnique({ where: { id: q.customerId } });
      const ls = await prisma.quotationLine.findMany({ where: { quotationId: id }, include: { part: true }, orderBy: { createdAt: 'asc' } });
      const h = await head(ctx.companyId, t.quotation, q.number, q.createdAt, t);
      const rows = ls.map((l) => [`${l.isAlternative ? `<span class="alt">↳ ${esc(t.alt)}: </span>` : ''}${esc(l.part?.partNumber)} — ${esc(lang === 'ar' && l.part?.nameAr ? l.part.nameAr : l.part?.name)}`, money(l.qty), money(l.unitPrice), `${num(l.leadTimeDays)}`, esc(l.warranty ?? ''), l.isAlternative ? '—' : money(l.lineTotal)]);
      html = h.html + `<div class="meta"><div><h2>${esc(t.customer)}</h2>${esc(cu?.name)}<br><span class="muted">${esc(t.vat)}: ${esc(cu?.vatNumber)}</span></div><div><h2>${esc(t.valid)}</h2>${q.validUntil ? new Date(q.validUntil).toISOString().slice(0, 10) : ''}</div></div>` + linesTable(t, [t.part, t.qty, t.price, t.lead, t.warranty, t.total], rows, [1, 2, 3, 5]) + totals(t, q.subtotal, q.vatAmount, q.total) + (q.notes ? `<p class="muted">${esc(t.notes)}: ${esc(q.notes)}</p>` : '');
    } else if (type === 'purchase_order') {
      const po: any = await get('PurchaseOrder'); const s = await prisma.supplier.findUnique({ where: { id: po.supplierId } });
      const ls = await prisma.poLine.findMany({ where: { poId: id }, include: { part: true } });
      const h = await head(ctx.companyId, t.purchase_order, po.number, po.orderDate, t);
      html = h.html + `<div class="meta"><div><h2>${esc(t.supplier)}</h2>${esc(s?.name)}<br><span class="muted">${esc(t.vat)}: ${esc(s?.vatNumber)}</span></div><div><h2>${esc(t.due)}</h2>${po.expectedDate ? new Date(po.expectedDate).toISOString().slice(0, 10) : ''}</div></div>` + linesTable(t, [t.part, t.qty, t.price, t.total], ls.map((l) => [`${esc(l.part?.partNumber)} — ${esc(l.part?.name)}`, money(l.qty), money(l.unitCost), money(l.lineTotal)]), [1, 2, 3]) + totals(t, po.subtotal, po.vatAmount, po.total);
    } else if (type === 'delivery_note') {
      const dn: any = await get('DeliveryNote'); const cu = await prisma.customer.findUnique({ where: { id: dn.customerId } });
      const addr = dn.addressId ? await prisma.customerAddress.findUnique({ where: { id: dn.addressId } }) : null;
      const ls = await prisma.deliveryLine.findMany({ where: { deliveryNoteId: id }, include: { part: true } });
      const pod = await prisma.proofOfDelivery.findFirst({ where: { deliveryNoteId: id }, orderBy: { createdAt: 'desc' } });
      const h = await head(ctx.companyId, t.delivery_note, dn.number, dn.plannedDate, t);
      html = h.html + `<div class="meta"><div><h2>${esc(t.customer)}</h2>${esc(cu?.name)}<br><span class="muted">${esc(addr?.line1)} ${esc(addr?.city)}</span></div><div><h2>${esc(t.margin)}</h2>${esc(dn.routeArea ?? '')}</div></div>` + linesTable(t, [t.part, t.qty, t.delivered], ls.map((l) => [`${esc(l.part?.partNumber)} — ${esc(l.part?.name)}`, money(l.qty), money(l.deliveredQty)]), [1, 2]) + `<div class="meta"><div><h2>${esc(t.sign)}</h2><div class="sig">${pod?.signatureData ? `<img src="${esc(pod.signatureData)}" alt="signature">` : ''}</div><div class="muted">${esc(pod?.signerName ?? '')} ${pod?.capturedAt ? new Date(pod.capturedAt).toISOString().slice(0, 16).replace('T', ' ') : ''}</div></div><div class="qr">${await QRCode.toString(dn.number ?? id, { type: 'svg', margin: 0, width: 90 })}</div></div>`;
    } else if (type === 'invoice') {
      const inv: any = await get('Invoice'); const cu = inv.customerId ? await prisma.customer.findUnique({ where: { id: inv.customerId } }) : null;
      const ls = await prisma.invoiceLine.findMany({ where: { invoiceId: id }, orderBy: { createdAt: 'asc' } });
      const orig = inv.originalInvoiceId ? await prisma.invoice.findUnique({ where: { id: inv.originalInvoiceId } }) : null;
      const title = inv.invoiceType === 'credit_note' ? t.credit_note : inv.invoiceType === 'simplified' ? t.simplified : t.invoice;
      const h = await head(ctx.companyId, title, inv.number ?? 'DRAFT', inv.issueDate, t);
      const qr = inv.zatcaQr ? await QRCode.toString(inv.zatcaQr, { type: 'svg', margin: 0, width: 110 }) : '';
      html = h.html + `<div class="meta"><div><h2>${esc(t.customer)}</h2>${esc(cu?.name ?? 'Cash customer')}<br><span class="muted">${esc(t.vat)}: ${esc(cu?.vatNumber)}</span>${orig ? `<br><span class="muted">${esc(t.original)}: ${esc(orig.number)}</span>` : ''}</div><div><h2>${esc(t.due)}</h2>${inv.dueDate ? new Date(inv.dueDate).toISOString().slice(0, 10) : ''}<br><span class="muted">ZATCA: ${esc(inv.zatcaStatus ?? '—')}</span></div></div>` + linesTable(t, [t.part, t.qty, t.price, t.tax, t.total], ls.map((l) => [esc(l.description), money(l.qty), money(l.unitPrice), money(l.vatAmount), money(l.lineTotal)]), [1, 2, 3, 4]) + totals(t, inv.subtotal, inv.vatAmount, inv.total) + `<div class="qr">${qr}</div>`;
    } else if (type === 'receipt') {
      const rc: any = await get('Receipt'); const cu = await prisma.customer.findUnique({ where: { id: rc.customerId } });
      const al = await prisma.receiptAllocation.findMany({ where: { receiptId: id }, include: { invoice: true } });
      const h = await head(ctx.companyId, t.receipt, rc.number, rc.receiptDate, t);
      html = h.html + `<div class="meta"><div><h2>${esc(t.customer)}</h2>${esc(cu?.name)}</div><div><h2>${esc(t.method)}</h2>${esc(rc.method)} ${esc(rc.reference ?? '')}</div></div><h2>${esc(t.amount)}: ${money(rc.amount)} SAR</h2>` + linesTable(t, [t.doc, t.amount], al.map((a) => [esc(a.invoice?.number), money(a.amount)]), [1]);
    } else if (type === 'statement') {
      const cust = await prisma.customer.findFirst({ where: { id, companyId: ctx.companyId, ...(ctx.kind === 'customer' ? { id: ctx.customerId! } : {}) } });
      if (!cust) throw notFound('Customer'); if (ctx.kind === 'staff') authorize(ctx, BY_KEY.CreditProfile, 'read'); if (ctx.kind === 'supplier') throw bad('Not available');
      const st = await customerStatement(ctx.companyId, cust, req.query);
      const h = await head(ctx.companyId, t.statement, cust.code ?? '', new Date(), t);
      html = h.html + `<h2>${esc(cust.name)}</h2>` + linesTable(t, [t.date, t.doc, t.type, t.due, t.debit, t.credit, t.balance], st.rows.map((r: any) => [r.date, esc(r.ref ?? ''), esc(r.type), r.due ?? '', r.debit ? money(r.debit) : '', r.credit ? money(r.credit) : '', money(r.balance)]), [4, 5, 6]) + `<h2>${esc(t.balance)}: ${money(st.closing)} SAR</h2>`;
    } else if (type === 'label') {
      const sub = (req.query as any).kind ?? 'part';
      const rows: { l1: string; l2: string; code: string }[] = [];
      if (sub === 'part') { const p = await prisma.part.findFirst({ where: { id, companyId: ctx.companyId } }); if (!p) throw notFound('Part'); for (let i = 0; i < Math.min(50, Number((req.query as any).qty) || 1); i++) rows.push({ l1: p.partNumber, l2: p.name, code: p.partNumber }); }
      else if (sub === 'delivery_note') { const d = await prisma.deliveryNote.findFirst({ where: { id, companyId: ctx.companyId } }); if (!d) throw notFound('Delivery note'); rows.push({ l1: d.number ?? '', l2: d.routeArea ?? '', code: d.number ?? id }); }
      else throw bad('Unknown label kind');
      const qrs = await Promise.all(rows.map((r) => QRCode.toString(r.code, { type: 'svg', margin: 0, width: 80 })));
      return reply.header('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html><meta charset="utf-8"><title>Labels</title><style>@page{size:58mm auto;margin:2mm}body{font-family:Arial;margin:0}.l{width:54mm;padding:2mm;page-break-after:always;text-align:center}b{font-size:13px}div{font-size:11px}</style>${rows.map((r, i) => `<div class="l"><b>${esc(r.l1)}</b><div>${esc(r.l2)}</div>${qrs[i]}</div>`).join('')}<script>print()</script>`);
    } else throw notFound('Document type');
    html = await applyTemplate(ctx.companyId, type, lang, html);
    reply.header('Content-Type', 'text/html; charset=utf-8').header('X-Content-Type-Options', 'nosniff');
    return reply.send(page(`${type} ${id.slice(0, 8)}`, html, lang));
  });
}
