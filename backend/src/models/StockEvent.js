const mongoose = require('mongoose');

const STOCK_EVENT_TYPES = ['stock_addition', 'stock_edition', 'sale', 'breakage', 'adjustment'];

const stockEventSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    clientStockEventId: { type: Number, required: true },
    /** Local SQLite `products.id` */
    productId: { type: Number, required: true },
    eventType: { type: String, enum: STOCK_EVENT_TYPES, required: true },
    quantityDelta: { type: Number, required: true },
    unitCost: { type: Number, default: null },
    referenceType: { type: String, default: null },
    referenceId: { type: Number, default: null },
    notes: { type: String, default: null },
    clientCreatedAt: { type: String },
  },
  { timestamps: true }
);

stockEventSchema.index({ userId: 1, clientStockEventId: 1 }, { unique: true });

const StockEvent = mongoose.model('StockEvent', stockEventSchema);
StockEvent.STOCK_EVENT_TYPES = STOCK_EVENT_TYPES;
module.exports = StockEvent;
