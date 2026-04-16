import mongoose from "mongoose";

const merchantProfileSchema = new mongoose.Schema(
  {
    displayName: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      trim: true,
    },
    settlementEnabled: {
      type: Boolean,
      default: true,
    },
    settlementCycle: {
      type: String,
      default: "T+1",
    },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    phone: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    upiId: {
      type: String,
      unique: true,
      sparse: true,
    },
    mpin: {
      type: String,
    },
    accountType: {
      type: String,
      enum: ["USER", "MERCHANT", "SYSTEM"],
      default: "USER",
    },
    merchantProfile: {
      type: merchantProfileSchema,
      default: undefined,
    },
    balance: {
      type: Number,
      default: 1000,
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);
export default User;
