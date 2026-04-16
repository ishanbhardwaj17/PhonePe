import mongoose from "mongoose";

const settlementSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["PENDING", "SETTLED"],
      default: "PENDING",
    },
    settledAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const transactionSchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      unique: true,
      index: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    type: {
      type: String,
      enum: [
        "TRANSFER",
        "ADD_MONEY",
        "WITHDRAW",
        "BILL_PAY",
        "MERCHANT_PAYMENT",
        "QR_PAYMENT",
        "REFUND",
        "PAYMENT_REQUEST",
        "SETTLEMENT",
      ],
      default: "TRANSFER",
    },
    billerName: {
      type: String,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "INR",
    },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "SUCCESS", "FAILED", "REVERSED"],
      default: "PENDING",
    },
    idempotencyKey: {
      type: String,
      sparse: true,
      index: true,
    },
    idempotencyFingerprint: {
      type: String,
    },
    paymentRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PaymentRequest",
      default: null,
    },
    relatedTransaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },
    qrPayload: {
      type: String,
    },
    note: {
      type: String,
      trim: true,
    },
    failureReason: {
      type: String,
      trim: true,
    },
    bankSimulation: {
      type: String,
      enum: ["BANK_SUCCESS", "BANK_FAILED", null],
      default: null,
    },
    refundedAmount: {
      type: Number,
      default: 0,
    },
    settlement: {
      type: settlementSchema,
      default: () => ({ status: "PENDING", settledAt: null }),
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

transactionSchema.index(
  { initiatedBy: 1, idempotencyKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      initiatedBy: { $exists: true },
      idempotencyKey: { $type: "string" },
    },
  },
);

const Transaction = mongoose.model("Transaction", transactionSchema);
export default Transaction;
