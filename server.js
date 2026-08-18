// server.js

require("dotenv").config();

const express = require("express");
const path = require("path");
const mongoose = require("mongoose");
const axios = require("axios");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret";
const sportsRoutes = require("./routes/sports");

app.use("/api/sports", sportsRoutes);

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

// =====================================================
// MONGODB
// =====================================================

if (MONGO_URI) {
  mongoose
    .connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => {
      console.error("❌ MongoDB connection failed:", err.message);
    });
} else {
  console.log("⚠️ MONGO_URI is not configured");
}

// =====================================================
// BASIC ROUTES
// =====================================================

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "online",
    server: "Betawin API",
    time: new Date().toISOString()
  });
});

// =====================================================
// SUPPORT AI
// =====================================================

app.post("/api/support/chat", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({
        success: false,
        reply: "Please type your question."
      });
    }

    const question = message.trim();
    const q = question.toLowerCase();

    let reply;

    if (
      q.includes("login") ||
      q.includes("log in") ||
      q.includes("password")
    ) {
      reply =
        "If you cannot log in, check that you are using the same phone number and password you registered with. If the problem continues, tell me the exact error you see.";
    }

    else if (
      q.includes("register") ||
      q.includes("signup") ||
      q.includes("sign up")
    ) {
      reply =
        "To register, open the registration page and enter the requested account details. Make sure your information is entered correctly.";
    }

    else if (
      q.includes("sports") ||
      q.includes("football") ||
      q.includes("score")
    ) {
      reply =
        "I can help you find general sports information and results. Tell me the team, competition, or match you are looking for.";
    }

    else if (
      q.includes("account") ||
      q.includes("profile")
    ) {
      reply =
        "Tell me what you need to change or access in your account and I'll guide you through it.";
    }

    else if (
      q.includes("deposit") ||
      q.includes("mpesa") ||
      q.includes("m-pesa") ||
      q.includes("stk")
    ) {
      reply =
        "To deposit, enter an amount between KES 10 and KES 70,000 and confirm with your M-Pesa PIN on the STK prompt sent to your phone. Tell me if the prompt didn't arrive or the payment failed.";
    }

    else if (
      q.includes("error") ||
      q.includes("failed") ||
      q.includes("not working")
    ) {
      reply =
        "Let's troubleshoot it. Send me the exact error message and tell me which page you were using.";
    }

    else if (
      q.includes("contact") ||
      q.includes("human") ||
      q.includes("owner")
    ) {
      reply =
        "If the issue persists, please contact the website administrator or support team through the official contact channel.";
    }

    else {
      reply =
        "Thanks for your question. I can help with account, login, deposits, website, and general sports-related support. Tell me a little more about what you need.";
    }

    res.json({
      success: true,
      reply
    });

  } catch (error) {
    console.error("Support error:", error);

    res.status(500).json({
      success: false,
      reply: "Support is temporarily unavailable. Please try again."
    });
  }
});

// =====================================================
// AUTH HELPERS
// =====================================================

function createToken(user) {
  return jwt.sign(
    {
      id: user._id,
      phone: user.phone
    },
    JWT_SECRET,
    {
      expiresIn: "7d"
    }
  );
}

function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication required"
    });
  }

  const token = header.split(" ")[1];

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token"
    });
  }
}

// =====================================================
// USER MODEL
// =====================================================

const userSchema = new mongoose.Schema(
  {
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },

    password: {
      type: String,
      required: true
    },

    name: {
      type: String,
      default: ""
    },

    walletBalance: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

const User =
  mongoose.models.User ||
  mongoose.model("User", userSchema);

// =====================================================
// TRANSACTION MODEL (ledger — source of truth for balance)
// =====================================================

const transactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },

    type: {
      type: String,
      enum: ["deposit", "withdrawal"],
      required: true
    },

    amount: {
      type: Number,
      required: true
    },

    phone: {
      type: String,
      required: true
    },

    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending"
    },

    // Safaricom's CheckoutRequestID — used to match the callback to this record
    checkoutRequestId: {
      type: String,
      index: true
    },

    merchantRequestId: String,

    resultCode: Number,
    resultDesc: String,
    mpesaReceiptNumber: String
  },
  {
    timestamps: true
  }
);

const Transaction =
  mongoose.models.Transaction ||
  mongoose.model("Transaction", transactionSchema);

// =====================================================
// REGISTER
// =====================================================

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Phone number and password are required"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must contain at least 6 characters"
      });
    }

    const existing = await User.findOne({ phone });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "An account with this phone number already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name: name || "",
      phone,
      password: hashedPassword
    });

    const token = createToken(user);

    res.status(201).json({
      success: true,
      message: "Account created successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone
      }
    });

  } catch (error) {
    console.error("Register error:", error);

    res.status(500).json({
      success: false,
      message: "Registration failed"
    });
  }
});

// =====================================================
// LOGIN
// =====================================================

app.post("/api/auth/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Phone number and password are required"
      });
    }

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone number or password"
      });
    }

    const valid = await bcrypt.compare(
      password,
      user.password
    );

    if (!valid) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone number or password"
      });
    }

    const token = createToken(user);

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone
      }
    });

  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      success: false,
      message: "Login failed"
    });
  }
});

// =====================================================
// CURRENT USER
// =====================================================

app.get("/api/auth/me", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.json({
      success: true,
      user
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not load account"
    });
  }
});

// =====================================================
// WALLET BALANCE
// =====================================================

app.get("/api/wallet/balance", authenticate, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("walletBalance");

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, balance: user.walletBalance });

  } catch (error) {
    res.status(500).json({ success: false, message: "Could not load balance" });
  }
});

// =====================================================
// M-PESA (DARAJA) — STK PUSH DEPOSIT
// =====================================================
//
// Required in .env:
//
// MPESA_ENV=sandbox            (or "production")
// MPESA_CONSUMER_KEY=...
// MPESA_CONSUMER_SECRET=...
// MPESA_SHORTCODE=...          (Paybill / Till number)
// MPESA_PASSKEY=...            (Lipa Na M-Pesa Online passkey)
// MPESA_CALLBACK_URL=https://yourdomain.com/api/payments/mpesa/callback
//
// The callback URL must be a publicly reachable HTTPS endpoint —
// Safaricom cannot reach localhost. Use ngrok or similar while testing.
//

const MPESA_BASE_URL =
  process.env.MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

function formatMpesaTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

async function getMpesaAccessToken() {
  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;

  if (!key || !secret) {
    throw new Error("M-Pesa consumer key/secret not configured");
  }

  const auth = Buffer.from(`${key}:${secret}`).toString("base64");

  const response = await axios.get(
    `${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: { Authorization: `Basic ${auth}` },
      timeout: 10000
    }
  );

  return response.data.access_token;
}

// Normalizes 07XXXXXXXX / 7XXXXXXXX / 2547XXXXXXXX into 2547XXXXXXXX
function normalizeMpesaPhone(rawPhone) {
  let phone = String(rawPhone).replace(/\s+/g, "").replace(/^\+/, "");
  if (phone.startsWith("0")) phone = "254" + phone.slice(1);
  if (phone.startsWith("7") || phone.startsWith("1")) phone = "254" + phone;
  return phone;
}

app.post("/api/payments/mpesa/stkpush", authenticate, async (req, res) => {
  try {
    const { amount, phone } = req.body;

    const numericAmount = Number(amount);

    if (!numericAmount || numericAmount < 10 || numericAmount > 70000) {
      return res.status(400).json({
        success: false,
        message: "Amount must be between KES 10 and KES 70,000"
      });
    }

    if (!phone) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required"
      });
    }

    const shortcode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    const callbackUrl = process.env.MPESA_CALLBACK_URL;

    if (!shortcode || !passkey || !callbackUrl) {
      return res.status(503).json({
        success: false,
        message: "M-Pesa is not fully configured on the server yet"
      });
    }

    const msisdn = normalizeMpesaPhone(phone);
    const timestamp = formatMpesaTimestamp();
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");

    const accessToken = await getMpesaAccessToken();

    const stkResponse = await axios.post(
      `${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: Math.round(numericAmount),
        PartyA: msisdn,
        PartyB: shortcode,
        PhoneNumber: msisdn,
        CallBackURL: callbackUrl,
        AccountReference: "Betawin",
        TransactionDesc: "Betawin wallet deposit"
      },
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 15000
      }
    );

    // Log a pending transaction now so the callback has something to match against
    await Transaction.create({
      user: req.user.id,
      type: "deposit",
      amount: numericAmount,
      phone: msisdn,
      status: "pending",
      checkoutRequestId: stkResponse.data.CheckoutRequestID,
      merchantRequestId: stkResponse.data.MerchantRequestID
    });

    res.json({
      success: true,
      message: "STK prompt sent — enter your M-Pesa PIN to complete the deposit",
      checkoutRequestId: stkResponse.data.CheckoutRequestID
    });

  } catch (error) {
    console.error("STK push error:", error.response?.data || error.message);

    res.status(502).json({
      success: false,
      message: "Could not initiate M-Pesa payment. Please try again."
    });
  }
});

// Safaricom calls this URL directly — it is not authenticated with a Bearer
// token because Safaricom's servers are the caller, not your logged-in user.
app.post("/api/payments/mpesa/callback", async (req, res) => {
  try {
    const callback = req.body?.Body?.stkCallback;

    if (!callback) {
      return res.status(400).json({ success: false, message: "Malformed callback" });
    }

    const {
      CheckoutRequestID,
      ResultCode,
      ResultDesc,
      CallbackMetadata
    } = callback;

    const transaction = await Transaction.findOne({ checkoutRequestId: CheckoutRequestID });

    if (!transaction) {
      console.warn("M-Pesa callback for unknown transaction:", CheckoutRequestID);
      // Still acknowledge so Safaricom doesn't retry indefinitely
      return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    transaction.resultCode = ResultCode;
    transaction.resultDesc = ResultDesc;

    if (ResultCode === 0) {
      // Payment succeeded
      const items = CallbackMetadata?.Item || [];
      const receipt = items.find((i) => i.Name === "MpesaReceiptNumber")?.Value;

      transaction.status = "completed";
      transaction.mpesaReceiptNumber = receipt || "";
      await transaction.save();

      // Credit the wallet — only ever done here, from Safaricom's confirmed result
      await User.findByIdAndUpdate(transaction.user, {
        $inc: { walletBalance: transaction.amount }
      });

    } else {
      // User cancelled, timed out, insufficient funds, etc.
      transaction.status = "failed";
      await transaction.save();
    }

    // Safaricom expects this exact acknowledgement shape
    res.json({ ResultCode: 0, ResultDesc: "Accepted" });

  } catch (error) {
    console.error("M-Pesa callback error:", error);
    res.json({ ResultCode: 0, ResultDesc: "Accepted" }); // still ack to avoid retry storms
  }
});

// Lets the frontend poll "did my deposit go through yet"
app.get("/api/payments/mpesa/status/:checkoutRequestId", authenticate, async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      checkoutRequestId: req.params.checkoutRequestId,
      user: req.user.id
    });

    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    res.json({
      success: true,
      status: transaction.status,
      amount: transaction.amount,
      receipt: transaction.mpesaReceiptNumber || null
    });

  } catch (error) {
    res.status(500).json({ success: false, message: "Could not check status" });
  }
});

// =====================================================
// CRASH & CASINO — SCAFFOLD ONLY
// =====================================================
//
// These are gated and ready to receive bets, but the actual outcome
// engine (crash-point / RNG generation, payout multiplier logic) isn't
// implemented here. That's the core mechanic of running a real-money
// gambling product, which needs to be licensed with Kenya's Betting
// Control and Licensing Board — it's not something to generate as
// boilerplate. Once you have that sorted (in-house provably-fair engine,
// or a licensed game provider/aggregator), plug the result determination
// into the TODOs below. The betting/ledger plumbing around it is ready.
//

app.post("/api/games/crash/bet", authenticate, async (req, res) => {
  try {
    const { amount } = req.body;
    const numericAmount = Number(amount);

    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid bet amount" });
    }

    const user = await User.findById(req.user.id);
    if (!user || user.walletBalance < numericAmount) {
      return res.status(400).json({ success: false, message: "Insufficient balance" });
    }

    // TODO: deduct stake, generate the crash point via a licensed/audited
    // provably-fair RNG, stream the live multiplier to the client, and
    // settle (credit or void) based on whether the player cashed out
    // before the crash point.
    return res.status(501).json({
      success: false,
      message: "Crash game engine not implemented — requires a licensed provably-fair RNG."
    });

  } catch (error) {
    res.status(500).json({ success: false, message: "Could not place bet" });
  }
});

app.post("/api/games/casino/bet", authenticate, async (req, res) => {
  try {
    const { amount, game } = req.body;
    const numericAmount = Number(amount);

    if (!numericAmount || numericAmount <= 0) {
      return res.status(400).json({ success: false, message: "Invalid bet amount" });
    }

    const user = await User.findById(req.user.id);
    if (!user || user.walletBalance < numericAmount) {
      return res.status(400).json({ success: false, message: "Insufficient balance" });
    }

    // TODO: route to the specific game's outcome engine (slot reels,
    // roulette wheel, card shuffle, etc.) via a licensed/audited RNG,
    // then settle the bet against the real payout table for that game.
    return res.status(501).json({
      success: false,
      message: `Casino game engine (${game || "unspecified"}) not implemented — requires a licensed RNG/payout provider.`
    });

  } catch (error) {
    res.status(500).json({ success: false, message: "Could not place bet" });
  }
});

// =====================================================
// SPORTS API
// =====================================================
//
// Put your permitted sports API URL and key in .env:
//
// SPORTS_API_URL=...
// SPORTS_API_KEY=...
//

app.get("/api/sports", async (req, res) => {
  try {
    if (!process.env.SPORTS_API_URL) {
      return res.status(503).json({
        success: false,
        message: "Sports API is not configured"
      });
    }

    const response = await axios.get(
      process.env.SPORTS_API_URL,
      {
        headers: process.env.SPORTS_API_KEY
          ? {
              "x-api-key": process.env.SPORTS_API_KEY
            }
          : {},
        timeout: 10000
      }
    );

    res.json({
      success: true,
      data: response.data
    });

  } catch (error) {
    console.error(
      "Sports API error:",
      error.response?.data || error.message
    );

    res.status(502).json({
      success: false,
      message: "Unable to retrieve sports information"
    });
  }
});

// =====================================================
// 404
// =====================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint not found"
  });
});

// =====================================================
// ERROR HANDLER
// =====================================================

app.use((err, req, res, next) => {
  console.error("Server error:", err);

  res.status(500).json({
    success: false,
    message: "Internal server error"
  });
});

// =====================================================
// START
// =====================================================

app.listen(PORT, "0.0.0.0", () => {
  console.log("----------------------------------------");
  console.log("🚀 Server started");
  console.log(`🌐 Port: ${PORT}`);
  console.log(`📁 Public: ${path.join(__dirname, "public")}`);
  console.log(`💬 Support: /api/support/chat`);
  console.log(`💳 M-Pesa STK: /api/payments/mpesa/stkpush`);
  console.log(`🏟️ Sports: /api/sports`);
  console.log(`❤️ Health: /health`);
  console.log("----------------------------------------");
});
      
