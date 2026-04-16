import User from "../models/user.model.js";
import { validateMpin } from "./txn.controller.js";
import { executeLedgerTransfer, resolveUserByIdentifier } from "../services/payment.service.js";

function getIdempotencyKey(req) {
  return req.headers["idempotency-key"] || req.body.idempotencyKey || null;
}

function parseQrPayload(qrPayload) {
  const parsed = new URL(qrPayload);
  return {
    payeeUpiId: parsed.searchParams.get("pa"),
    payeeName: parsed.searchParams.get("pn"),
    amount: Number(parsed.searchParams.get("am")),
    note: parsed.searchParams.get("tn") || "",
  };
}

const generateQrCode = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const amount = Number(req.body.amount);
    const payeeName = req.body.payeeName || user.merchantProfile?.displayName || user.name;
    const note = req.body.note || "PhonePe payment";

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Valid amount is required" });
    }

    const qrPayload = `upi://pay?pa=${encodeURIComponent(user.upiId)}&pn=${encodeURIComponent(
      payeeName,
    )}&am=${encodeURIComponent(amount)}&tn=${encodeURIComponent(note)}`;

    res.json({
      message: "QR payload generated successfully",
      qrPayload,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const payViaQr = async (req, res) => {
  try {
    const { qrPayload, mpin } = req.body;
    if (!qrPayload || !mpin) {
      return res.status(400).json({ message: "qrPayload and mpin are required" });
    }

    const { payeeUpiId, amount, note } = parseQrPayload(qrPayload);

    const payer = await User.findById(req.user._id);
    await validateMpin(payer, mpin);

    const payee = await resolveUserByIdentifier(payeeUpiId);
    if (!payee) {
      return res.status(404).json({ message: "QR payee not found" });
    }

    if (payer.balance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const { transaction, idempotentReplay } = await executeLedgerTransfer({
      initiatedBy: payer._id,
      sender: payer,
      receiver: payee,
      amount,
      type: "QR_PAYMENT",
      note: note || `QR payment to ${payee.name}`,
      idempotencyKey: getIdempotencyKey(req),
      qrPayload,
      settlementStatus: payee.accountType === "MERCHANT" ? "PENDING" : "SETTLED",
      metadata: {
        channel: "QR",
      },
    });

    res.status(idempotentReplay ? 200 : 201).json({
      message: "QR payment successful",
      transaction,
      idempotentReplay,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
};

export { generateQrCode, payViaQr };
