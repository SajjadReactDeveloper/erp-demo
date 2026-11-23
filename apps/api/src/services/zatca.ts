// ZATCA Phase 2 (Fatoora): UBL 2.1 XML, SHA-256 hash chain (ICV/PIH), ECDSA signature, TLV QR, clearance/reporting.
// Mode 'fake' (default) simulates the ZATCA API but builds real structures; 'live' posts to ZATCA with the production CSID.
import { createHash, createSign, generateKeyPairSync, createPublicKey, randomUUID } from 'node:crypto';
import { prisma, Tx } from '@erp/db';
import { Ctx, HttpError, getSetting, num } from '../core/base';
import { sendMessage } from '../adapters';

const esc = (s: any) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
const f2 = (n: any) => num(n).toFixed(2);
const tlv = (tag: number, val: string | Buffer) => { const b = Buffer.isBuffer(val) ? val : Buffer.from(val, 'utf8'); return Buffer.concat([Buffer.from([tag, b.length]), b]); };
export const FIRST_PIH = Buffer.from('0').toString('base64'); // ZATCA seed: base64(sha256("0")) in production; kept as constant for the chain start

export async function ensureCredential(tx: Tx, companyId: string, branchId?: string | null) {
  let cred = await tx.zatcaCredential.findFirst({ where: { companyId, ...(branchId ? { branchId } : {}) }, orderBy: { createdAt: 'asc' } });
  if (!cred) cred = await tx.zatcaCredential.findFirst({ where: { companyId } });
  if (!cred) throw new HttpError(409, 'no_zatca_credential', 'No ZATCA EGS unit is configured. Create one under Finance → ZATCA credentials.');
  if (!cred.privateKey) {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
    cred = await tx.zatcaCredential.update({ where: { id: cred.id }, data: { privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string, certificate: publicKey.export({ type: 'spki', format: 'pem' }) as string, csr: `-- simulated CSR for ${cred.egsName} (replace with ZATCA onboarding) --`, status: cred.status === 'pending' ? 'compliance' : cred.status } });
  }
  return cred;
}

export function buildUbl(p: { invoice: any; lines: any[]; seller: any; buyer: any; uuid: string; icv: number; pih: string; typeCode: '388' | '381' | '383'; simplified: boolean; originalNumber?: string }) {
  const { invoice: inv, lines, seller, buyer } = p;
  const date = (inv.issueDate ?? new Date()).toISOString().slice(0, 10);
  const time = new Date().toISOString().slice(11, 19);
  const sub = lines.reduce((s, l) => s + num(l.lineTotal) - num(l.vatAmount), 0);
  const vat = lines.reduce((s, l) => s + num(l.vatAmount), 0);
  const party = (x: any, tag: string) => `<cac:${tag}><cac:Party><cac:PartyIdentification><cbc:ID schemeID="${x.schemeId ?? 'CRN'}">${esc(x.cr ?? '')}</cbc:ID></cac:PartyIdentification><cac:PostalAddress><cbc:StreetName>${esc(x.address ?? '-')}</cbc:StreetName><cbc:CityName>${esc(x.city ?? '-')}</cbc:CityName><cac:Country><cbc:IdentificationCode>SA</cbc:IdentificationCode></cac:Country></cac:PostalAddress><cac:PartyTaxScheme><cbc:CompanyID>${esc(x.vat ?? '')}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme><cac:PartyLegalEntity><cbc:RegistrationName>${esc(x.name)}</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:${tag}>`;
  const lineXml = lines.map((l, i) => `<cac:InvoiceLine><cbc:ID>${i + 1}</cbc:ID><cbc:InvoicedQuantity unitCode="PCE">${num(l.qty).toFixed(4)}</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="SAR">${f2(num(l.lineTotal) - num(l.vatAmount))}</cbc:LineExtensionAmount><cac:TaxTotal><cbc:TaxAmount currencyID="SAR">${f2(l.vatAmount)}</cbc:TaxAmount><cbc:RoundingAmount currencyID="SAR">${f2(num(l.lineTotal))}</cbc:RoundingAmount></cac:TaxTotal><cac:Item><cbc:Name>${esc(l.description)}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>${num(l.vatPct) > 0 ? 'S' : 'Z'}</cbc:ID><cbc:Percent>${num(l.vatPct).toFixed(2)}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount currencyID="SAR">${num(l.unitPrice).toFixed(4)}</cbc:PriceAmount></cac:Price></cac:InvoiceLine>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"><cbc:ProfileID>reporting:1.0</cbc:ProfileID><cbc:ID>${esc(inv.number)}</cbc:ID><cbc:UUID>${p.uuid}</cbc:UUID><cbc:IssueDate>${date}</cbc:IssueDate><cbc:IssueTime>${time}</cbc:IssueTime><cbc:InvoiceTypeCode name="${p.simplified ? '0200000' : '0100000'}">${p.typeCode}</cbc:InvoiceTypeCode><cbc:DocumentCurrencyCode>SAR</cbc:DocumentCurrencyCode><cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>${p.originalNumber ? `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${esc(p.originalNumber)}</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>` : ''}<cac:AdditionalDocumentReference><cbc:ID>ICV</cbc:ID><cbc:UUID>${p.icv}</cbc:UUID></cac:AdditionalDocumentReference><cac:AdditionalDocumentReference><cbc:ID>PIH</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${p.pih}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>${party(seller, 'AccountingSupplierParty')}${party(buyer, 'AccountingCustomerParty')}<cac:PaymentMeans><cbc:PaymentMeansCode>30</cbc:PaymentMeansCode></cac:PaymentMeans><cac:TaxTotal><cbc:TaxAmount currencyID="SAR">${f2(vat)}</cbc:TaxAmount></cac:TaxTotal><cac:TaxTotal><cbc:TaxAmount currencyID="SAR">${f2(vat)}</cbc:TaxAmount><cac:TaxSubtotal><cbc:TaxableAmount currencyID="SAR">${f2(sub)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="SAR">${f2(vat)}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>15.00</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal><cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="SAR">${f2(sub)}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="SAR">${f2(sub)}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="SAR">${f2(sub + vat)}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="SAR">${f2(sub + vat)}</cbc:PayableAmount></cac:LegalMonetaryTotal>${lineXml}</Invoice>`;
}

export function signAndQr(xml: string, cred: any, p: { sellerName: string; vat: string; total: any; vatTotal: any }) {
  const hash = createHash('sha256').update(xml).digest('base64');
  const signer = createSign('sha256');
  signer.update(Buffer.from(hash, 'base64'));
  const signature = signer.sign(cred.privateKey).toString('base64');
  const pub = createPublicKey(cred.privateKey).export({ type: 'spki', format: 'der' }) as Buffer;
  const qr = Buffer.concat([tlv(1, p.sellerName), tlv(2, p.vat), tlv(3, new Date().toISOString()), tlv(4, f2(p.total)), tlv(5, f2(p.vatTotal)), tlv(6, hash), tlv(7, signature), tlv(8, pub)]).toString('base64');
  return { hash, signature, qr };
}

const validVat = (v?: string | null) => !!v && /^3\d{13}3$/.test(v);

/** Build + sign + submit. Called from Invoice.issue inside the issuing transaction (fake mode). Live mode is queued for the worker. */
export async function processInvoiceForZatca(tx: Tx, ctx: Ctx, invoiceId: string) {
  const inv = await tx.invoice.findFirst({ where: { id: invoiceId, companyId: ctx.companyId } });
  if (!inv) throw new HttpError(404, 'not_found', 'Invoice not found');
  const lines = await tx.invoiceLine.findMany({ where: { invoiceId }, orderBy: { createdAt: 'asc' } });
  const company = await tx.company.findUnique({ where: { id: ctx.companyId } });
  const customer = inv.customerId ? await tx.customer.findUnique({ where: { id: inv.customerId } }) : null;
  const cred = await ensureCredential(tx, ctx.companyId, inv.branchId);
  // chain: serialise ICV/PIH per EGS unit with a row lock
  await tx.$queryRawUnsafe(`SELECT id FROM zatca_credential WHERE id = $1 FOR UPDATE`, cred.id);
  const fresh = (await tx.zatcaCredential.findUnique({ where: { id: cred.id } }))!;
  const icv = fresh.icvCounter + 1;
  const pih = fresh.lastHash ?? FIRST_PIH;
  const simplified = inv.invoiceType === 'simplified';
  const typeCode = inv.invoiceType === 'credit_note' ? '381' : inv.invoiceType === 'debit_note' ? '383' : '388';
  const original = inv.originalInvoiceId ? await tx.invoice.findUnique({ where: { id: inv.originalInvoiceId } }) : null;
  const uuid = inv.zatcaUuid ?? randomUUID();
  const xml = buildUbl({
    invoice: inv, lines, uuid, icv, pih, typeCode, simplified, originalNumber: original?.number ?? undefined,
    seller: { name: company!.name, vat: company!.vatNumber, cr: company!.crNumber, address: company!.address, city: company!.city },
    buyer: { name: customer?.name ?? 'Cash customer', vat: customer?.vatNumber, cr: customer?.crNumber, city: '' },
  });
  const { hash, qr } = signAndQr(xml, fresh, { sellerName: company!.name, vat: company!.vatNumber ?? '', total: inv.total, vatTotal: inv.vatAmount });
  await tx.zatcaCredential.update({ where: { id: cred.id }, data: { icvCounter: icv, lastHash: hash } });
  await tx.invoice.update({ where: { id: invoiceId }, data: { zatcaUuid: uuid, zatcaHash: hash, zatcaIcv: icv, zatcaPih: pih, zatcaQr: qr, zatcaXml: xml, status: 'pending_zatca', zatcaStatus: 'pending' } });
  const mode = await getSetting<string>(ctx.companyId, 'zatca.mode', 'fake');
  if (mode === 'live') return { queued: true };
  return submitInvoice(tx, ctx, invoiceId);
}

export async function submitInvoice(tx: Tx, ctx: Ctx, invoiceId: string) {
  const inv = await tx.invoice.findFirst({ where: { id: invoiceId, companyId: ctx.companyId } });
  if (!inv) throw new HttpError(404, 'not_found', 'Invoice not found');
  const customer = inv.customerId ? await tx.customer.findUnique({ where: { id: inv.customerId } }) : null;
  const simplified = inv.invoiceType === 'simplified';
  const kind = simplified ? 'reporting' : 'clearance';
  const attempt = (await tx.zatcaSubmission.count({ where: { invoiceId } })) + 1;
  const mode = await getSetting<string>(ctx.companyId, 'zatca.mode', 'fake');
  let status: 'accepted' | 'accepted_warnings' | 'rejected' | 'error' = 'accepted';
  let errors: any[] = [], warnings: any[] = [], response: any = { mode };
  if (mode === 'live') {
    const cred = await tx.zatcaCredential.findFirst({ where: { companyId: ctx.companyId, status: 'production' } });
    if (!cred) { status = 'error'; errors = [{ code: 'NO_PRODUCTION_CSID', message: 'ZATCA production credentials are not issued yet' }]; }
    else {
      try {
        const base = cred.environment === 'production' ? 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core' : 'https://gw-fatoora.zatca.gov.sa/e-invoicing/simulation';
        const r = await fetch(`${base}/invoices/${simplified ? 'reporting/single' : 'clearance/single'}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept-Version': 'V2', Authorization: 'Basic ' + Buffer.from(`${cred.csid}:${(cred as any).secret ?? ''}`).toString('base64'), 'Clearance-Status': simplified ? '0' : '1' }, body: JSON.stringify({ invoiceHash: inv.zatcaHash, uuid: inv.zatcaUuid, invoice: Buffer.from(inv.zatcaXml ?? '').toString('base64') }) });
        response = await r.json().catch(() => ({}));
        if (!r.ok) { status = 'rejected'; errors = response?.validationResults?.errorMessages ?? [{ message: `HTTP ${r.status}` }]; } else if (response?.validationResults?.warningMessages?.length) { status = 'accepted_warnings'; warnings = response.validationResults.warningMessages; }
      } catch (e: any) { status = 'error'; errors = [{ message: e.message }]; }
    }
  } else {
    // fake validation: B2B requires a valid buyer VAT number (15 digits, starts/ends with 3) and a non-empty line set
    const lines = await tx.invoiceLine.count({ where: { invoiceId } });
    if (!simplified && inv.invoiceType !== 'credit_note' && !validVat(customer?.vatNumber)) { status = 'rejected'; errors = [{ code: 'BR-KSA-44', message: 'Buyer VAT registration number is missing or invalid for a standard tax invoice' }]; }
    if (!lines) { status = 'rejected'; errors.push({ code: 'BR-16', message: 'Invoice must have at least one line' }); }
    response = { mode, clearanceStatus: status === 'rejected' ? 'NOT_CLEARED' : simplified ? 'REPORTED' : 'CLEARED', validationResults: { status: status === 'rejected' ? 'ERROR' : 'PASS', errorMessages: errors, warningMessages: warnings } };
  }
  await tx.zatcaSubmission.create({ data: { companyId: ctx.companyId, invoiceId, kind, status, attempt, responseBody: response, warnings, errors, submittedAt: new Date() } });
  const ok = status === 'accepted' || status === 'accepted_warnings';
  const upd: any = { zatcaStatus: ok ? (simplified ? 'REPORTED' : 'CLEARED') : status === 'error' ? 'error' : 'REJECTED' };
  if (ok) upd.status = inv.paidAmount && num(inv.balance) <= 0 ? 'paid' : num(inv.paidAmount) > 0 ? 'partially_paid' : simplified ? 'reported' : 'cleared';
  else upd.status = status === 'error' ? 'pending_zatca' : 'rejected';
  await tx.invoice.update({ where: { id: invoiceId }, data: upd });
  return { status, errors, warnings, invoiceStatus: upd.status };
}

export async function zatcaRetrySweep() {
  const pending = await prisma.invoice.findMany({ where: { status: { in: ['pending_zatca'] } }, take: 50 });
  for (const inv of pending) {
    try {
      await prisma.$transaction(async (tx) => {
        const ctx: any = { companyId: inv.companyId, userId: inv.createdById ?? undefined, perms: ['*'], role: 'system', kind: 'staff' };
        await submitInvoice(tx, ctx, inv.id);
      });
    } catch { /* retried next sweep */ }
  }
  return pending.length;
}
export { sendMessage };
