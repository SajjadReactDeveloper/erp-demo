import { R, act } from './define';

export const platform = [
  R('Company', 'platform', 'Company', 'الشركة', 'name', 'building', [
    'name:s!*?', 'nameAr:s?', 'vatNumber:s*', 'crNumber:s', 'address:s', 'city:s', 'phone:s', 'email:s', 'currency:s', 'logoUrl:s', 'defaultLocale:e=ar|en', 'hijriDates:b', 'primaryColor:s',
  ], { global: true, plural: ['Companies', 'الشركات'], f: ['PLT-03'] }),
  R('Branch', 'platform', 'Branch', 'الفرع', 'name', 'git-branch', ['code:s!*?', 'name:s!*?', 'nameAr:s', 'address:s', 'city:s', 'phone:s', 'isActive:b*'], { plural: ['Branches', 'الفروع'], f: ['PLT-03'] }),
  R('Warehouse', 'platform', 'Warehouse', 'المستودع', 'name', 'warehouse', ['code:s!*?', 'name:s!*?', 'branchId:r=Branch*', 'isActive:b*'], { f: ['PLT-03', 'INV-01'] }),
  R('CostCenter', 'platform', 'Cost center', 'مركز التكلفة', 'name', 'layers', ['code:s!*?', 'name:s!*?', 'isActive:b*'], { f: ['PLT-03'] }),
  R('Role', 'platform', 'Role', 'الدور', 'name', 'shield', ['name:s!*?', 'description:s*', 'permissions:j', 'isSystem:b#'], { f: ['PLT-01'], unique: [['companyId', 'name']] }),
  R('User', 'platform', 'User', 'المستخدم', 'name', 'user', [
    'email:s!*?', 'name:s!*?', 'phone:s', 'locale:e=ar|en', 'roleId:r=Role*', 'kind:e=staff|customer|supplier*', 'customerId:r=Customer', 'supplierId:r=Supplier', 'branchId:r=Branch',
    'passwordHash:s#~', 'mfaEnabled:b#', 'mfaSecret:s#~', 'isActive:b*', 'lastLoginAt:T#', 'failedLogins:i#~', 'lockedUntil:T#~', 'delegateToId:r=User', 'delegateUntil:T', 'permissionsExtra:j',
  ], { f: ['PLT-01', 'PLT-02', 'PLT-04', 'CPT-02'], unique: [['email']] }),
  R('Setting', 'platform', 'Setting', 'الإعداد', 'key', 'sliders', ['key:s!*?', 'value:j', 'description:s*', 'version:i#'], { f: ['PLT-10'], unique: [['companyId', 'key']], noDelete: true }),
  R('DocSequence', 'platform', 'Document sequence', 'تسلسل المستندات', 'docType', 'hash', ['docType:s!*', 'branchId:s', 'year:i!', 'nextNo:i!'], { sys: true, f: ['PLT-05'] }),
  R('Template', 'platform', 'Document template', 'قالب المستند', 'name', 'file-text', [
    'docType:e=quotation|purchase_order|delivery_note|invoice|statement|label|receipt*', 'name:s!*?', 'language:e=ar|en*', 'body:t!', 'isDefault:b*',
  ], { f: ['PLT-05'] }),
  R('ApprovalRule', 'platform', 'Approval rule', 'قاعدة الاعتماد', 'name', 'check-circle', [
    'type:e=margin|credit|purchase_order|discount|return|writeoff|expense|price_override*', 'name:s!*?', 'minAmount:d*', 'maxAmount:d', 'customerTier:s', 'steps:j', 'escalateAfterHours:i', 'isActive:b*',
  ], { f: ['PLT-04', 'CRD-04'] }),
  R('ApprovalRequest', 'platform', 'Approval request', 'طلب اعتماد', 'type', 'inbox', [
    'type:s!*', 'refType:s!*', 'refId:s!', 'amount:d*', 'reason:t', 'status:e=pending|approved|rejected|escalated|cancelled*', 'currentStep:i#', 'steps:j#', 'requestedById:r=User*', 'decidedById:r=User#',
    'decidedAt:T#', 'decisionNote:t', 'dueAt:T',
  ], {
    f: ['PLT-04', 'CRD-04'],
    actions: [act('approve', 'Approve', 'اعتماد', ['pending', 'escalated']), act('reject', 'Reject', 'رفض', ['pending', 'escalated'], 'rejected', { danger: true }), act('delegate', 'Delegate', 'تفويض', ['pending', 'escalated'])],
  }),
  R('ApprovalAction', 'platform', 'Approval action', 'إجراء اعتماد', 'action', 'list-checks', ['approvalId:r=ApprovalRequest!*', 'step:i', 'actorId:r=User*', 'action:e=approved|rejected|escalated|delegated*', 'note:t'], { sys: true, immutable: true, f: ['PLT-04'] }),
  R('Attachment', 'platform', 'Attachment', 'المرفق', 'fileName', 'paperclip', [
    'refType:s!*', 'refId:s!*', 'fileName:s!*?', 'mimeType:s', 'size:i', 'storageKey:s#~', 'kind:e=document|photo|signature|quotation|invoice|other*', 'uploadedById:r=User#', 'scanStatus:e=pending|clean|infected',
  ], { f: ['PLT-08'] }),
  R('AuditLog', 'platform', 'Audit log', 'سجل التدقيق', 'entity', 'history', [
    'userId:s*', 'entity:s!*?', 'entityId:s*', 'action:e=create|update|delete|action|login|logout|deny|export*', 'before:j', 'after:j', 'ip:s', 'requestId:s',
  ], { immutable: true, f: ['PLT-07'], order: 'createdAt:desc' }),
  R('Notification', 'platform', 'Notification', 'الإشعار', 'title', 'bell', [
    'userId:r=User!*', 'type:s*', 'title:s!*?', 'body:t', 'link:s', 'read:b*', 'channel:e=inapp|email|sms|whatsapp', 'severity:e=info|warning|critical*',
  ], { f: ['NTF-03'] }),
  R('NotificationRule', 'platform', 'Notification rule', 'قاعدة الإشعار', 'event', 'bell-ring', [
    'event:s!*?', 'roleId:r=Role*', 'channel:e=inapp|email|sms|whatsapp*', 'language:e=ar|en|user', 'templateKey:s', 'isActive:b*',
  ], { f: ['NTF-04'] }),
  R('OutboxEvent', 'platform', 'Outbox event', 'حدث صادر', 'type', 'send', [
    'type:s!*', 'payload:j', 'status:e=pending|done|failed*', 'attempts:i', 'nextRunAt:T', 'error:t',
  ], { sys: true, f: ['PLT-07'] }),
  R('IntegrationMessage', 'platform', 'Integration message', 'رسالة تكامل', 'provider', 'plug', [
    'provider:s!*?', 'direction:e=out|in*', 'endpoint:s', 'requestBody:j', 'responseBody:j', 'status:e=ok|error|retry|dead*', 'error:t', 'attempts:i', 'idempotencyKey:s',
  ], {
    f: ['PLT-10'],
    actions: [act('replay', 'Replay', 'إعادة المحاولة', ['error', 'dead'], 'retry')],
  }),
  R('ImportJob', 'platform', 'Import job', 'مهمة استيراد', 'fileName', 'upload', [
    'entity:s!*', 'fileName:s*', 'status:e=validated|completed|failed|rolled_back*', 'total:i', 'okRows:i', 'failedRows:i', 'errors:j', 'dryRun:b',
  ], { f: ['PLT-11'] }),
  R('ReportSchedule', 'platform', 'Report schedule', 'جدولة تقرير', 'name', 'calendar-clock', [
    'name:s!*?', 'report:s!*', 'format:e=pdf|xlsx|csv*', 'cron:s!', 'recipients:j', 'filters:j', 'isActive:b*', 'lastRunAt:T#',
  ], { f: ['RPT-09'] }),
];
