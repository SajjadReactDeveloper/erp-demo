// Tables the AI assistant may query (free-form questions). Read-only, company-scoped, further limited by the asker's read permissions.
export const ASSISTANT_KEYS = [
  'Customer', 'Supplier', 'Part', 'Brand', 'Category', 'Vehicle',
  'Request', 'RequestLine', 'Quotation', 'QuotationLine', 'SalesOrder', 'SalesOrderLine', 'DeliveryNote',
  'Invoice', 'InvoiceLine', 'Receipt', 'ReceiptAllocation', 'CreditProfile', 'CreditHold', 'PromiseToPay',
  'Rfq', 'RfqLine', 'SupplierQuote', 'SupplierQuoteLine', 'PurchaseOrder', 'PoLine', 'GoodsReceipt', 'SupplierBill', 'SupplierClaim',
  'Expense', 'ExpenseCategory', 'SalesTarget', 'LostReason', 'Activity',
] as const;
/** PascalCase model name -> snake_case table name (matches the Prisma @@map convention). */
export const tableOf = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
