import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/authRoutes.js";
import txnRoutes from "./routes/txnRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";

const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(cors());

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.use("/api/auth", authRoutes);
app.use("/api/txn", txnRoutes);
app.use("/api/wallet", walletRoutes);

export default app;
