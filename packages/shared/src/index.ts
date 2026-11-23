import { ResourceDef } from './fields';
import { MODULES } from './registry/define';
import { platform } from './registry/platform';
import { masterdata, crm } from './registry/masterdata';
import { sales } from './registry/sales';
import { procurement, marketplace } from './registry/procurement';
import { logistics } from './registry/logistics';
import { finance, credit } from './registry/finance';
import { inventory, pos, workshop, vehicle, ai } from './registry/r3';

export * from './fields';
export * from './i18n';
export { MODULES } from './registry/define';
export * from './permissions';
export * from './assistant';

export const RESOURCES: ResourceDef[] = [
  ...platform, ...masterdata, ...crm, ...sales, ...procurement, ...marketplace, ...logistics,
  ...finance, ...credit, ...inventory, ...pos, ...workshop, ...vehicle, ...ai,
];

export const BY_KEY: Record<string, ResourceDef> = Object.fromEntries(RESOURCES.map((r) => [r.key, r]));
export const BY_SLUG: Record<string, ResourceDef> = Object.fromEntries(RESOURCES.map((r) => [r.slug, r]));

export function validateRegistry(): string[] {
  const errs: string[] = [];
  for (const r of RESOURCES) {
    for (const f of r.fields) if (f.type === 'ref' && !BY_KEY[f.ref!]) errs.push(`${r.key}.${f.name} -> unknown ref ${f.ref}`);
    for (const c of r.children) if (!BY_KEY[c.key]) errs.push(`${r.key} child ${c.key} unknown`);
    if (!r.fields.find((f) => f.name === r.label)) errs.push(`${r.key} label field ${r.label} missing`);
  }
  return errs;
}

export const MODULE_LIST = MODULES;
