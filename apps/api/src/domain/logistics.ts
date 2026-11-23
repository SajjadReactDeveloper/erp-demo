import { createHash } from 'node:crypto';
import { BY_KEY } from '@erp/shared';
import { Tx } from '@erp/db';
import { A, Ctx, D, H, addDays, bad, conflict, emit, forbidden, notifyRole, notifyUsers, num, sys, today } from '../core/base';
import { createRow } from '../core/crud';
import { findPart } from '../services/catalogue';
import { courier, sendMessage } from '../adapters';
import { createInvoiceFromDelivery, issueInvoice } from './finance';
import { recomputeProfile } from '../services/credit';

const WEB = process.env.WEB_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';

// ================= SCAN VERIFICATION (LOG-02, LOG-06) =================
export async function verifyScan(tx: Tx, ctx: Ctx, p: { kind: 'receive' | 'deliver' | 'count' | 'verify' | 'label'; barcode: string; qty?: number; poId?: string | null; deliveryNoteId?: string | null; poLineId?: string | null; deliveryLineId?: string | null }) {
  const hit = await findPart(tx, ctx.companyId, p.barcode, { fuzzy: 0.99 });
  const serial = !hit ? await tx.serial.findFirst({ where: { companyId: ctx.companyId, serialNo: p.barcode } }) : null;
  const partId = hit?.id ?? serial?.partId ?? null;
  if (!partId) return { partId: null, result: 'wrong_item' as const, message: 'Barcode not recognised' };
  const qty = D(p.qty ?? 1);
  if (p.kind === 'receive') {
    const lines = await tx.poLine.findMany({ where: p.poLineId ? { id: p.poLineId } : { poId: p.poId ?? '__', partId, status: { in: ['open', 'partially_received'] } } });
    const line = lines.find((l) => l.partId === partId);
    if (!line) return { partId, result: 'wrong_item' as const, message: 'This item is not on the purchase order' };
    const scanned = (await tx.scanEvent.aggregate({ where: { poLineId: line.id, kind: 'receive', result: { in: ['ok', 'over'] }, ...(p.poId ? {} : {}) }, _sum: { qty: true } }))._sum.qty ?? D(0);
    const remaining = D(line.qty).minus(D(line.receivedQty));
    const over = D(scanned).plus(qty).gt(remaining);
    return { partId, poLineId: line.id, result: over ? ('over' as const) : ('ok' as const), expected: remaining.toNumber(), scanned: D(scanned).plus(qty).toNumber(), message: over ? `More than ordered (remaining ${remaining})` : 'OK' };
  }
  if (p.kind === 'deliver') {
    const lines = await tx.deliveryLine.findMany({ where: p.deliveryLineId ? { id: p.deliveryLineId } : { deliveryNoteId: p.deliveryNoteId ?? '__', partId } });
    const line = lines.find((l) => l.partId === partId);
    if (!line) return { partId, result: 'wrong_item' as const, message: 'This item is not on the delivery note' };
    const scanned = (await tx.scanEvent.aggregate({ where: { deliveryLineId: line.id, kind: 'deliver', result: { in: ['ok', 'over'] } }, _sum: { qty: true } }))._sum.qty ?? D(0);
    const over = D(scanned).plus(qty).gt(D(line.qty));
    return { partId, deliveryLineId: line.id, result: over ? ('over' as const) : ('ok' as const), expected: num(line.qty), scanned: D(scanned).plus(qty).toNumber(), message: over ? `More than the delivery quantity (${line.qty})` : 'OK' };
  }
  return { partId, result: 'ok' as const, message: 'OK' };
}
H('ScanEvent', {
  beforeCreate: async ({ ctx, tx, data }) => {
    data.userId ??= ctx.userId; data.scannedAt ??= new Date(); data.syncedAt = new Date(); data.qty ??= 1;
    const v: any = await verifyScan(tx, ctx, { kind: data.kind, barcode: data.barcode, qty: Number(data.qty), poLineId: data.poLineId, deliveryLineId: data.deliveryLineId });
    data.partId ??= v.partId ?? undefined; data.result = v.result;
    if (v.poLineId) data.poLineId ??= v.poLineId; if (v.deliveryLineId) data.deliveryLineId ??= v.deliveryLineId;
  },
});

// ================= DELIVERY (LOG-05..07, LOG-10) =================
async function event(tx: Tx, ctx: Ctx, dnId: string, kind: string, extra: any = {}) {
  const e = await tx.deliveryEvent.create({ data: { companyId: ctx.companyId, deliveryNoteId: dnId, kind, at: extra.at ?? new Date(), lat: extra.lat, lng: extra.lng, note: extra.note, byId: ctx.userId } });
  (await import('../core/base')).bus.emit('delivery', { companyId: ctx.companyId, deliveryNoteId: dnId, kind });
  return e;
}
H('DeliveryNote', {
  beforeCreate: async ({ ctx, tx, data }) => { const so = await tx.salesOrder.findUnique({ where: { id: data.salesOrderId } }); if (!so) throw bad('Sales order not found'); data.customerId ??= so.customerId; data.addressId ??= so.deliveryAddressId ?? undefined; },
  afterCreate: ({ ctx, tx, row }) => event(tx, ctx, row.id, 'assigned', { note: 'Delivery note created' }).then(() => undefined),
});
H('DeliveryLine', { beforeCreate: ({ data }) => { if (Number(data.qty) <= 0) throw bad('Quantity must be greater than zero'); } });
A('DeliveryNote.assign', async ({ ctx, tx, row, body }) => {
  if (!body?.driverId) throw bad('Choose a driver');
  const drv = await tx.user.findFirst({ where: { id: body.driverId, companyId: ctx.companyId, isActive: true } });
  if (!drv) throw bad('Driver not found');
  const date = body.plannedDate ? new Date(body.plannedDate) : row.plannedDate ?? today();
  const seq = (await tx.deliveryNote.count({ where: { driverId: body.driverId, plannedDate: date, id: { not: row.id } } })) + 1;
  await event(tx, ctx, row.id, 'assigned', { note: `Assigned to ${drv.name}` });
  await notifyUsers(tx, ctx.companyId, [drv.id], { title: `Delivery ${row.number} assigned`, body: body.routeArea ?? row.routeArea ?? undefined, link: `/m/deliveries/${row.id}`, type: 'delivery' });
  return { status: 'assigned', set: { driverId: body.driverId, plannedDate: date, routeArea: body.routeArea ?? row.routeArea, routeSeq: seq }, message: `Assigned to ${drv.name} (stop #${seq})` };
});
A('DeliveryNote.dispatch', async ({ ctx, tx, row, body }) => {
  await event(tx, ctx, row.id, 'departed', { lat: body?.lat, lng: body?.lng });
  const cust = await tx.customer.findUnique({ where: { id: row.customerId! } });
  await sendMessage(tx, ctx.companyId, { channel: 'whatsapp', to: cust?.phone, template: 'delivery_note', lang: 'ar', vars: { number: row.number, link: `${WEB}/portal/orders/${row.salesOrderId}` } });
  const portal = await tx.user.findMany({ where: { customerId: row.customerId, kind: 'customer', isActive: true }, select: { id: true } });
  await notifyUsers(tx, ctx.companyId, portal.map((u) => u.id), { title: 'Your order is out for delivery', body: row.number, link: `/portal/orders/${row.salesOrderId}`, type: 'delivery' });
});
A('DeliveryNote.deliver', async ({ ctx, tx, row, body }) => {
  if (!body?.signerName || !body?.signatureData) throw bad('Customer name and signature are required to confirm delivery');
  const dls = await tx.deliveryLine.findMany({ where: { deliveryNoteId: row.id } });
  const input: Record<string, { deliveredQty: number; reason?: string }> = Object.fromEntries((body.lines ?? dls.map((d) => ({ lineId: d.id, deliveredQty: num(d.qty) }))).map((l: any) => [l.lineId, l]));
  let fullCount = 0, anyDelivered = false;
  for (const dl of dls) {
    const inp = input[dl.id] ?? { deliveredQty: 0 };
    const q = D(inp.deliveredQty ?? 0);
    if (q.lt(0) || q.gt(D(dl.qty))) throw bad(`Delivered quantity must be between 0 and ${dl.qty}`);
    const status = q.gte(D(dl.qty)) ? 'delivered' : q.gt(0) ? 'partial' : 'failed';
    if (status === 'delivered') fullCount++;
    if (q.gt(0)) anyDelivered = true;
    if ((status === 'partial' || status === 'failed') && !inp.reason) throw bad('Give a reason for lines that were not fully delivered');
    await tx.deliveryLine.update({ where: { id: dl.id }, data: { deliveredQty: q, status, failReason: inp.reason } });
    if (dl.salesOrderLineId && q.gt(0)) {
      const sol = (await tx.salesOrderLine.findUnique({ where: { id: dl.salesOrderLineId } }))!;
      const dQty = D(sol.deliveredQty).plus(q);
      await tx.salesOrderLine.update({ where: { id: sol.id }, data: { deliveredQty: dQty, backorderQty: D.max(D(0), D(sol.qty).minus(dQty)), status: dQty.gte(D(sol.qty)) ? 'delivered' : 'partially_delivered' } });
    }
  }
  if (!anyDelivered) throw bad('Nothing was delivered. Use "Mark failed" instead.');
  const capturedAt = body.capturedAt ? new Date(body.capturedAt) : new Date();
  const hash = createHash('sha256').update(JSON.stringify({ n: row.number, s: body.signatureData, t: capturedAt.toISOString(), g: [body.lat, body.lng] })).digest('hex');
  await tx.proofOfDelivery.create({ data: { companyId: ctx.companyId, deliveryNoteId: row.id, signatureData: body.signatureData, signerName: body.signerName, signerIdNumber: body.signerIdNumber, photoKeys: body.photoKeys ?? [], lat: body.lat, lng: body.lng, capturedAt, deviceId: body.deviceId, hash } });
  const status = fullCount === dls.length ? 'delivered' : 'partially_delivered';
  await event(tx, ctx, row.id, status === 'delivered' ? 'delivered' : 'partial', { lat: body.lat, lng: body.lng, at: capturedAt, note: `Received by ${body.signerName}` });
  const sols = await tx.salesOrderLine.findMany({ where: { salesOrderId: row.salesOrderId, status: { not: 'cancelled' } } });
  await tx.salesOrder.update({ where: { id: row.salesOrderId }, data: { status: sols.every((l) => l.status === 'delivered') ? 'delivered' : 'partially_delivered' } });
  await tx.deliveryNote.update({ where: { id: row.id }, data: { deliveredAt: capturedAt, receivedByName: body.signerName } });
  // BR-5: invoice only what was delivered, issue immediately (ZATCA)
  const inv = await createInvoiceFromDelivery(tx, ctx, row.id);
  let invResult: any = null;
  if (inv) invResult = await issueInvoice(tx, ctx, inv.id);
  if (status === 'partially_delivered') await notifyRole(tx, ctx.companyId, 'sales', { title: `Partial delivery ${row.number}`, body: 'Back-order remains open', link: `/app/sales-order/${row.salesOrderId}`, severity: 'warning', type: 'delivery' });
  await recomputeProfile(tx, ctx.companyId, row.customerId!);
  return { status, data: { invoiceId: inv?.id, invoice: invResult }, message: status === 'delivered' ? 'Delivered. Invoice issued.' : 'Partially delivered. The balance stays as a back-order.' };
});
A('DeliveryNote.fail', async ({ ctx, tx, row, body }) => {
  if (!body?.reason) throw bad('Give the reason the delivery failed');
  await tx.deliveryLine.updateMany({ where: { deliveryNoteId: row.id }, data: { status: 'failed', failReason: body.reason } });
  await event(tx, ctx, row.id, 'failed', { lat: body.lat, lng: body.lng, note: body.reason });
  await notifyRole(tx, ctx.companyId, 'sales', { title: `Delivery failed ${row.number}`, body: body.reason, link: `/app/delivery-note/${row.id}`, severity: 'critical', type: 'delivery' });
});
A('DeliveryNote.reschedule', async ({ ctx, tx, row, body }) => {
  const date = body?.plannedDate ? new Date(body.plannedDate) : addDays(today(), 1);
  await event(tx, ctx, row.id, 'rescheduled', { note: `New date ${date.toISOString().slice(0, 10)}` });
  if (row.status === 'failed') { await tx.deliveryLine.updateMany({ where: { deliveryNoteId: row.id, status: 'failed' }, data: { status: 'pending', failReason: null } }); return { set: { plannedDate: date, driverId: null }, message: 'Re-scheduled' }; }
  // partial: new note for the remainder
  const dls = await tx.deliveryLine.findMany({ where: { deliveryNoteId: row.id, status: { in: ['partial', 'failed'] } } });
  const rest = dls.map((d) => ({ salesOrderLineId: d.salesOrderLineId, partId: d.partId, qty: D(d.qty).minus(D(d.deliveredQty ?? 0)), status: 'pending' })).filter((d) => d.qty.gt(0));
  if (!rest.length) throw conflict('Nothing left to deliver');
  const dn = await createRow(tx, sys(ctx), BY_KEY.DeliveryNote, { salesOrderId: row.salesOrderId, requestId: row.requestId, customerId: row.customerId, addressId: row.addressId, status: 'planned', plannedDate: date, routeArea: row.routeArea, children: { DeliveryLine: rest } }, { trusted: true });
  await tx.deliveryNote.update({ where: { id: row.id }, data: { status: 'closed' } });
  return { skip: true, data: { deliveryNoteId: dn.id }, message: `New delivery ${dn.number} planned for the remaining quantity` };
});
A('DeliveryNote.print', async ({ row }) => ({ skip: true, data: { url: `/api/v1/docs/delivery_note/${row.id}` } }));
A('Device.revoke', async ({ ctx, tx, row }) => { await notifyUsers(tx, ctx.companyId, [row.userId].filter(Boolean), { title: 'Your device was revoked', severity: 'critical' }); });

// ================= COURIER (LOG-11) =================
A('Shipment.book', async ({ ctx, tx, row, body }) => {
  const r = await courier.book(tx, ctx.companyId, row.courier, { deliveryNoteId: row.deliveryNoteId });
  return { set: { trackingNo: r.trackingNo, labelUrl: r.labelUrl, events: [{ at: new Date().toISOString(), status: 'booked' }] }, message: `Booked: ${r.trackingNo}` };
});
A('Shipment.track', async ({ ctx, tx, row }) => {
  const r = await courier.track(tx, ctx.companyId, row.courier, row.trackingNo ?? '', row.createdAt);
  if (r.status === 'delivered' && row.deliveryNoteId) await tx.deliveryEvent.create({ data: { companyId: ctx.companyId, deliveryNoteId: row.deliveryNoteId, kind: 'delivered', note: `Courier ${row.courier} delivered`, at: new Date() } });
  return { status: r.status, set: { events: r.events }, message: `Status: ${r.status}` };
});
H('Shipment', { beforeCreate: async ({ tx, data }) => { if (data.deliveryNoteId) { const d = await tx.deliveryNote.findUnique({ where: { id: data.deliveryNoteId } }); if (!d) throw bad('Delivery note not found'); } } });
void forbidden; void emit;
