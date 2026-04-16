import express from 'express';
const walletRouter = express.Router();
import { addMoney, payBill } from '../controllers/wallet.controller.js';
import { protect } from '../middleware/authMiddleware.js';

walletRouter.post('/add-money', protect, addMoney);
walletRouter.post('/pay-bill', protect, payBill);

export default walletRouter;