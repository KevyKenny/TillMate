const mongoose = require('mongoose');

const FINANCE_TYPES = [
  'expense',
  'withdrawal',
  'breakage',
  'breakage_reversal',
  'capital',
  'profit',
  'stock_purchase',
  'stock_adjustment',
  'capital_adjustment',
  'stock_reversal',
  'sale_reversal',
  'profit_reversal',
];

const financeTransactionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientFinanceId: { type: Number, required: true },
    type: { type: String, enum: FINANCE_TYPES, required: true },
    amount: { type: Number, required: true },
    occurredOn: { type: String, required: true },
    description: { type: String, default: '' },
    notes: { type: String, default: null },
    productId: { type: Number, default: null },
    productName: { type: String, default: null },
    quantity: { type: Number, default: null },
    withdrawnBy: { type: String, default: null },
    capitalSource: { type: String, default: null },
    /** Local SQLite `sales.id` */
    saleId: { type: Number, default: null },
    hiddenAt: { type: String, default: null },
    clientCreatedAt: { type: String },
    recoversFinanceId: { type: Number, default: null },
  },
  { timestamps: true }
);

financeTransactionSchema.index({ userId: 1, clientFinanceId: 1 }, { unique: true });

const FinanceTransaction = mongoose.model('FinanceTransaction', financeTransactionSchema);
FinanceTransaction.FINANCE_TYPES = FINANCE_TYPES;
module.exports = FinanceTransaction;
