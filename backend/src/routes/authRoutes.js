import express from "express";
import { registerUser, loginUser, getUserProfile, setupMpin, logoutUser } from "../controllers/auth.controller.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.post("/logout", logoutUser);
router.get('/profile', protect, getUserProfile); 
router.post('/setup-mpin', protect, setupMpin); 

export default router;