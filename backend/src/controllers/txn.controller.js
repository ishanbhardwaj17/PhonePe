import User from "../models/user.model.js";
import bcrypt from "bcrypt";
import {
  executeLedgerTransfer,
  listUserLedger,
  listUserTransactions,
  resolveUserByIdentifier,
} from "../services/payment.service.js";
import Transaction from "../models/transaction.model.js";

function getIdempotencyKey(req) {
  return req.headers["idempotency-key"] || req.body.idempotencyKey || null;
}

async function validateMpin(user, mpin) {
  if (!user.mpin) {
    const error = new Error("Please setup your MPIN first");
    error.statusCode = 400;
    throw error;
  }

  const isMpinCorrect = await bcrypt.compare(mpin.toString(), user.mpin);
  if (!isMpinCorrect) {
    const error = new Error("Incorrect MPIN");
    error.statusCode = 401;
    throw error;
  }
}

async function sendMoney(req, res) {
  try {
    const { receiverIdentifier, mpin, note } = req.body;
    const amount = Number(req.body.amount);
    const senderId = req.user._id;
    const idempotencyKey = getIdempotencyKey(req);

    if (!receiverIdentifier || !amount || !mpin) {
      return res.status(400).json({
        message: "all fields are required !",
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        message: "Amount must be greater than zero",
      });
    }
    const sender = await User.findById(senderId);

    await validateMpin(sender, mpin);

    const receiver = await resolveUserByIdentifier(receiverIdentifier);

    if (!receiver) {
      return res
        .status(404)
        .json({ message: "Receiver not found (Invalid Phone/UPI)" });
    }

    if (senderId.toString() === receiver._id.toString()) {
      return res
        .status(400)
        .json({ message: "You cannot send money to yourself" });
    }

    if (sender.balance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const { transaction, idempotentReplay, balances } = await executeLedgerTransfer({
      initiatedBy: senderId,
      sender,
      receiver,
      amount,
      type: receiver.accountType === "MERCHANT" ? "MERCHANT_PAYMENT" : "TRANSFER",
      note: note || `Transfer to ${receiver.name}`,
      idempotencyKey,
      settlementStatus: receiver.accountType === "MERCHANT" ? "PENDING" : "SETTLED",
      metadata: {
        channel: receiver.accountType === "MERCHANT" ? "MERCHANT" : "P2P",
      },
    });

    res.status(idempotentReplay ? 200 : 201).json({
      message:
        receiver.accountType === "MERCHANT"
          ? "Merchant payment successful"
          : "Money transfer successful",
      transaction,
      newBalance: balances?.senderBalance ?? sender.balance,
      idempotentReplay,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
}

const getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user._id;

    const transactions = await listUserTransactions(userId);

    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getLedgerHistory = async (req, res) => {
  try {
    const ledgerEntries = await listUserLedger(req.user._id);
    res.json(ledgerEntries);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const refundTransaction = async (req, res) => {
  try {
    const { mpin, note } = req.body;
    const requestedAmount = req.body.amount ? Number(req.body.amount) : null;
    const refundInitiator = await User.findById(req.user._id);

    await validateMpin(refundInitiator, mpin);

    const originalTransaction = await Transaction.findById(req.params.transactionId)
      .populate("sender", "name upiId phone accountType balance")
      .populate("receiver", "name upiId phone accountType balance");

    if (!originalTransaction) {
      return res.status(404).json({ message: "Original transaction not found" });
    }

    if (originalTransaction.status !== "SUCCESS") {
      return res.status(400).json({ message: "Only successful transactions can be refunded" });
    }

    if (!originalTransaction.receiver || !originalTransaction.sender) {
      return res.status(400).json({ message: "This transaction is not eligible for refund" });
    }

    if (originalTransaction.receiver._id.toString() !== refundInitiator._id.toString()) {
      return res.status(403).json({ message: "Only the payment receiver can initiate a refund" });
    }

    const refundableAmount =
      originalTransaction.amount - (originalTransaction.refundedAmount || 0);
    const refundAmount = requestedAmount || refundableAmount;

    if (refundAmount <= 0 || refundAmount > refundableAmount) {
      return res.status(400).json({ message: "Refund amount exceeds refundable limit" });
    }

    if (refundInitiator.balance < refundAmount) {
      return res.status(400).json({ message: "Insufficient balance to issue refund" });
    }

    const { transaction } = await executeLedgerTransfer({
      initiatedBy: refundInitiator._id,
      sender: originalTransaction.receiver,
      receiver: originalTransaction.sender,
      amount: refundAmount,
      type: "REFUND",
      note: note || `Refund against ${originalTransaction.transactionId}`,
      idempotencyKey: getIdempotencyKey(req),
      relatedTransaction: originalTransaction._id,
      settlementStatus: "SETTLED",
      metadata: {
        refundFor: originalTransaction.transactionId,
      },
    });

    originalTransaction.refundedAmount += refundAmount;
    if (originalTransaction.refundedAmount >= originalTransaction.amount) {
      originalTransaction.status = "REVERSED";
    }
    await originalTransaction.save();

    res.status(201).json({
      message: "Refund processed successfully",
      transaction,
      originalTransaction,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
};

export { sendMoney, getTransactionHistory, getLedgerHistory, refundTransaction, validateMpin };
