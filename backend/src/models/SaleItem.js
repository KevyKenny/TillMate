const mongoose = require('mongoose');

const saleItemSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    saleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true, index: true },
    clientSaleId: { type: Number, required: true },
    clientItemIndex: { type: Number, required: true, default: 0 },
    productId: { type: Number, required: true },
    productName: { type: String },
    quantity: { type: Number, required: true },
    unitPrice: { type: Number, required: true },
    reversedQuantity: { type: Number, default: 0 },
    /** Stable SQLite `sale_items.id` for restore / reversals */
    clientSaleItemId: { type: Number, default: null },
  },
  { timestamps: true }
);

saleItemSchema.index({ saleId: 1, clientItemIndex: 1 }, { unique: true });

module.exports = mongoose.model('SaleItem', saleItemSchema);
