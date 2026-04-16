import User from "../models/user.model.js";
import {
  createFailedTransaction,
  executeLedgerTransfer,
} from "../services/payment.service.js";
import { validateMpin } from "./txn.controller.js";

function getIdempotencyKey(req) {
  return req.headers["idempotency-key"] || req.body.idempotencyKey || null;
}

// @desc    Add mock money to wallet from linked bank
// @route   POST /api/wallet/add-money
// @access  Private
const addMoney = async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    const userId = req.user._id;
    const simulation = (req.body.simulation || "bank_success").toUpperCase();
    const idempotencyKey = getIdempotencyKey(req);

    if (amount <= 0) {
      return res.status(400).json({ message: "Amount should be valid" });
    }

    const user = await User.findById(userId);

    if (simulation === "BANK_FAILED") {
      const { transaction, idempotentReplay } = await createFailedTransaction({
        initiatedBy: userId,
        receiver: user,
        amount,
        type: "ADD_MONEY",
        note: "Wallet top-up failed",
        idempotencyKey,
        bankSimulation: "BANK_FAILED",
        failureReason: "Simulated bank debit failure",
        metadata: { topUpMode: "SIMULATION" },
      });

      return res.status(idempotentReplay ? 200 : 400).json({
        message: "Bank simulation failed. Wallet was not credited.",
        transaction,
        balance: user.balance,
        idempotentReplay,
      });
    }

    const { transaction, idempotentReplay, balances } = await executeLedgerTransfer({
      initiatedBy: userId,
      sender: null,
      receiver: user,
      amount,
      type: "ADD_MONEY",
      note: "Wallet top-up via bank simulation",
      idempotencyKey,
      bankSimulation: "BANK_SUCCESS",
      settlementStatus: "SETTLED",
      debitAccountCode: "bank_nodal_account",
      creditAccountCode: undefined,
      metadata: { topUpMode: "SIMULATION" },
    });

    res.status(idempotentReplay ? 200 : 201).json({
      message: `Successfully added ${amount} to wallet`,
      balance: balances?.receiverBalance ?? user.balance,
      transaction,
      idempotentReplay,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Pay Utility Bills (Recharge, Electricity)
// @route   POST /api/wallet/pay-bill
// @access  Private
const payBill = async (req, res) => {
  try {
    const { billerName, mpin } = req.body;
    const amount = Number(req.body.amount);
    const userId = req.user._id;

    if (!mpin) {
      return res.status(400).json({ message: "MPIN is required" });
    }

    const user = await User.findById(userId);

    await validateMpin(user, mpin);

    if (user.balance < amount) {
      return res.status(400).json({ message: "Insufficient wallet balance" });
    }

    const { transaction, balances, idempotentReplay } = await executeLedgerTransfer({
      initiatedBy: userId,
      sender: user,
      receiver: null,
      amount,
      type: "BILL_PAY",
      note: `Bill payment for ${billerName || "Unknown Utility"}`,
      idempotencyKey: getIdempotencyKey(req),
      billerName: billerName || "Unknown Utility",
      settlementStatus: "SETTLED",
      debitAccountCode: undefined,
      creditAccountCode: "utility_biller_pool",
    });

    res.status(idempotentReplay ? 200 : 201).json({
      message: `Bill paid successfully for ${billerName}`,
      balance: balances?.senderBalance ?? user.balance,
      transaction,
      idempotentReplay,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
};

export { addMoney, payBill };
