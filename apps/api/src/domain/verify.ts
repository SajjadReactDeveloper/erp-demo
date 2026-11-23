// Startup self-check: every action declared in the registry that does not simply change status must have a handler.
import { RESOURCES } from '@erp/shared';
import { handlers } from '../core/base';

const missing: string[] = [];
for (const r of RESOURCES) for (const a of r.actions) if (!a.to && !handlers[`${r.key}.${a.key}`]) missing.push(`${r.key}.${a.key}`);
if (missing.length) console.warn(`[domain] ${missing.length} action(s) without a handler:\n  ` + missing.join('\n  '));
else console.log('[domain] all registry actions have handlers');
