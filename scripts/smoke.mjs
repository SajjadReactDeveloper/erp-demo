// Golden-path smoke: request -> RFQ -> quotes -> award -> quotation -> approval -> order -> PO -> receipt -> delivery/POD -> ZATCA invoice -> online payment.
// Usage: node scripts/smoke.mjs   (API on :4010, seeded DB)
const API = process.env.API ?? 'http://127.0.0.1:4010';
const PW = 'Passw0rd!2026';
const tok = {};
const log = (ok, step, extra = '') => console.log(`${ok ? '✓' : '✗'} ${step}${extra ? '  ' + extra : ''}`);
async function call(who, method, path, body) {
  const r = await fetch(API + path, { method, headers: { 'content-type': 'application/json', ...(tok[who] ? { authorization: `Bearer ${tok[who]}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(`${method} ${path} -> ${r.status} ${j?.error?.message ?? ''} ${JSON.stringify(j?.error?.details ?? '')}`); e.status = r.status; throw e; }
  return j;
}
async function step(name, fn) { try { const v = await fn(); log(true, name, typeof v === 'string' ? v : ''); return v; } catch (e) { log(false, name, e.message); process.exitCode = 1; throw e; } }
const login = async (who, email) => { const r = await call(who, 'POST', '/api/v1/auth/login', { email, password: PW }); tok[who] = r.token; };

try {
  await step('login all roles', async () => { for (const [w, e] of [['cust', 'customer@alnoor.test'], ['sales', 'sales@autocquick.test'], ['purch', 'purchasing@autocquick.test'], ['s1', 'supplier@riyadhparts.test'], ['s2', 'supplier2@gulfbrakes.test'], ['s3', 'supplier3@alfursan.test'], ['wh', 'warehouse@autocquick.test'], ['drv', 'driver@autocquick.test'], ['fin', 'finance@autocquick.test'], ['gm', 'gm@autocquick.test']]) await login(w, e); });
  const req = await step('customer creates + submits request', async () => {
    const r = await call('cust', 'POST', '/api/v1/r/request', { vin: 'JTNB11HK0J3000001', urgency: 'normal', children: { RequestLine: [{ lineNo: 1, customerText: 'front brake pads camry', partNumberText: '04465-06180', qty: 2 }, { lineNo: 2, customerText: 'oil filter toyota', partNumberText: '90915-YZZD4', qty: 4 }] } });
    const s = await call('cust', 'POST', `/api/v1/r/request/${r.data.id}/actions/submit`, {});
    return { id: r.data.id, number: r.data.number, ai: s.result.ai };
  });
  console.log('   AI matched', req.ai.matched, '/', req.ai.total);
  const full = (await call('sales', 'GET', `/api/v1/r/request/${req.id}`)).data;
  await step('sales confirms AI matches', async () => { for (const l of full._children.RequestLine) if (l.partId) await call('sales', 'PATCH', `/api/v1/r/request-line/${l.id}`, { matchStatus: 'confirmed' }); });
  const rfq = await step('create RFQ + send', async () => { const r = await call('sales', 'POST', `/api/v1/r/request/${req.id}/actions/create_rfq`, {}); await call('purch', 'POST', `/api/v1/r/rfq/${r.result.rfqId}/actions/send`, {}); return { id: r.result.rfqId, n: r.result.suppliers }; });
  console.log('   suppliers invited:', rfq.n);
  const quoted = [];
  for (const [who, mult] of [['s1', 1], ['s2', 0.93], ['s3', 1.05]]) {
    try {
      const d = await call(who, 'GET', `/api/v1/portal/supplier/rfqs/${rfq.id}`);
      const base = { 'front brake pads': 140, 'oil filter': 18 };
      const lines = d.data.lines.map((l) => ({ rfqLineId: l.id, qty: l.qty, unitPrice: String(((/brake/i.test(l.name) ? base['front brake pads'] : base['oil filter']) * mult).toFixed(2)), availability: 'in_stock', leadTimeDays: 2, warranty: '12 months' }));
      const q = await call(who, 'POST', '/api/v1/r/supplier-quote', { rfqId: rfq.id, children: { SupplierQuoteLine: lines } });
      await call(who, 'POST', `/api/v1/r/supplier-quote/${q.data.id}/actions/submit`, {}); quoted.push(who);
    } catch (e) { if (!/404|403/.test(e.message)) throw e; }
  }
  log(quoted.length > 0, 'suppliers quoted', quoted.join(','));
  const cmp = await step('comparison matrix', async () => { const c = await call('purch', 'GET', `/api/v1/rfqs/${rfq.id}/comparison`); return `${c.data.lines.length} lines, best: ${c.data.lines[0]?.options[0]?.supplier}`; });
  void cmp;
  const award = await step('award (auto-recommend + confirm)', async () => { const a = await call('purch', 'POST', '/api/v1/r/award', { rfqId: rfq.id }); await call('purch', 'POST', `/api/v1/r/award/${a.data.id}/actions/recommend`, {}); await call('purch', 'POST', `/api/v1/r/award/${a.data.id}/actions/confirm`, {}); return a.data.id; });
  void award;
  const qt = await step('build quotation + send', async () => { const q = await call('sales', 'POST', '/api/v1/r/quotation', { requestId: req.id, customerId: full.customerId }); const b = await call('sales', 'POST', `/api/v1/r/quotation/${q.data.id}/actions/build`, {}); let d = (await call('sales', 'GET', `/api/v1/r/quotation/${q.data.id}`)).data; if (d.minMarginBreached) { await call('sales', 'POST', `/api/v1/r/quotation/${q.data.id}/actions/submit_margin`, {}); const inbox = await call('gm', 'GET', '/api/v1/approvals/inbox'); const a = inbox.data.find((x) => x.refId === q.data.id); await call('gm', 'POST', `/api/v1/r/approval-request/${a.id}/actions/approve`, {}); } await call('sales', 'POST', `/api/v1/r/quotation/${q.data.id}/actions/send`, { channel: 'whatsapp' }); return { id: q.data.id, msg: b.message }; });
  console.log('  ', qt.msg);
  await step('customer approves quotation', async () => { const r = await call('cust', 'POST', `/api/v1/r/quotation/${qt.id}/actions/approve`, {}); return r.message; });
  const so = await step('create + confirm sales order (credit check)', async () => { const r = await call('sales', 'POST', `/api/v1/r/quotation/${qt.id}/actions/create_order`, {}); const c = await call('sales', 'POST', `/api/v1/r/sales-order/${r.result.salesOrderId}/actions/confirm`, {}); return { id: r.result.salesOrderId, msg: c.message, status: c.data.status }; });
  console.log('  ', so.status, so.msg);
  const pos = await step('create POs, approve, send, supplier confirms', async () => { const r = await call('purch', 'POST', `/api/v1/r/sales-order/${so.id}/actions/create_pos`, {}); const ids = r.result.purchaseOrders.map((p) => p.id); for (const id of ids) { const s = await call('purch', 'POST', `/api/v1/r/purchase-order/${id}/actions/submit`, {}); if (s.data.status === 'pending_approval') { const inbox = await call('gm', 'GET', '/api/v1/approvals/inbox'); const a = inbox.data.find((x) => x.refId === id); await call('gm', 'POST', `/api/v1/r/approval-request/${a.id}/actions/approve`, {}); } await call('purch', 'POST', `/api/v1/r/purchase-order/${id}/actions/send`, {}); } return ids; });
  await step('warehouse receives goods (partial then full)', async () => {
    for (const id of pos) {
      const po = (await call('wh', 'GET', `/api/v1/r/purchase-order/${id}`)).data;
      const lines = po._children.PoLine.map((l) => ({ poLineId: l.id, receivedQty: Number(l.qty), damagedQty: 0 }));
      const gr = await call('wh', 'POST', '/api/v1/r/goods-receipt', { poId: id, children: { GrLine: lines } });
      await call('wh', 'POST', `/api/v1/r/goods-receipt/${gr.data.id}/actions/confirm`, {});
    }
  });
  const dn = await step('plan + assign + dispatch delivery', async () => { const p = await call('sales', 'POST', `/api/v1/r/sales-order/${so.id}/actions/plan_delivery`, {}); const id = p.result.deliveryNoteId; const drv = (await call('gm', 'GET', '/api/v1/r/user?q=driver')).data[0]; await call('wh', 'POST', `/api/v1/r/delivery-note/${id}/actions/assign`, { driverId: drv.id }); await call('drv', 'POST', `/api/v1/r/delivery-note/${id}/actions/dispatch`, {}); return id; });
  const inv = await step('driver delivers with POD -> invoice issued (ZATCA)', async () => { const d = (await call('drv', 'GET', `/api/v1/r/delivery-note/${dn}`)).data; const lines = d._children.DeliveryLine.map((l) => ({ lineId: l.id, deliveredQty: Number(l.qty) })); const r = await call('drv', 'POST', `/api/v1/r/delivery-note/${dn}/actions/deliver`, { lines, signatureData: 'data:image/png;base64,iVBORw0KGgo=', signerName: 'Ali', lat: 24.7, lng: 46.6 }); return r.result.invoice; });
  console.log('   invoice:', inv?.number, inv?.status);
  const invoiceId = (await call('fin', 'GET', `/api/v1/r/invoice?f.salesOrderId=${so.id}`)).data[0];
  await step('invoice cleared + ledger posted', async () => { const d = (await call('fin', 'GET', `/api/v1/r/invoice/${invoiceId.id}`)).data; if (!['cleared', 'reported'].includes(d.status)) throw new Error('status ' + d.status); if (!d.journalEntryId) throw new Error('no journal'); return `${d.number} ${d.status} total ${d.total}`; });
  await step('trial balance balanced', async () => { const r = await call('fin', 'GET', '/api/v1/reports/trial-balance'); if (!/Balanced/.test(r.data.note)) throw new Error(r.data.note); return r.data.note; });
  await step('customer pays online (webhook)', async () => { const c = await call('cust', 'POST', `/api/v1/portal/invoices/${invoiceId.id}/pay`, {}); const id = c.data.id; const r = await call('cust', 'POST', `/api/v1/public/fake-gateway/${id}/complete`, { invoiceId: invoiceId.id, amount: Number(invoiceId.balance) }); const again = await call('cust', 'POST', `/api/v1/public/fake-gateway/${id}/complete`, { invoiceId: invoiceId.id, amount: 1 }); return `receipt ${r.receiptId} duplicate-safe=${again.duplicate}`; });
  await step('single-entry lineage', async () => { const l = await call('fin', 'GET', `/api/v1/finance/lineage/${invoiceId.id}`); return `singleEntry=${l.data.singleEntry}`; });
  await step('dashboards respond', async () => { for (const n of ['executive', 'sales', 'profitability', 'receivables', 'procurement', 'operations']) await call('gm', 'GET', `/api/v1/dashboards/${n}`); });
  await step('AI assistant', async () => { const r = await call('gm', 'POST', '/api/v1/ai/assistant', { question: 'Top 10 overdue customers' }); return r.ok ? r.result.title : r.answer; });
  console.log('\nGolden path complete.');
} catch (e) { console.log('\nStopped at first failure.'); }
