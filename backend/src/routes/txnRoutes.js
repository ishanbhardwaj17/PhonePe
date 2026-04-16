import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { sendMoney, getTransactionHistory } from "../controllers/txn.controller.js";
const txnRouter = express.Router();

txnRouter.post('/send', protect, sendMoney);
txnRouter.get('/history', protect, getTransactionHistory);

export default txnRouter;
