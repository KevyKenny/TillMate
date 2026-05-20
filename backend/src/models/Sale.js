const mongoose = require('mongoose');

const saleSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientSaleId: { type: Number, required: true },
    total: { type: Number, required: true },
    saleDate: { type: String },
    paidAmount: { type: Number },
    changeAmount: { type: Number },
    paymentMethod: { type: String, default: 'Cash' },
    clientCreatedAt: { type: String },
    reversedTotal: { type: Number, default: 0 },
  },
  { timestamps: true }
);

saleSchema.index({ userId: 1, clientSaleId: 1 }, { unique: true });

module.exports = mongoose.model('Sale', saleSchema);
