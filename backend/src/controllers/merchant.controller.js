import Transaction from "../models/transaction.model.js";
import User from "../models/user.model.js";
import { validateMpin } from "./txn.controller.js";
import { executeLedgerTransfer, resolveUserByIdentifier } from "../services/payment.service.js";

function getIdempotencyKey(req) {
  return req.headers["idempotency-key"] || req.body.idempotencyKey || null;
}

const createMerchantAccount = async (req, res) => {
  try {
    const { displayName, category } = req.body;
    const user = await User.findById(req.user._id);

    user.accountType = "MERCHANT";
    user.merchantProfile = {
      displayName: displayName || user.name,
      category: category || "General",
      settlementEnabled: true,
      settlementCycle: "T+1",
    };

    if (!user.upiId || !user.upiId.endsWith("@merchant")) {
      const merchantHandle = (displayName || user.name)
        .replace(/\s+/g, "")
        .toLowerCase();
      user.upiId = `${merchantHandle}${Math.floor(Math.random() * 1000)}@merchant`;
    }

    await user.save();

    res.json({
      message: "Merchant account enabled successfully",
      merchant: user,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getMerchantProfile = async (req, res) => {
  try {
    const merchant = await User.findById(req.user._id).select("-password -mpin");
    if (!merchant || merchant.accountType !== "MERCHANT") {
      return res.status(404).json({ message: "Merchant profile not found" });
    }

    res.json(merchant);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const payMerchant = async (req, res) => {
  try {
    const { merchantIdentifier, mpin, note } = req.body;
    const amount = Number(req.body.amount);

    if (!merchantIdentifier || !amount || !mpin) {
      return res.status(400).json({ message: "merchantIdentifier, amount and mpin are required" });
    }

    const payer = await User.findById(req.user._id);
    await validateMpin(payer, mpin);

    const merchant = await resolveUserByIdentifier(merchantIdentifier, { accountType: "MERCHANT" });
    if (!merchant) {
      return res.status(404).json({ message: "Merchant not found" });
    }

    if (payer.balance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const { transaction, idempotentReplay } = await executeLedgerTransfer({
      initiatedBy: payer._id,
      sender: payer,
      receiver: merchant,
      amount,
      type: "MERCHANT_PAYMENT",
      note: note || `Payment to ${merchant.merchantProfile?.displayName || merchant.name}`,
      idempotencyKey: getIdempotencyKey(req),
      settlementStatus: "PENDING",
      metadata: {
        merchantConfirmed: true,
      },
    });

    res.status(idempotentReplay ? 200 : 201).json({
      message: "Merchant payment confirmed",
      transaction,
      idempotentReplay,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
};

const settleMerchantPayment = async (req, res) => {
  try {
    const merchant = await User.findById(req.user._id);
    if (!merchant || merchant.accountType !== "MERCHANT") {
      return res.status(403).json({ message: "Only merchant accounts can settle payments" });
    }

    const transaction = await Transaction.findById(req.params.transactionId);
    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    if (transaction.receiver?.toString() !== merchant._id.toString()) {
      return res.status(403).json({ message: "This payment does not belong to your merchant account" });
    }

    if (transaction.type !== "MERCHANT_PAYMENT" && transaction.type !== "QR_PAYMENT") {
      return res.status(400).json({ message: "Only merchant or QR payments can be settled" });
    }

    transaction.settlement = {
      status: "SETTLED",
      settledAt: new Date(),
    };
    await transaction.save();

    res.json({
      message: "Merchant settlement completed",
      transaction,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { createMerchantAccount, getMerchantProfile, payMerchant, settleMerchantPayment };
