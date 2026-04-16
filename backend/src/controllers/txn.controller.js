import Transaction from "../models/transaction.model.js";
import User from "../models/user.model.js";
import bcrypt from "bcrypt";

async function sendMoney(req, res) {
  try {
    const { receiverIdentifier, mpin } = req.body;
    const amount = Number(req.body.amount);
    const senderId = req.user._id;

    if (!receiverIdentifier || !amount || !mpin) {
      return res.status(400).json({
        message: "all fields are required !",
      });
    }

    if (amount <= 0) {
      return res.status(400).json({
        message: "Amount must be greater than zero",
      });
    }
    const sender = await User.findById(senderId);

    if (!sender.mpin) {
      return res.status(400).json({
        message: "Please setup your MPIN first",
      });
    }

    const isMpinCorrect = await bcrypt.compare(mpin.toString(), sender.mpin);

    if (!isMpinCorrect) {
      return res.status(401).json({
        message: "Incorrect MPIN",
      });
    }

    const receiver = await User.findOne({
      $or: [{ phone: receiverIdentifier }, { upiId: receiverIdentifier }],
    });

    if (!receiver) {
      return res
        .status(404)
        .json({ message: "Receiver not found (Invalid Phone/UPI)" });
    }

    if (senderId.toString() === receiver._id.toString()) {
      return res
        .status(400)
        .json({ message: "You cannot send money to yourself" });
    }

    if (sender.balance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    sender.balance -= amount;
    receiver.balance += amount;

    await sender.save();
    await receiver.save();

    const transaction = await Transaction.create({
      sender: senderId,
      receiver: receiver._id,
      type: "TRANSFER",
      amount,
      status: "SUCCESS",
    });

    res.status(201).json({
      message: "Money Transfer Successful",
      transaction,
      newBalance: sender.balance,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

const getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user._id;

    const transactions = await Transaction.find({
      $or: [{ sender: userId }, { receiver: userId }],
    })
      .populate("sender", "name phone upiId")
      .populate("receiver", "name phone upiId")
      .sort({ createdAt: -1 });

    res.json(transactions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export { sendMoney, getTransactionHistory };
