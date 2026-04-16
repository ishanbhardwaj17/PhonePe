import PaymentRequest from "../models/paymentRequest.model.js";
import User from "../models/user.model.js";
import { validateMpin } from "./txn.controller.js";
import {
  executeLedgerTransfer,
  listUserPaymentRequests,
  resolveUserByIdentifier,
} from "../services/payment.service.js";

function getIdempotencyKey(req) {
  return req.headers["idempotency-key"] || req.body.idempotencyKey || null;
}

const createPaymentRequest = async (req, res) => {
  try {
    const { payerIdentifier, note } = req.body;
    const amount = Number(req.body.amount);
    const requesterId = req.user._id;

    if (!payerIdentifier || !amount || amount <= 0) {
      return res.status(400).json({ message: "payerIdentifier and valid amount are required" });
    }

    const payer = await resolveUserByIdentifier(payerIdentifier);
    if (!payer) {
      return res.status(404).json({ message: "Payer not found" });
    }

    if (payer._id.toString() === requesterId.toString()) {
      return res.status(400).json({ message: "You cannot request money from yourself" });
    }

    const paymentRequest = await PaymentRequest.create({
      requester: requesterId,
      payer: payer._id,
      amount,
      note,
    });

    res.status(201).json({
      message: "Payment request created successfully",
      paymentRequest,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const listRequests = async (req, res) => {
  try {
    const requests = await listUserPaymentRequests(req.user._id);
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const respondToRequest = async (req, res) => {
  try {
    const { action } = req.body;
    const request = await PaymentRequest.findById(req.params.requestId);

    if (!request) {
      return res.status(404).json({ message: "Payment request not found" });
    }

    if (request.payer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the payer can respond to this request" });
    }

    if (request.status !== "PENDING") {
      return res.status(400).json({ message: "Only pending requests can be updated" });
    }

    if (action === "ACCEPT") {
      request.status = "ACCEPTED";
    } else if (action === "REJECT") {
      request.status = "REJECTED";
    } else {
      return res.status(400).json({ message: "action must be ACCEPT or REJECT" });
    }

    await request.save();

    res.json({
      message: `Payment request ${request.status.toLowerCase()}`,
      paymentRequest: request,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const payRequest = async (req, res) => {
  try {
    const { mpin } = req.body;
    const request = await PaymentRequest.findById(req.params.requestId)
      .populate("requester", "name upiId phone accountType balance")
      .populate("payer", "name upiId phone accountType balance");

    if (!request) {
      return res.status(404).json({ message: "Payment request not found" });
    }

    if (request.payer._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Only the payer can pay this request" });
    }

    if (!["PENDING", "ACCEPTED"].includes(request.status)) {
      return res.status(400).json({ message: "This request is no longer payable" });
    }

    const payer = await User.findById(req.user._id);
    await validateMpin(payer, mpin);

    if (payer.balance < request.amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    const { transaction, idempotentReplay } = await executeLedgerTransfer({
      initiatedBy: payer._id,
      sender: payer,
      receiver: request.requester,
      amount: request.amount,
      type: "PAYMENT_REQUEST",
      note: request.note || `Payment request settled for ${request.requester.name}`,
      idempotencyKey: getIdempotencyKey(req),
      paymentRequest: request._id,
      settlementStatus: "SETTLED",
      metadata: {
        requestId: request._id.toString(),
      },
    });

    request.status = "PAID";
    request.relatedTransaction = transaction._id;
    await request.save();

    res.status(idempotentReplay ? 200 : 201).json({
      message: "Payment request paid successfully",
      paymentRequest: request,
      transaction,
      idempotentReplay,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({ message: error.message });
  }
};

export { createPaymentRequest, listRequests, respondToRequest, payRequest };
