import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import { generateQrCode, payViaQr } from "../controllers/qr.controller.js";

const qrRouter = express.Router();

qrRouter.post("/generate", protect, generateQrCode);
qrRouter.post("/pay", protect, payViaQr);

export default qrRouter;
