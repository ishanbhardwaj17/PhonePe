import express from "express";
import { protect } from "../middleware/authMiddleware.js";
import {
  createPaymentRequest,
  listRequests,
  payRequest,
  respondToRequest,
} from "../controllers/request.controller.js";

const requestRouter = express.Router();

requestRouter.post("/", protect, createPaymentRequest);
requestRouter.get("/", protect, listRequests);
requestRouter.post("/:requestId/respond", protect, respondToRequest);
requestRouter.post("/:requestId/pay", protect, payRequest);

export default requestRouter;
