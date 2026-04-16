import crypto from "crypto";
import LedgerEntry from "../models/ledgerEntry.model.js";
import PaymentRequest from "../models/paymentRequest.model.js";
import Transaction from "../models/transaction.model.js";
import User from "../models/user.model.js";

function generatePublicId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function getAccountCode(user, fallbackCode) {
  if (!user) {
    return fallbackCode;
  }

  if (user.accountType === "MERCHANT") {
    return `${user.upiId || user._id}_merchant_wallet`;
  }

  return `${user.upiId || user._id}_wallet`;
}

function buildFingerprint(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
}

async function getIdempotentTransaction({ initiatedBy, idempotencyKey, fingerprint }) {
  if (!initiatedBy || !idempotencyKey) {
    return null;
  }

  const existing = await Transaction.findOne({
    initiatedBy,
    idempotencyKey,
  })
    .populate("sender", "name phone upiId accountType merchantProfile balance")
    .populate("receiver", "name phone upiId accountType merchantProfile balance");

  if (!existing) {
    return null;
  }

  if (existing.idempotencyFingerprint && existing.idempotencyFingerprint !== fingerprint) {
    const error = new Error("Idempotency key already used with different payload");
    error.statusCode = 409;
    throw error;
  }

  return existing;
}

async function createLedgerEntries({
  transaction,
  debitUser = null,
  creditUser = null,
  amount,
  narration,
  debitAccountCode,
  creditAccountCode,
}) {
  const [freshDebitUser, freshCreditUser] = await Promise.all([
    debitUser ? User.findById(debitUser._id) : null,
    creditUser ? User.findById(creditUser._id) : null,
  ]);

  if (freshDebitUser) {
    freshDebitUser.balance -= amount;
    await freshDebitUser.save();
  }

  if (freshCreditUser) {
    freshCreditUser.balance += amount;
    await freshCreditUser.save();
  }

  const ledgerEntries = await LedgerEntry.insertMany([
    {
      transaction: transaction._id,
      accountOwner: freshDebitUser?._id || null,
      accountCode: debitAccountCode || getAccountCode(debitUser, "system_debit_account"),
      entryType: "DEBIT",
      amount,
      narration,
      balanceAfter: freshDebitUser?.balance,
    },
    {
      transaction: transaction._id,
      accountOwner: freshCreditUser?._id || null,
      accountCode: creditAccountCode || getAccountCode(creditUser, "system_credit_account"),
      entryType: "CREDIT",
      amount,
      narration,
      balanceAfter: freshCreditUser?.balance,
    },
  ]);

  return { ledgerEntries, freshDebitUser, freshCreditUser };
}

async function executeLedgerTransfer({
  initiatedBy,
  sender = null,
  receiver = null,
  amount,
  type,
  note,
  idempotencyKey,
  paymentRequest = null,
  relatedTransaction = null,
  qrPayload = null,
  billerName = null,
  metadata = {},
  bankSimulation = null,
  settlementStatus = "PENDING",
  debitAccountCode,
  creditAccountCode,
}) {
  const fingerprint = buildFingerprint({
    sender: sender?._id?.toString() || null,
    receiver: receiver?._id?.toString() || null,
    amount,
    type,
    note: note || null,
    paymentRequest: paymentRequest?._id?.toString() || paymentRequest || null,
    relatedTransaction: relatedTransaction?._id?.toString() || relatedTransaction || null,
    qrPayload,
    billerName,
    bankSimulation,
    metadata,
  });

  const existing = await getIdempotentTransaction({
    initiatedBy,
    idempotencyKey,
    fingerprint,
  });

  if (existing) {
    return { transaction: existing, idempotentReplay: true };
  }

  const transaction = await Transaction.create({
    transactionId: generatePublicId("txn"),
    sender: sender?._id || null,
    receiver: receiver?._id || null,
    initiatedBy: initiatedBy || null,
    amount,
    type,
    note,
    idempotencyKey: idempotencyKey || null,
    idempotencyFingerprint: idempotencyKey ? fingerprint : null,
    status: "PENDING",
    paymentRequest: paymentRequest?._id || paymentRequest || null,
    relatedTransaction: relatedTransaction?._id || relatedTransaction || null,
    qrPayload,
    billerName,
    metadata,
    bankSimulation,
    settlement: { status: settlementStatus, settledAt: null },
  });

  transaction.status = "PROCESSING";
  await transaction.save();

  try {
    const { ledgerEntries, freshDebitUser, freshCreditUser } = await createLedgerEntries({
      transaction,
      debitUser: sender,
      creditUser: receiver,
      amount,
      narration: note || `${type} for INR ${amount}`,
      debitAccountCode,
      creditAccountCode,
    });

    transaction.status = "SUCCESS";
    transaction.metadata = {
      ...transaction.metadata,
      ledgerEntryIds: ledgerEntries.map((entry) => entry._id),
    };
    await transaction.save();

    return {
      transaction,
      idempotentReplay: false,
      balances: {
        senderBalance: freshDebitUser?.balance,
        receiverBalance: freshCreditUser?.balance,
      },
    };
  } catch (error) {
    transaction.status = "FAILED";
    transaction.failureReason = error.message;
    await transaction.save();
    throw error;
  }
}

async function createFailedTransaction({
  initiatedBy,
  sender = null,
  receiver = null,
  amount,
  type,
  note,
  idempotencyKey,
  paymentRequest = null,
  relatedTransaction = null,
  qrPayload = null,
  billerName = null,
  metadata = {},
  bankSimulation = null,
  failureReason,
}) {
  const fingerprint = buildFingerprint({
    sender: sender?._id?.toString() || null,
    receiver: receiver?._id?.toString() || null,
    amount,
    type,
    note: note || null,
    paymentRequest: paymentRequest?._id?.toString() || paymentRequest || null,
    relatedTransaction: relatedTransaction?._id?.toString() || relatedTransaction || null,
    qrPayload,
    billerName,
    bankSimulation,
    metadata,
    failed: true,
  });

  const existing = await getIdempotentTransaction({
    initiatedBy,
    idempotencyKey,
    fingerprint,
  });

  if (existing) {
    return { transaction: existing, idempotentReplay: true };
  }

  const transaction = await Transaction.create({
    transactionId: generatePublicId("txn"),
    sender: sender?._id || null,
    receiver: receiver?._id || null,
    initiatedBy: initiatedBy || null,
    amount,
    type,
    note,
    idempotencyKey: idempotencyKey || null,
    idempotencyFingerprint: idempotencyKey ? fingerprint : null,
    paymentRequest: paymentRequest?._id || paymentRequest || null,
    relatedTransaction: relatedTransaction?._id || relatedTransaction || null,
    qrPayload,
    billerName,
    metadata,
    bankSimulation,
    status: "FAILED",
    failureReason,
  });

  return { transaction, idempotentReplay: false };
}

async function resolveUserByIdentifier(identifier, filter = {}) {
  return User.findOne({
    $and: [
      filter,
      {
        $or: [{ phone: identifier }, { upiId: identifier }, { email: identifier }],
      },
    ],
  });
}

async function listUserTransactions(userId) {
  return Transaction.find({
    $or: [{ sender: userId }, { receiver: userId }, { initiatedBy: userId }],
  })
    .populate("sender", "name phone upiId accountType merchantProfile")
    .populate("receiver", "name phone upiId accountType merchantProfile")
    .populate("relatedTransaction", "transactionId type amount status")
    .populate("paymentRequest", "amount status note")
    .sort({ createdAt: -1 });
}

async function listUserLedger(userId) {
  return LedgerEntry.find({ accountOwner: userId })
    .populate("transaction", "transactionId type amount status createdAt")
    .sort({ createdAt: -1 });
}

async function listUserPaymentRequests(userId) {
  return PaymentRequest.find({
    $or: [{ requester: userId }, { payer: userId }],
  })
    .populate("requester", "name phone upiId")
    .populate("payer", "name phone upiId")
    .populate("relatedTransaction", "transactionId amount status")
    .sort({ createdAt: -1 });
}

export {
  executeLedgerTransfer,
  createFailedTransaction,
  generatePublicId,
  getAccountCode,
  listUserLedger,
  listUserPaymentRequests,
  listUserTransactions,
  resolveUserByIdentifier,
};
