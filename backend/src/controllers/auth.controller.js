import User from "../models/user.model.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "30d",
  });
};

async function registerUser(req, res) {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const user = await User.findOne({ $or: [{ email }, { phone }] });
    if (user) {
      return res.status(400).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const sanitizedName = name.replace(/\s/g, "").toLowerCase();
    const upiId = `${sanitizedName}${Math.floor(Math.random() * 10000)}@phonepe`;

    const newUser = new User({
      name,
      email,
      phone,
      password: hashedPassword,
      upiId,
    });

    await newUser.save();

    const token = generateToken(newUser._id);

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000, 
    });

    res.status(201).json({
      _id: newUser._id,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      upiId: newUser.upiId,
      balance: newUser.balance,
      hasMpinSet: false,
      token,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
}

async function loginUser(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = generateToken(user._id);

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000, 
    });

    res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      upiId: user.upiId,
      balance: user.balance,
      hasMpinSet: !!user.mpin,
      token,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Internal server error" });
  }
}

async function getUserProfile(req, res) {
  try {
    const user = await User.findById(req.user._id).select("-password -mpin");
    if (user) {
      const responseUser = user.toObject();
      responseUser.hasMpinSet = !!req.user.mpin;
      res.json(responseUser);
    } else {
      res.status(404).json({ message: "User not found" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function setupMpin(req, res) {
  try {
    const { mpin } = req.body; 

    if (!mpin || mpin.length < 4) {
      return res.status(400).json({ message: 'Please provide a valid MPIN (at least 4 digits)' });
    }

    const hashedMpin = await bcrypt.hash(mpin.toString(), 10);

    const user = await User.findById(req.user._id);
    user.mpin = hashedMpin;
    await user.save();

    res.json({ message: 'MPIN setup successfully!' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

async function logoutUser(req, res) {
  res.cookie("token", "", {
    httpOnly: true,
    expires: new Date(0),
  });
  res.status(200).json({ message: "Logged out successfully" });
}

export { registerUser, loginUser, getUserProfile, setupMpin, logoutUser };
