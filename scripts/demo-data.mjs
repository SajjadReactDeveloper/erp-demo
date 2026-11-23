// Generates demo history by driving the REAL API (request -> cash) N times, then back-dates records over the past year (scripts/demo-backdate.sql).
// Usage: node scripts/demo-data.mjs [runs=28]
import { execFileSync } from 'node:child_process';
const API = process.env.API ?? 'http://127.0.0.1:4010', PW = 'Passw0rd!2026', RUNS = Number(process.argv[2] ?? 28);
const tok = {};
async function call(who, method, path, body) {
  const r = await fetch(API + path, { method, headers: { 'content-type': 'application/json', ...(tok[who] ? { authorization: `Bearer ${tok[who]}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${j?.error?.message ?? ''}`);
  return j;
}
for (const [w, e] of [['sales', 'sales@autocquick.test'], ['purch', 'purchasing@autocquick.test'], ['s1', 'supplier@riyadhparts.test'], ['s2', 'supplier2@gulfbrakes.test'], ['s3', 'supplier3@alfursan.test'], ['wh', 'warehouse@autocquick.test'], ['drv', 'driver@autocquick.test'], ['fin', 'finance@autocquick.test'], ['gm', 'gm@autocquick.test']])
  tok[w] = (await call(w, 'POST', '/api/v1/auth/login', { email: e, password: PW })).token;

const PRICE = { '04465-06180': 140, '90915-YZZD4': 18, '17801-0V020': 46, '48157-06130': 330, '58101-F2A00': 128, '26300-35504': 21, '41060-ED025': 245, '15208-65F0C': 20, 'P83-024': 190, 'W 712/95': 24, 'C 25 114': 40, 'G8133': 285 };
const ITEMS = [['04465-06180', 'front brake pads'], ['90915-YZZD4', 'oil filter'], ['17801-0V020', 'air filter'], ['48157-06130', 'front shock absorber'], ['58101-F2A00', 'brake pads elantra'], ['26300-35504', 'oil filter hyundai'], ['41060-ED025', 'brake disc altima'], ['15208-65F0C', 'oil filter nissan']];
const customers = (await call('sales', 'GET', '/api/v1/r/customer?limit=50')).data.filter((c) => c.status === 'active');
const drv = (await call('gm', 'GET', '/api/v1/r/user?q=driver')).data[0];
let ok = 0, skipped = 0;

for (let i = 0; i < RUNS; i++) {
  const cust = customers[i % customers.length];
  const picks = [ITEMS[i % ITEMS.length], ITEMS[(i * 3 + 1) % ITEMS.length]].filter((x, j, a) => a.findIndex((y) => y[0] === x[0]) === j);
  try {
    const rq = await call('sales', 'POST', '/api/v1/r/request', { customerId: cust.id, channel: 'phone', urgency: i % 5 === 0 ? 'urgent' : 'normal', children: { RequestLine: picks.map(([pn, txt], n) => ({ lineNo: n + 1, customerText: txt, partNumberText: pn, qty: 2 + ((i * 7 + n * 5) % 14) })) } });
    await call('sales', 'POST', `/api/v1/r/request/${rq.data.id}/actions/submit`, {});
    const full = (await call('sales', 'GET', `/api/v1/r/request/${rq.data.id}`)).data;
    for (const l of full._children.RequestLine) if (l.partId) await call('sales', 'PATCH', `/api/v1/r/request-line/${l.id}`, { matchStatus: 'confirmed' });
    const rfq = await call('sales', 'POST', `/api/v1/r/request/${rq.data.id}/actions/create_rfq`, {});
    const rfqId = rfq.result.rfqId; await call('purch', 'POST', `/api/v1/r/rfq/${rfqId}/actions/send`, {});
    let quoted = 0;
    for (const [who, mult] of [['s1', 1], ['s2', 0.94 + (i % 3) * 0.04], ['s3', 1.06]]) {
      try {
        const d = await call(who, 'GET', `/api/v1/portal/supplier/rfqs/${rfqId}`);
        const lines = d.data.lines.map((l) => ({ rfqLineId: l.id, qty: l.qty, unitPrice: (((PRICE[l.partNumber] ?? 50) * mult)).toFixed(2), availability: 'in_stock', leadTimeDays: 1 + (i % 4), warranty: '12 months' }));
        const q = await call(who, 'POST', '/api/v1/r/supplier-quote', { rfqId, children: { SupplierQuoteLine: lines } });
        await call(who, 'POST', `/api/v1/r/supplier-quote/${q.data.id}/actions/submit`, {}); quoted++;
      } catch (e) { if (!/404|403/.test(e.message)) throw e; }
    }
    if (!quoted) { skipped++; continue; }
    const aw = await call('purch', 'POST', '/api/v1/r/award', { rfqId });
    await call('purch', 'POST', `/api/v1/r/award/${aw.data.id}/actions/recommend`, {}); await call('purch', 'POST', `/api/v1/r/award/${aw.data.id}/actions/confirm`, {});
    const qt = await call('sales', 'POST', '/api/v1/r/quotation', { requestId: rq.data.id, customerId: cust.id });
    await call('sales', 'POST', `/api/v1/r/quotation/${qt.data.id}/actions/build`, {});
    const qd = (await call('sales', 'GET', `/api/v1/r/quotation/${qt.data.id}`)).data;
    if (qd.minMarginBreached) { await call('sales', 'POST', `/api/v1/r/quotation/${qt.data.id}/actions/submit_margin`, {}); const inbox = await call('gm', 'GET', '/api/v1/approvals/inbox'); const a = inbox.data.find((x) => x.refId === qt.data.id); if (a) await call('gm', 'POST', `/api/v1/r/approval-request/${a.id}/actions/approve`, {}); }
    await call('sales', 'POST', `/api/v1/r/quotation/${qt.data.id}/actions/send`, { channel: i % 2 ? 'whatsapp' : 'portal' });
    const ap = await call('gm', 'POST', `/api/v1/r/quotation/${qt.data.id}/actions/approve`, {});
    if (ap.result?.held) { skipped++; continue; }
    const so = await call('sales', 'POST', `/api/v1/r/quotation/${qt.data.id}/actions/create_order`, {});
    const cf = await call('sales', 'POST', `/api/v1/r/sales-order/${so.result.salesOrderId}/actions/confirm`, {});
    if (cf.data.status === 'on_hold') { skipped++; continue; }
    const pos = await call('purch', 'POST', `/api/v1/r/sales-order/${so.result.salesOrderId}/actions/create_pos`, {});
    for (const p of pos.result.purchaseOrders) {
      const s = await call('purch', 'POST', `/api/v1/r/purchase-order/${p.id}/actions/submit`, {});
      if (s.data.status === 'pending_approval') { const inbox = await call('gm', 'GET', '/api/v1/approvals/inbox'); const a = inbox.data.find((x) => x.refId === p.id); if (a) await call('gm', 'POST', `/api/v1/r/approval-request/${a.id}/actions/approve`, {}); }
      await call('purch', 'POST', `/api/v1/r/purchase-order/${p.id}/actions/send`, {});
      const po = (await call('wh', 'GET', `/api/v1/r/purchase-order/${p.id}`)).data;
      const gr = await call('wh', 'POST', '/api/v1/r/goods-receipt', { poId: p.id, children: { GrLine: po._children.PoLine.map((l) => ({ poLineId: l.id, receivedQty: Number(l.qty), damagedQty: 0 })) } });
      await call('wh', 'POST', `/api/v1/r/goods-receipt/${gr.data.id}/actions/confirm`, {});
    }
    const pd = await call('sales', 'POST', `/api/v1/r/sales-order/${so.result.salesOrderId}/actions/plan_delivery`, {});
    const dn = pd.result.deliveryNoteId;
    await call('wh', 'POST', `/api/v1/r/delivery-note/${dn}/actions/assign`, { driverId: drv.id }); await call('drv', 'POST', `/api/v1/r/delivery-note/${dn}/actions/dispatch`, {});
    const d = (await call('drv', 'GET', `/api/v1/r/delivery-note/${dn}`)).data;
    await call('drv', 'POST', `/api/v1/r/delivery-note/${dn}/actions/deliver`, { lines: d._children.DeliveryLine.map((l) => ({ lineId: l.id, deliveredQty: Number(l.qty) })), signatureData: 'data:image/png;base64,iVBORw0KGgo=', signerName: 'Receiver', lat: 24.71, lng: 46.67 });
    // ~60% of invoices get paid by bank transfer
    if (i % 5 < 3) {
      const inv = (await call('fin', 'GET', `/api/v1/r/invoice?f.salesOrderId=${so.result.salesOrderId}`)).data[0];
      if (inv && Number(inv.balance) > 0) { const rc = await call('fin', 'POST', '/api/v1/r/receipt', { customerId: cust.id, method: 'transfer', amount: inv.balance, reference: `TRF-${1000 + i}` }); await call('fin', 'POST', `/api/v1/r/receipt/${rc.data.id}/actions/post`, {}); await call('fin', 'POST', `/api/v1/r/receipt/${rc.data.id}/actions/auto_allocate`, {}); }
    }
    ok++; process.stdout.write(`\r${ok}/${RUNS} flows`);
  } catch (e) { skipped++; console.log(`\n  run ${i + 1} skipped: ${e.message}`); }
}
console.log(`\nCompleted ${ok} flows, skipped ${skipped}. Back-dating…`);
execFileSync('docker', ['exec', '-i', 'erp-postgres', 'psql', '-U', 'erp', '-d', 'erp', '-v', 'ON_ERROR_STOP=1', '-q'], { input: (await import('node:fs')).readFileSync(new URL('./demo-backdate.sql', import.meta.url)), stdio: ['pipe', 'inherit', 'inherit'] });
console.log('Done.');
