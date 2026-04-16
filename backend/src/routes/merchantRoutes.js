import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  createMerchantAccount,
  getMerchantProfile,
  payMerchant,
  settleMerchantPayment,
} from "../controllers/merchant.controller.js";

const merchantRouter = express.Router();

merchantRouter.post("/register", protect, createMerchantAccount);
merchantRouter.get("/profile", protect, getMerchantProfile);
merchantRouter.post("/pay", protect, payMerchant);
merchantRouter.post("/settle/:transactionId", protect, settleMerchantPayment);

export default merchantRouter;
