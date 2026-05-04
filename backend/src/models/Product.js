const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientProductId: { type: Number, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    stock: { type: Number, required: true, default: 0 },
    category: { type: String, default: 'General' },
    costPrice: { type: Number, default: null },
    deletedAt: { type: Date, default: null },
    clientCreatedAt: { type: String },
    clientUpdatedAt: { type: String },
  },
  { timestamps: true }
);

productSchema.index({ userId: 1, clientProductId: 1 }, { unique: true });

module.exports = mongoose.model('Product', productSchema);
