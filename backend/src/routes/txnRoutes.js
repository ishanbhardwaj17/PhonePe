import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  getLedgerHistory,
  getTransactionHistory,
  refundTransaction,
  sendMoney,
} from "../controllers/txn.controller.js";
const txnRouter = express.Router();

txnRouter.post('/send', protect, sendMoney);
txnRouter.get('/history', protect, getTransactionHistory);
txnRouter.get('/ledger', protect, getLedgerHistory);
txnRouter.post('/refund/:transactionId', protect, refundTransaction);

export default txnRouter;
