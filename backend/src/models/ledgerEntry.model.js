import mongoose from "mongoose";

const ledgerEntrySchema = new mongoose.Schema(
  {
    transaction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
      index: true,
    },
    accountOwner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    accountCode: {
      type: String,
      required: true,
      trim: true,
    },
    entryType: {
      type: String,
      enum: ["DEBIT", "CREDIT"],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "INR",
    },
    narration: {
      type: String,
      trim: true,
    },
    balanceAfter: {
      type: Number,
    },
  },
  {
    timestamps: true,
  },
);

const LedgerEntry = mongoose.model("LedgerEntry", ledgerEntrySchema);
export default LedgerEntry;
