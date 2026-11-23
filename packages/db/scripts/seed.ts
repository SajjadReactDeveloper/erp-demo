import bcrypt from 'bcryptjs';
import { prisma } from '../src/index';
import { DEFAULT_ROLES } from '@erp/shared';

const PASSWORD = process.env.SEED_PASSWORD ?? 'Passw0rd!2026';

async function main() {
  if (await prisma.company.findFirst()) {
    console.log('Already seeded. (drop the database to re-seed)');
    return;
  }
  const hash = await bcrypt.hash(PASSWORD, 10);
  const company = await prisma.company.create({ data: { name: 'AutocQuick Auto Parts Trading', nameAr: 'أوتوكويك لتجارة قطع الغيار', vatNumber: '310123456700003', crNumber: '1010123456', address: 'Riyadh, Kingdom of Saudi Arabia', city: 'Riyadh', phone: '+966 11 000 0000', email: 'info@autocquick.example', currency: 'SAR', defaultLocale: 'ar', hijriDates: true, primaryColor: '#0f766e' } });
  const companyId = company.id;
  const c = { companyId };

  const hq = await prisma.branch.create({ data: { ...c, code: 'HQ', name: 'Head Office', nameAr: 'المركز الرئيسي', city: 'Riyadh' } });
  await prisma.branch.create({ data: { ...c, code: 'JED', name: 'Jeddah Branch', nameAr: 'فرع جدة', city: 'Jeddah' } });
  const wh = await prisma.warehouse.create({ data: { ...c, code: 'WH1', name: 'Main Warehouse', branchId: hq.id } });
  await prisma.warehouse.create({ data: { ...c, code: 'WH2', name: 'Jeddah Warehouse', branchId: (await prisma.branch.findFirst({ where: { code: 'JED' } }))!.id } });
  const cc = await prisma.costCenter.createManyAndReturn({ data: ['Sales', 'Operations', 'Administration', 'Logistics'].map((n, i) => ({ ...c, code: `CC${i + 1}`, name: n })) });

  // roles + users
  const roles: Record<string, string> = {};
  for (const [name, r] of Object.entries(DEFAULT_ROLES)) roles[name] = (await prisma.role.create({ data: { ...c, name, description: r.description, permissions: r.permissions, isSystem: true } })).id;
  const staff: [string, string, string][] = [
    ['admin', 'Admin User', 'admin@autocquick.test'], ['manager', 'Fouad (General Manager)', 'gm@autocquick.test'], ['sales', 'Sara Sales', 'sales@autocquick.test'],
    ['purchasing', 'Pasha Purchasing', 'purchasing@autocquick.test'], ['warehouse', 'Wael Warehouse', 'warehouse@autocquick.test'], ['driver', 'Daoud Driver', 'driver@autocquick.test'],
    ['finance', 'Farah Finance', 'finance@autocquick.test'], ['collector', 'Khalid Collector', 'collector@autocquick.test'], ['cashier', 'Cathy Cashier', 'cashier@autocquick.test'], ['technician', 'Tariq Technician', 'tech@autocquick.test'],
  ];
  const users: Record<string, string> = {};
  for (const [role, name, email] of staff) users[role] = (await prisma.user.create({ data: { ...c, email, name, roleId: roles[role], kind: 'staff', passwordHash: hash, locale: 'ar', branchId: hq.id } })).id;

  // settings
  const S: Record<string, any> = {
    'sla.request_hours': 4, 'rfq.default_deadline_hours': 48, 'quotation.validity_days': 7, 'margin.default_target_pct': 0.25, 'margin.default_min_pct': 0.1,
    'credit.grace_days': 5, 'credit.exposure_quote_weight': 1, 'match.tolerance_qty_pct': 2, 'match.tolerance_price_pct': 1, 'vat.default_pct': 15, 'invoice.due_days': 30,
    'security.idle_timeout_min': 120, 'zatca.mode': 'fake', 'daftra.mode': 'push', 'ai.provider': 'local', 'ai.min_confidence': 0.6,
    'bestvalue.weights': { price: 0.5, lead: 0.25, rating: 0.15, warranty: 0.1 }, 'ageing.buckets': [30, 60, 90], 'reminder.enabled': true, 'whatsapp.enabled': true,
  };
  for (const [key, v] of Object.entries(S)) await prisma.setting.create({ data: { ...c, key, value: { v }, description: key } });

  // tax codes, uoms
  await prisma.taxCode.createMany({ data: [
    { ...c, code: 'S15', name: 'Standard rate 15%', ratePct: 15, category: 'standard', isDefault: true }, { ...c, code: 'Z0', name: 'Zero-rated', ratePct: 0, category: 'zero' },
    { ...c, code: 'E0', name: 'Exempt', ratePct: 0, category: 'exempt' }, { ...c, code: 'X0', name: 'Export 0%', ratePct: 0, category: 'export' },
  ] });
  const uoms = await prisma.uom.createManyAndReturn({ data: [['PCS', 'Piece', 'قطعة'], ['SET', 'Set', 'طقم'], ['L', 'Litre', 'لتر'], ['PK', 'Pack', 'عبوة']].map(([code, name, nameAr]) => ({ ...c, code, name, nameAr })) });
  const uom = Object.fromEntries(uoms.map((u) => [u.code, u.id]));
  await prisma.uomConversion.createMany({ data: [{ ...c, fromUomId: uom.SET, toUomId: uom.PCS, factor: 4 }, { ...c, fromUomId: uom.PK, toUomId: uom.PCS, factor: 12 }] });

  // chart of accounts
  const coa: [string, string, string, string, string][] = [
    ['1010', 'Cash on hand', 'النقدية بالصندوق', 'asset', 'cash'], ['1020', 'Bank accounts', 'الحسابات البنكية', 'asset', 'bank'], ['1030', 'Petty cash', 'العهدة النقدية', 'asset', 'cash'],
    ['1100', 'Accounts receivable', 'العملاء (الذمم المدينة)', 'asset', 'ar'], ['1150', 'Goods in transit', 'بضاعة في الطريق', 'asset', 'in_transit'], ['1160', 'Inventory', 'المخزون', 'asset', 'inventory'],
    ['1200', 'VAT input', 'ضريبة القيمة المضافة - مدخلات', 'asset', 'vat_in'], ['1300', 'Prepaid expenses', 'مصروفات مدفوعة مقدماً', 'asset', 'none'],
    ['2100', 'Accounts payable', 'الموردون (الذمم الدائنة)', 'liability', 'ap'], ['2150', 'GRNI (goods received not invoiced)', 'بضاعة مستلمة غير مفوترة', 'liability', 'grni'],
    ['2200', 'VAT output', 'ضريبة القيمة المضافة - مخرجات', 'liability', 'vat_out'], ['2300', 'Accrued expenses', 'مصروفات مستحقة', 'liability', 'none'], ['2400', 'Customer deposits', 'دفعات مقدمة من العملاء', 'liability', 'none'],
    ['3100', 'Share capital', 'رأس المال', 'equity', 'equity'], ['3200', 'Retained earnings', 'الأرباح المبقاة', 'equity', 'equity'],
    ['1400', 'Inter-branch receivable', 'حساب جاري الفروع (مدين)', 'asset', 'none'], ['2450', 'Inter-branch payable', 'حساب جاري الفروع (دائن)', 'liability', 'none'], ['4100', 'Sales revenue', 'إيرادات المبيعات', 'revenue', 'sales'], ['4200', 'Service revenue', 'إيرادات الخدمات', 'revenue', 'none'], ['4900', 'Sales returns & allowances', 'مردودات المبيعات', 'revenue', 'none'],
    ['5100', 'Cost of goods sold', 'تكلفة البضاعة المباعة', 'cogs', 'cogs'],
    ['6100', 'Salaries & wages', 'الرواتب والأجور', 'expense', 'expense'], ['6200', 'Rent', 'الإيجار', 'expense', 'expense'], ['6300', 'Utilities', 'المرافق', 'expense', 'expense'],
    ['6400', 'Fuel & delivery', 'الوقود والتوصيل', 'expense', 'expense'], ['6500', 'Bank charges', 'عمولات بنكية', 'expense', 'expense'], ['6600', 'Office & admin', 'مصروفات مكتبية وإدارية', 'expense', 'expense'],
    ['6800', 'Inventory adjustments', 'تسويات المخزون', 'expense', 'expense'], ['6900', 'Cash over/short', 'عجز وزيادة الصندوق', 'expense', 'expense'],
  ];
  const acc: Record<string, string> = {};
  for (const [code, name, nameAr, type, controlType] of coa) acc[code] = (await prisma.account.create({ data: { ...c, code, name, nameAr, type, controlType, allowPosting: true } })).id;

  // posting rules (data-driven; amountExpr evaluated by the posting service)
  const rules: [string, 'debit' | 'credit', string, string, number][] = [
    ['invoice', 'debit', '1100', 'total', 1], ['invoice', 'credit', '4100', 'net', 2], ['invoice', 'credit', '2200', 'vat', 3], ['invoice', 'debit', '5100', 'cost', 4], ['invoice', 'credit', '1150', 'cost', 5],
    ['credit_note', 'debit', '4900', 'net', 1], ['credit_note', 'debit', '2200', 'vat', 2], ['credit_note', 'credit', '1100', 'total', 3],
    ['goods_receipt', 'debit', '1150', 'amount', 1], ['goods_receipt', 'credit', '2150', 'amount', 2],
    ['supplier_bill', 'debit', '2150', 'subtotal', 1], ['supplier_bill', 'debit', '1200', 'vat', 2], ['supplier_bill', 'credit', '2100', 'total', 3],
    ['debit_note', 'debit', '2100', 'total', 1], ['debit_note', 'credit', '2150', 'subtotal', 2], ['debit_note', 'credit', '1200', 'vat', 3],
    ['receipt', 'debit', '1020', 'amount', 1], ['receipt', 'credit', '1100', 'amount', 2],
    ['payment', 'debit', '2100', 'amount', 1], ['payment', 'credit', '1020', 'amount', 2],
    ['expense', 'debit', '6600', 'net', 1], ['expense', 'debit', '1200', 'vat', 2], ['expense', 'credit', '1020', 'total', 3],
    ['stock_adjust_gain', 'debit', '1160', 'amount', 1], ['stock_adjust_gain', 'credit', '6800', 'amount', 2], ['stock_adjust_loss', 'debit', '6800', 'amount', 1], ['stock_adjust_loss', 'credit', '1160', 'amount', 2],
    ['cash_variance_short', 'debit', '6900', 'amount', 1], ['cash_variance_short', 'credit', '1010', 'amount', 2], ['cash_variance_over', 'debit', '1010', 'amount', 1], ['cash_variance_over', 'credit', '6900', 'amount', 2],
    ['branch_transfer_out', 'debit', '1400', 'amount', 1], ['branch_transfer_out', 'credit', '1160', 'amount', 2], ['branch_transfer_in', 'debit', '1160', 'amount', 1], ['branch_transfer_in', 'credit', '2450', 'amount', 2], ['expense_payable', 'debit', '6600', 'net', 1], ['expense_payable', 'debit', '1200', 'vat', 2], ['expense_payable', 'credit', '2100', 'total', 3],
    ['pos_invoice', 'debit', '1010', 'total', 1], ['pos_invoice', 'credit', '4100', 'net', 2], ['pos_invoice', 'credit', '2200', 'vat', 3], ['pos_invoice', 'debit', '5100', 'cost', 4], ['pos_invoice', 'credit', '1160', 'cost', 5],
  ];
  await prisma.postingRule.createMany({ data: rules.map(([event, side, code, amountExpr, seq]) => ({ ...c, event, side, accountId: acc[code], amountExpr, seq })) });

  // fiscal periods for current year
  const y = new Date().getFullYear();
  await prisma.fiscalPeriod.createMany({ data: Array.from({ length: 12 }, (_, m) => ({ ...c, name: `${y}-${String(m + 1).padStart(2, '0')}`, startDate: new Date(Date.UTC(y, m, 1)), endDate: new Date(Date.UTC(y, m + 1, 0)) })) });

  // bank accounts, expense categories, budgets
  await prisma.bankAccount.create({ data: { ...c, name: 'Main Bank Account', bankName: 'Al Rajhi Bank', accountNo: '1234567890', iban: 'SA0380000000608010167519', type: 'bank', accountId: acc['1020'], currency: 'SAR', openingBalance: 0 } });
  await prisma.bankAccount.create({ data: { ...c, name: 'Cash Box', type: 'cash', accountId: acc['1010'], currency: 'SAR', openingBalance: 0 } });
  await prisma.bankAccount.create({ data: { ...c, name: 'Petty Cash', type: 'petty_cash', accountId: acc['1030'], currency: 'SAR', openingBalance: 0 } });
  const cats = await prisma.expenseCategory.createManyAndReturn({ data: [['Rent', 'الإيجار', '6200'], ['Salaries', 'الرواتب', '6100'], ['Utilities', 'المرافق', '6300'], ['Fuel & delivery', 'الوقود والتوصيل', '6400'], ['Office', 'مكتبية', '6600'], ['Bank charges', 'عمولات بنكية', '6500']].map(([name, nameAr, code]) => ({ ...c, name, nameAr, accountId: acc[code] })) });
  const monthStart = new Date(Date.UTC(y, new Date().getMonth(), 1)), monthEnd = new Date(Date.UTC(y, new Date().getMonth() + 1, 0));
  await prisma.budget.createMany({ data: cats.map((cat) => ({ ...c, categoryId: cat.id, costCenterId: cc[2].id, periodStart: monthStart, periodEnd: monthEnd, amount: 20000 })) });

  // approvals matrix (BR-9)
  await prisma.approvalRule.createMany({ data: [
    { ...c, type: 'margin', name: 'Below-minimum margin', minAmount: 0, steps: [{ role: 'manager', slaHours: 4 }], escalateAfterHours: 4 },
    { ...c, type: 'purchase_order', name: 'PO above SAR 5,000', minAmount: 5000, maxAmount: 100000, steps: [{ role: 'manager', slaHours: 24 }] },
    { ...c, type: 'purchase_order', name: 'PO above SAR 100,000', minAmount: 100000, steps: [{ role: 'manager', slaHours: 24 }, { role: 'admin', slaHours: 24 }] },
    { ...c, type: 'credit', name: 'Over-limit up to 25k', minAmount: 0, maxAmount: 25000, steps: [{ role: 'manager', slaHours: 8 }] },
    { ...c, type: 'credit', name: 'Over-limit 25k-100k', minAmount: 25000, maxAmount: 100000, steps: [{ role: 'finance', slaHours: 8 }, { role: 'manager', slaHours: 8 }] },
    { ...c, type: 'credit', name: 'Over-limit above 100k', minAmount: 100000, steps: [{ role: 'finance', slaHours: 8 }, { role: 'manager', slaHours: 8 }, { role: 'admin', slaHours: 8 }] },
    { ...c, type: 'discount', name: 'Discounts', minAmount: 0, steps: [{ role: 'manager', slaHours: 8 }] },
    { ...c, type: 'price_override', name: 'Price override', minAmount: 0, steps: [{ role: 'manager', slaHours: 8 }] },
    { ...c, type: 'return', name: 'Returns above 2,000', minAmount: 2000, steps: [{ role: 'manager', slaHours: 24 }] },
    { ...c, type: 'expense', name: 'Expenses above 3,000', minAmount: 3000, steps: [{ role: 'finance', slaHours: 24 }] },
    { ...c, type: 'writeoff', name: 'Write-offs', minAmount: 0, steps: [{ role: 'finance', slaHours: 24 }, { role: 'admin', slaHours: 24 }] },
  ] });

  // reminders, notification rules
  await prisma.reminderRule.createMany({ data: [-3, 0, 3, 7, 14, 30].map((offsetDays) => ({ ...c, offsetDays, channel: offsetDays <= 7 ? 'whatsapp' : 'sms', templateKey: offsetDays < 0 ? 'pre_due' : offsetDays === 0 ? 'due_today' : 'overdue' })) });
  await prisma.notificationRule.createMany({ data: [
    ['Request.submitted', 'sales'], ['Quotation.approved_internal', 'sales'], ['SalesOrder.on_hold', 'finance'], ['PurchaseOrder.pending_approval', 'manager'], ['Invoice.rejected', 'finance'], ['CreditAlert.created', 'collector'], ['SupplierQuote.submitted', 'purchasing'],
  ].map(([event, role]) => ({ ...c, event, roleId: roles[role], channel: 'inapp', language: 'user' })) });

  // masterdata
  await prisma.lostReason.createMany({ data: [['PRICE', 'Price too high', 'السعر مرتفع'], ['LEAD', 'Lead time too long', 'مدة التوريد طويلة'], ['COMP', 'Bought elsewhere', 'اشترى من مكان آخر'], ['CANCEL', 'No longer needed', 'لم يعد مطلوباً'], ['WRONG', 'Wrong part requested', 'قطعة خاطئة']].map(([code, name, nameAr]) => ({ ...c, code, name, nameAr })) });
  const brands = await prisma.brand.createManyAndReturn({ data: [['Toyota (OEM)', 'تويوتا (أصلي)', true], ['Hyundai (OEM)', 'هيونداي (أصلي)', true], ['Nissan (OEM)', 'نيسان (أصلي)', true], ['Bosch', 'بوش', false], ['Denso', 'دينسو', false], ['NGK', 'إن جي كي', false], ['Brembo', 'برمبو', false], ['Mann-Filter', 'مان فلتر', false], ['Monroe', 'مونرو', false], ['Michelin', 'ميشلان', false], ['Varta', 'فارتا', false]].map(([name, nameAr, isOem]) => ({ ...c, name: name as string, nameAr: nameAr as string, isOem: isOem as boolean })) });
  const brand = Object.fromEntries(brands.map((b) => [b.name.split(' ')[0], b.id]));
  const cats2 = await prisma.category.createManyAndReturn({ data: [['Brakes', 'الفرامل'], ['Filters', 'الفلاتر'], ['Ignition', 'الإشعال'], ['Suspension', 'التعليق'], ['Engine oil & fluids', 'الزيوت والسوائل'], ['Tyres', 'الإطارات'], ['Batteries', 'البطاريات'], ['Wipers & lights', 'المساحات والإضاءة']].map(([name, nameAr]) => ({ ...c, name, nameAr })) });
  const cat = Object.fromEntries(cats2.map((x) => [x.name.split(' ')[0], x.id]));

  type P = [string, string, string, string, string, number, string?];
  const parts: P[] = [
    ['04465-06180', 'Front brake pads Camry', 'طقم فحمات أمامية كامري', 'Toyota', 'Brakes', 185], ['P83-024', 'Front brake pads (Brembo)', 'طقم فحمات أمامية برمبو', 'Brembo', 'Brakes', 240],
    ['90915-YZZD4', 'Oil filter Toyota', 'فلتر زيت تويوتا', 'Toyota', 'Filters', 28], ['W 712/95', 'Oil filter (Mann)', 'فلتر زيت مان', 'Mann-Filter', 'Filters', 34], ['17801-0V020', 'Air filter Camry', 'فلتر هواء كامري', 'Toyota', 'Filters', 62],
    ['C 25 114', 'Air filter (Mann)', 'فلتر هواء مان', 'Mann-Filter', 'Filters', 55], ['ILKAR7B11', 'Spark plug iridium (NGK)', 'بوجي إريديوم', 'NGK', 'Ignition', 38], ['SK20R11', 'Spark plug (Denso)', 'بوجي دينسو', 'Denso', 'Ignition', 32],
    ['48157-06130', 'Front shock absorber', 'ممتص صدمات أمامي', 'Toyota', 'Suspension', 420], ['G8133', 'Front shock absorber (Monroe)', 'ممتص صدمات مونرو', 'Monroe', 'Suspension', 360],
    ['58101-F2A00', 'Brake pads Elantra', 'فحمات إلنترا', 'Hyundai', 'Brakes', 175], ['26300-35504', 'Oil filter Hyundai', 'فلتر زيت هيونداي', 'Hyundai', 'Filters', 30],
    ['41060-ED025', 'Brake disc Altima', 'قرص فرامل التيما', 'Nissan', 'Brakes', 310], ['15208-65F0C', 'Oil filter Nissan', 'فلتر زيت نيسان', 'Nissan', 'Filters', 29],
    ['0 986 479 X15', 'Brake disc (Bosch)', 'قرص فرامل بوش', 'Bosch', 'Brakes', 290], ['S4 005', 'Car battery 60Ah (Bosch)', 'بطارية 60 أمبير بوش', 'Bosch', 'Batteries', 420], ['560 408 054', 'Car battery 60Ah (Varta)', 'بطارية 60 أمبير فارتا', 'Varta', 'Batteries', 450],
    ['PRIM-205-55-R16', 'Michelin Primacy 205/55 R16', 'إطار ميشلان 205/55 R16', 'Michelin', 'Tyres', 480], ['ENERGY-215-60-R16', 'Michelin Energy 215/60 R16', 'إطار ميشلان 215/60 R16', 'Michelin', 'Tyres', 510],
    ['5W30-4L', 'Engine oil 5W-30 4L', 'زيت محرك 5W-30 4 لتر', 'Toyota', 'Engine', 110], ['A 600', 'Wiper blade set 24/16', 'مساحات زجاج', 'Bosch', 'Wipers', 65], ['H7-12V', 'Headlight bulb H7', 'لمبة أمامية H7', 'Bosch', 'Wipers', 22],
  ];
  const partRows: any[] = [];
  for (const [partNumber, name, nameAr, b, ct, ceil] of parts) {
    partRows.push(await prisma.part.create({ data: { ...c, partNumber, name, nameAr, brandId: brand[b], categoryId: cat[ct], uomId: uom.PCS, status: 'active', source: 'manual', marketCeiling: ceil, trackSerial: ct === 'Batteries' } }));
  }
  const pid = Object.fromEntries(partRows.map((p) => [p.partNumber, p.id]));
  await prisma.partXref.createMany({ data: [
    ['04465-06180', 'P83-024', 'aftermarket'], ['04465-06180', 'GDB3425', 'aftermarket'], ['90915-YZZD4', 'W 712/95', 'aftermarket'], ['17801-0V020', 'C 25 114', 'aftermarket'], ['SK20R11', 'ILKAR7B11', 'aftermarket'],
    ['48157-06130', 'G8133', 'aftermarket'], ['41060-ED025', '0 986 479 X15', 'aftermarket'], ['04465-06180', '0446506180', 'superseded'],
  ].map(([p, x, xrefType]) => ({ ...c, partId: pid[p], xrefNumber: x, xrefType })) });
  const fits: [string, string, string, number, number][] = [
    ['04465-06180', 'Toyota', 'Camry', 2018, 2023], ['P83-024', 'Toyota', 'Camry', 2018, 2023], ['90915-YZZD4', 'Toyota', 'Camry', 2010, 2023], ['W 712/95', 'Toyota', 'Camry', 2010, 2023], ['17801-0V020', 'Toyota', 'Camry', 2018, 2023],
    ['C 25 114', 'Toyota', 'Camry', 2018, 2023], ['ILKAR7B11', 'Toyota', 'Camry', 2012, 2023], ['SK20R11', 'Toyota', 'Camry', 2012, 2023], ['48157-06130', 'Toyota', 'Camry', 2018, 2023], ['G8133', 'Toyota', 'Camry', 2018, 2023],
    ['58101-F2A00', 'Hyundai', 'Elantra', 2016, 2022], ['26300-35504', 'Hyundai', 'Elantra', 2016, 2022], ['41060-ED025', 'Nissan', 'Altima', 2013, 2018], ['15208-65F0C', 'Nissan', 'Altima', 2013, 2018], ['0 986 479 X15', 'Nissan', 'Altima', 2013, 2018],
    ['5W30-4L', 'Toyota', 'Camry', 2010, 2023], ['A 600', 'Toyota', 'Camry', 2012, 2023],
  ];
  await prisma.partVehicleFit.createMany({ data: fits.map(([p, make, model, yearFrom, yearTo]) => ({ ...c, partId: pid[p], make, model, yearFrom, yearTo })) });
  await prisma.tyreSpec.createMany({ data: [{ ...c, partId: pid['PRIM-205-55-R16'], width: 205, aspect: 55, rim: 16, loadIndex: '91', speedRating: 'V', season: 'all', setOf: 4 }, { ...c, partId: pid['ENERGY-215-60-R16'], width: 215, aspect: 60, rim: 16, loadIndex: '95', speedRating: 'H', season: 'summer', setOf: 4 }] });

  // price rules (more specific rules win)
  await prisma.priceRule.createMany({ data: [
    { ...c, name: 'Default', urgency: 'any', targetMarginPct: 0.25, minMarginPct: 0.1 }, { ...c, name: 'Dealers', customerTier: 'A', urgency: 'any', targetMarginPct: 0.18, minMarginPct: 0.08 },
    { ...c, name: 'Retail', customerTier: 'retail', urgency: 'any', targetMarginPct: 0.32, minMarginPct: 0.15 }, { ...c, name: 'Urgent orders', urgency: 'urgent', targetMarginPct: 0.32, minMarginPct: 0.15 },
    { ...c, name: 'Tyres', categoryId: cat.Tyres, urgency: 'any', targetMarginPct: 0.2, minMarginPct: 0.08 },
  ] });

  // customers
  const custs: [string, string, string, string, number, number, string][] = [
    ['Al-Noor Workshop', 'ورشة النور', 'workshop', 'B', 50000, 30, 'Riyadh'], ['Desert Fleet Co.', 'شركة أسطول الصحراء', 'fleet', 'A', 150000, 60, 'Riyadh'], ['Gulf Rent-a-Car', 'الخليج لتأجير السيارات', 'rental', 'A', 200000, 60, 'Jeddah'],
    ['Premier Motors Dealer', 'بريمير موتورز', 'dealer', 'A', 300000, 90, 'Riyadh'], ['Ahmed Al-Saleh', 'أحمد الصالح', 'individual', 'retail', 5000, 0, 'Riyadh'], ['Najd Garage', 'كراج نجد', 'workshop', 'B', 30000, 30, 'Dammam'],
    ['Eastern Logistics', 'الشرقية للنقل', 'fleet', 'B', 80000, 45, 'Dammam'], ['Quick Fix Auto', 'كويك فيكس', 'workshop', 'C', 15000, 30, 'Jeddah'],
  ];
  const custRows: any[] = [];
  for (const [i, [name, nameAr, customerType, priceTier, limit, terms, city]] of custs.entries()) {
    const cu = await prisma.customer.create({ data: { ...c, code: `CUS-${y}-${String(i + 1).padStart(5, '0')}`, name, nameAr, customerType, priceTier, vatNumber: `31000000000${String(i + 1).padStart(3, '0')}3`, crNumber: `101000${i}`, email: `${name.split(' ')[0].toLowerCase()}@example.test`, phone: '+966 5' + String(10000000 + i * 1234567).slice(0, 8), status: 'active', salesRepId: users.sales, creditLimit: limit, paymentTermsDays: terms, branchId: hq.id, portalEnabled: true, source: 'manual' } });
    await prisma.customerContact.create({ data: { ...c, customerId: cu.id, name: `${name} Contact`, email: cu.email, phone: cu.phone, isPrimary: true, role: 'Purchasing' } });
    await prisma.customerAddress.create({ data: { ...c, customerId: cu.id, label: 'Main', line1: `${name} - ${city}`, city, area: city, isDefault: true, lat: 24.7136 + i * 0.01, lng: 46.6753 + i * 0.01 } });
    await prisma.creditProfile.create({ data: { ...c, customerId: cu.id, limitAmount: limit, termsDays: terms, tier: priceTier, graceDays: 5, status: 'active' } });
    custRows.push(cu);
  }
  const vehs: [string, string, string, number, string][] = [['JTNB11HK0J3000001', 'Toyota', 'Camry', 2019, '2.5L'], ['KMHD35LH4HU000002', 'Hyundai', 'Elantra', 2018, '2.0L'], ['1N4AL3AP5DC000003', 'Nissan', 'Altima', 2015, '2.5L'], ['JTNB11HK9K3000004', 'Toyota', 'Camry', 2020, '2.5L']];
  for (const [i, [vin, make, model, year, engine]] of vehs.entries()) await prisma.vehicle.create({ data: { ...c, vin, make, model, year, engine, customerId: custRows[i % custRows.length].id, mileage: 60000 + i * 15000, plate: `ABC ${1000 + i}` } });

  // suppliers
  const sups: [string, string, string[], string[], number, number][] = [
    ['Riyadh Auto Parts Wholesale', 'الرياض لقطع الغيار بالجملة', ['Toyota', 'Hyundai', 'Nissan'], ['Brakes', 'Filters', 'Suspension'], 30, 2], ['Gulf Brake Systems', 'الخليج لأنظمة الفرامل', ['Brembo', 'Bosch'], ['Brakes'], 45, 3],
    ['Al-Fursan Filters', 'الفرسان للفلاتر', ['Mann-Filter', 'Bosch'], ['Filters', 'Ignition'], 30, 1], ['Tyre World', 'عالم الإطارات', ['Michelin'], ['Tyres'], 30, 2], ['PowerCell Batteries', 'باور سل للبطاريات', ['Bosch', 'Varta'], ['Batteries'], 60, 2],
    ['Japan Parts Import', 'اليابان لاستيراد القطع', ['Toyota', 'Nissan', 'Denso', 'NGK'], ['Ignition', 'Suspension', 'Brakes', 'Engine'], 45, 5],
  ];
  const supRows: any[] = [];
  for (const [i, [name, nameAr, b, ct, terms, lead]] of sups.entries()) {
    const s = await prisma.supplier.create({ data: { ...c, code: `SUP-${y}-${String(i + 1).padStart(5, '0')}`, name, nameAr, vatNumber: `30000000000${String(i + 1).padStart(3, '0')}3`, email: `${name.split(' ')[0].toLowerCase()}@supplier.test`, phone: '+966 11 4' + String(100000 + i * 1111), whatsapp: '+966 55 5' + String(100000 + i * 2222), paymentTermsDays: terms, brands: b, categories: ct, leadTimeDays: lead, status: 'active', rating: 4 - (i % 3) * 0.4, onTimePct: 90 - i * 2 } });
    await prisma.supplierContact.create({ data: { ...c, supplierId: s.id, name: `${name} Sales`, email: s.email, phone: s.phone } });
    supRows.push(s);
  }

  // portal users
  await prisma.user.create({ data: { ...c, email: 'customer@alnoor.test', name: 'Al-Noor Purchasing', roleId: roles.sales, kind: 'customer', customerId: custRows[0].id, passwordHash: hash, locale: 'ar' } });
  await prisma.user.create({ data: { ...c, email: 'supplier@riyadhparts.test', name: 'Riyadh Parts Sales', roleId: roles.sales, kind: 'supplier', supplierId: supRows[0].id, passwordHash: hash, locale: 'ar' } });
  await prisma.user.create({ data: { ...c, email: 'supplier2@gulfbrakes.test', name: 'Gulf Brake Sales', roleId: roles.sales, kind: 'supplier', supplierId: supRows[1].id, passwordHash: hash, locale: 'ar' } });
  await prisma.user.create({ data: { ...c, email: 'supplier3@alfursan.test', name: 'Al-Fursan Sales', roleId: roles.sales, kind: 'supplier', supplierId: supRows[2].id, passwordHash: hash, locale: 'ar' } });

  // service intervals, service types, bays, terminals
  await prisma.serviceInterval.createMany({ data: [['Toyota', 'Camry', 'Oil & filter change', 10000, 6], ['Toyota', 'Camry', 'Brake inspection', 20000, 12], ['Hyundai', 'Elantra', 'Oil & filter change', 7500, 6], ['Nissan', 'Altima', 'Oil & filter change', 8000, 6], ['', '', 'Battery check', 0, 12]].map(([make, model, serviceName, everyKm, everyMonths]) => ({ ...c, make: make as string, model: model as string, serviceName: serviceName as string, everyKm: everyKm as number, everyMonths: everyMonths as number })) });
  await prisma.serviceType.createMany({ data: [['Oil change', 'تغيير زيت', 45, 60, 10000, 6], ['Brake service', 'صيانة فرامل', 90, 150, 20000, 12], ['Tyre fitting & balancing', 'تركيب وترصيص إطارات', 60, 80, 0, 0], ['Battery replacement', 'تغيير بطارية', 30, 40, 0, 0]].map(([name, nameAr, durationMin, price, intervalKm, intervalMonths]) => ({ ...c, name: name as string, nameAr: nameAr as string, durationMin: durationMin as number, price: price as number, intervalKm: intervalKm as number, intervalMonths: intervalMonths as number })) });
  await prisma.bay.createMany({ data: [1, 2, 3].map((n) => ({ ...c, name: `Bay ${n}`, branchId: hq.id })) });
  await prisma.posTerminal.create({ data: { ...c, name: 'Counter 1', branchId: hq.id, warehouseId: wh.id } });
  await prisma.device.create({ data: { ...c, name: 'Sunmi V2 #1', kind: 'sunmi', serial: 'SM-0001', userId: users.warehouse } });
  await prisma.zatcaCredential.create({ data: { ...c, egsName: 'EGS-HQ-01', branchId: hq.id, environment: 'sandbox', status: 'pending' } });

  // document templates (bilingual HTML; placeholders replaced by the print service)
  for (const docType of ['quotation', 'purchase_order', 'delivery_note', 'invoice', 'statement', 'receipt', 'label']) {
    for (const language of ['ar', 'en']) await prisma.template.create({ data: { ...c, docType, name: `${docType} (${language})`, language, body: '{{default}}', isDefault: true } });
  }

  console.log(`Seeded. Staff login password for all demo users: ${PASSWORD}`);
  console.log(staff.map((s) => `  ${s[2]}  (${s[0]})`).join('\n'));
  console.log('  customer@alnoor.test (customer portal) | supplier@riyadhparts.test, supplier2@gulfbrakes.test, supplier3@alfursan.test (supplier portal)');
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
