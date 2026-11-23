import { ActionDef, ChildDef, ResourceDef, kebab, parseField } from '../fields';

export interface Opts {
  plural?: [string, string]; // [en, ar]
  num?: string;
  children?: [string, string][]; // [childResourceKey, fk]
  actions?: ActionDef[];
  global?: boolean;
  sys?: boolean;
  immutable?: boolean;
  noDelete?: boolean;
  req?: boolean;
  portal?: 'customer' | 'supplier';
  rel?: 'R1' | 'R2' | 'R3';
  f?: string[]; // PRD feature ids
  unique?: string[][];
  order?: string;
}

export const act = (key: string, en: string, ar: string, from?: string[], to?: string, extra: Partial<ActionDef> = {}): ActionDef => ({ key, en, ar, from, to, ...extra });

export function R(key: string, mod: string, en: string, ar: string, label: string, icon: string, specs: string[], o: Opts = {}): ResourceDef {
  const fields = specs.map(parseField);
  const children: ChildDef[] = (o.children ?? []).map(([k, fk]) => ({ key: k, fk }));
  return {
    key,
    slug: kebab(key),
    mod,
    en,
    ar,
    enPlural: o.plural?.[0] ?? en + 's',
    arPlural: o.plural?.[1] ?? ar,
    label,
    icon,
    fields,
    children,
    actions: o.actions ?? [],
    num: o.num,
    numField: o.num ? (['number', 'entryNo', 'code'].find((n) => fields.some((f) => f.name === n))) : undefined,
    statusField: fields.find((f) => f.name === 'status')?.name,
    global: o.global,
    sys: o.sys,
    immutable: o.immutable,
    noDelete: o.noDelete,
    req: o.req,
    portal: o.portal,
    release: o.rel ?? 'R1',
    features: o.f ?? [],
    unique: o.unique,
    order: o.order ?? 'createdAt:desc',
  };
}

export const MODULES: { key: string; en: string; ar: string; icon: string; release: 'R1' | 'R2' | 'R3' }[] = [
  { key: 'sales', en: 'Sales & CRM', ar: 'المبيعات والعملاء', icon: 'shopping-cart', release: 'R1' },
  { key: 'procurement', en: 'Procurement', ar: 'المشتريات', icon: 'truck', release: 'R1' },
  { key: 'logistics', en: 'Logistics', ar: 'الخدمات اللوجستية', icon: 'package', release: 'R1' },
  { key: 'finance', en: 'Finance', ar: 'المالية', icon: 'landmark', release: 'R1' },
  { key: 'credit', en: 'Credit & Collections', ar: 'الائتمان والتحصيل', icon: 'wallet', release: 'R1' },
  { key: 'masterdata', en: 'Master Data', ar: 'البيانات الرئيسية', icon: 'database', release: 'R1' },
  { key: 'platform', en: 'Administration', ar: 'الإدارة', icon: 'settings', release: 'R1' },
  { key: 'marketplace', en: 'Supplier Marketplace', ar: 'سوق الموردين', icon: 'store', release: 'R2' },
  { key: 'vehicle', en: 'Vehicle Services', ar: 'خدمات المركبات', icon: 'car', release: 'R2' },
  { key: 'inventory', en: 'Inventory', ar: 'المخزون', icon: 'boxes', release: 'R3' },
  { key: 'pos', en: 'POS & Branches', ar: 'نقاط البيع والفروع', icon: 'receipt', release: 'R3' },
  { key: 'workshop', en: 'Workshop', ar: 'الورشة', icon: 'wrench', release: 'R3' },
];
