// models/Transaction.js
//
// Append-only ledger entry. This is the source of truth for wallet
// balance — never mutate a balance field directly, only ever from a
// verified transaction like this one settling to "completed".

const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["deposit", "withdrawal"], required: true },
    amount: { type: Number, required: true },
    phone: { type: String, required: true },
    status: { type: String, enum: ["pending", "completed", "failed"], default: "pending" },

    checkoutRequestId: { type: String, index: true },
    merchantRequestId: String,

    resultCode: Number,
    resultDesc: String,
    mpesaReceiptNumber: String,
  },
  { timestamps: true }
);

module.exports = mongoose.models.Transaction || mongoose.model("Transaction", transactionSchema);

