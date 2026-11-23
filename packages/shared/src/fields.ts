export type FieldType = 'string' | 'text' | 'int' | 'decimal' | 'bool' | 'date' | 'datetime' | 'json' | 'enum' | 'ref';

export interface Field {
  name: string;
  type: FieldType;
  required: boolean;
  list: boolean; // show as table column
  search: boolean; // included in text search
  readonly: boolean; // set by the system, not editable in forms
  hidden: boolean; // not shown in forms/detail
  values?: string[]; // enum values
  ref?: string; // referenced resource key
}

export interface ActionDef {
  key: string;
  en: string;
  ar: string;
  from?: string[];
  to?: string;
  perm?: string;
  danger?: boolean;
  confirm?: boolean;
}
export interface ChildDef {
  key: string;
  fk: string;
}

export interface ResourceDef {
  key: string; // Prisma model name, PascalCase
  slug: string; // url segment, kebab-case
  mod: string; // module key
  en: string;
  ar: string;
  enPlural: string;
  arPlural: string;
  label: string; // field used as display label
  icon: string;
  fields: Field[];
  children: ChildDef[];
  actions: ActionDef[];
  num?: string; // document number prefix
  numField?: string; // field receiving the auto number (number | entryNo | code)
  statusField?: string;
  global?: boolean; // no companyId
  sys?: boolean; // system table: hidden from generic UI, API read-only
  immutable?: boolean; // no update/delete via API (append-only)
  noDelete?: boolean;
  req?: boolean; // carries requestId
  portal?: 'customer' | 'supplier'; // portal row scoping via customerId / supplierId
  release: 'R1' | 'R2' | 'R3';
  features: string[]; // PRD feature IDs implemented by this resource
  unique?: string[][];
  order?: string; // default order, e.g. "createdAt:desc"
}

// "name:s!*?" -> Field. types: s t i d b D T j e r. flags: ! required, * list column, ? searchable, # readonly, ~ hidden
const RE = /^(\w+):([stidbDTjer])(?:=([^!*?#~]*))?([!*?#~]*)$/;
const TYPES: Record<string, FieldType> = {
  s: 'string',
  t: 'text',
  i: 'int',
  d: 'decimal',
  b: 'bool',
  D: 'date',
  T: 'datetime',
  j: 'json',
  e: 'enum',
  r: 'ref',
};

export function parseField(spec: string): Field {
  const m = RE.exec(spec);
  if (!m) throw new Error(`Bad field spec: ${spec}`);
  const [, name, t, arg, flags] = m;
  const type = TYPES[t];
  const f: Field = {
    name,
    type,
    required: flags.includes('!'),
    list: flags.includes('*'),
    search: flags.includes('?'),
    readonly: flags.includes('#'),
    hidden: flags.includes('~'),
  };
  if (type === 'enum') f.values = (arg ?? '').split('|').filter(Boolean);
  if (type === 'ref') f.ref = arg;
  return f;
}

export const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
