require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
const axios = require("axios");

const app = express();

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.warn("⚠️ JWT_SECRET is not configured");
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// =====================================================
// MONGODB
// =====================================================

if (MONGO_URI) {
  mongoose
    .connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) =>
      console.error("❌ MongoDB error:", err.message)
    );
} else {
  console.warn("⚠️ MONGO_URI is not configured");
}

// =====================================================
// USER MODEL
// =====================================================

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);

// =====================================================
// PAYMENT MODEL
// =====================================================

const paymentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    phone: String,

    amount: Number,

    merchantRequestId: String,

    checkoutRequestId: {
      type: String,
      unique: true,
      sparse: true,
    },

    mpesaReceiptNumber: String,

    status: {
      type: String,
      enum: [
        "PENDING",
        "SUCCESS",
        "FAILED",
      ],
      default: "PENDING",
    },

    resultCode: String,

    resultDescription: String,
  },
  {
    timestamps: true,
  }
);

const Payment = mongoose.model(
  "Payment",
  paymentSchema
);

// =====================================================
// AUTH MIDDLEWARE
// =====================================================

function authenticate(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication required",
    });
  }

  const token = header.substring(7);

  try {
    const decoded = jwt.verify(
      token,
      JWT_SECRET
    );

    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token",
    });
  }
}

// =====================================================
// HEALTH
// =====================================================

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    server: "online",
    mode: "SANDBOX",
    time: new Date().toISOString(),
  });
});

// =====================================================
// REGISTER
// =====================================================

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, phone, password } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Name, phone and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message:
          "Password must contain at least 6 characters",
      });
    }

    const existing = await User.findOne({ phone });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Phone number already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(
      password,
      12
    );

    const user = await User.create({
      name,
      phone,
      password: hashedPassword,
    });

    const token = jwt.sign(
      {
        id: user._id.toString(),
        phone: user.phone,
      },
      JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error("Register:", error);

    res.status(500).json({
      success: false,
      message: "Registration failed",
    });
  }
});

// =====================================================
// LOGIN
// =====================================================

app.post("/api/auth/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone or password",
      });
    }

    const valid = await bcrypt.compare(
      password,
      user.password
    );

    if (!valid) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone or password",
      });
    }

    const token = jwt.sign(
      {
        id: user._id.toString(),
        phone: user.phone,
      },
      JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error("Login:", error);

    res.status(500).json({
      success: false,
      message: "Login failed",
    });
  }
});

// =====================================================
// CURRENT USER
// =====================================================

app.get(
  "/api/auth/me",
  authenticate,
  async (req, res) => {
    try {
      const user = await User.findById(
        req.user.id
      ).select("-password");

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      res.json({
        success: true,
        user,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "Unable to load profile",
      });
    }
  }
);

// =====================================================
// MPESA ACCESS TOKEN
// =====================================================

async function getMpesaToken() {
  const consumerKey =
    process.env.MPESA_CONSUMER_KEY;

  const consumerSecret =
    process.env.MPESA_CONSUMER_SECRET;

  if (!consumerKey || !consumerSecret) {
    throw new Error(
      "M-Pesa credentials are not configured"
    );
  }

  const credentials = Buffer.from(
    `${consumerKey}:${consumerSecret}`
  ).toString("base64");

  const response = await axios.get(
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    {
      headers: {
        Authorization:
          `Basic ${credentials}`,
      },
    }
  );

  return response.data.access_token;
}

// =====================================================
// MPESA STK PUSH
// =====================================================

app.post(
  "/api/payments/stkpush",
  authenticate,
  async (req, res) => {
    try {
      const { phone, amount } = req.body;

      if (!phone || !amount) {
        return res.status(400).json({
          success: false,
          message:
            "Phone and amount are required",
        });
      }

      const numericAmount =
        Number(amount);

      if (
        !Number.isFinite(numericAmount) ||
        numericAmount <= 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid amount",
        });
      }

      const shortcode =
        process.env.MPESA_SHORTCODE;

      const passkey =
        process.env.MPESA_PASSKEY;

      const callbackUrl =
        process.env.MPESA_CALLBACK_URL;

      if (
        !shortcode ||
        !passkey ||
        !callbackUrl
      ) {
        return res.status(500).json({
          success: false,
          message:
            "M-Pesa configuration incomplete",
        });
      }

      const token =
        await getMpesaToken();

      const timestamp =
        new Date()
          .toISOString()
          .replace(/[-:TZ.]/g, "")
          .slice(0, 14);

      const password =
        Buffer.from(
          `${shortcode}${passkey}${timestamp}`
        ).toString("base64");

      const stkResponse =
        await axios.post(
          "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
          {
            BusinessShortCode:
              shortcode,

            Password:
              password,

            Timestamp:
              timestamp,

            TransactionType:
              "CustomerPayBillOnline",

            Amount:
              Math.round(numericAmount),

            PartyA:
              phone,

            PartyB:
              shortcode,

            PhoneNumber:
              phone,

            CallBackURL:
              callbackUrl,

            AccountReference:
              "DEMO-PAYMENT",

            TransactionDesc:
              "Sandbox payment",
          },
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
                "Content-Type":
                "application/json",
            },
          }
        );

      const data =
        stkResponse.data;

      await Payment.create({
        userId: req.user.id,
        phone,
        amount: Math.round(
          numericAmount
        ),
        merchantRequestId:
          data.MerchantRequestID,
        checkoutRequestId:
          data.CheckoutRequestID,
        status: "PENDING",
        resultCode:
          String(
            data.ResponseCode ?? ""
          ),
        resultDescription:
          data.ResponseDescription,
      });

      res.json({
        success: true,
        mode: "SANDBOX",
        message:
          data.CustomerMessage ||
          "STK Push sent",
        merchantRequestId:
          data.MerchantRequestID,
        checkoutRequestId:
          data.CheckoutRequestID,
      });
    } catch (error) {
      console.error(
        "STK Push:",
        error.response?.data ||
          error.message
      );

      res.status(500).json({
        success: false,
        message:
          "Unable to initiate STK Push",
      });
    }
  }
);

// =====================================================
// MPESA CALLBACK
// =====================================================

app.post(
  "/api/payments/mpesa/callback",
  async (req, res) => {
    try {
      console.log(
        "📲 M-Pesa callback:",
        JSON.stringify(
          req.body,
          null,
          2
        )
      );

      const callback =
        req.body?.Body
          ?.stkCallback;

      if (!callback) {
        return res.json({
          ResultCode: 0,
          ResultDesc: "Accepted",
        });
      }

      const checkoutRequestId =
        callback.CheckoutRequestID;

      const resultCode =
        String(
          callback.ResultCode
        );

      const resultDescription =
        callback.ResultDesc;

      const payment =
        await Payment.findOne({
          checkoutRequestId,
        });

      if (payment) {
        payment.resultCode =
          resultCode;

        payment.resultDescription =
          resultDescription;

        if (
          Number(callback.ResultCode) ===
          0
        ) {
          payment.status =
            "SUCCESS";

          const items =
            callback.CallbackMetadata
              ?.Item || [];

          const receipt =
            items.find(
              (item) =>
                item.Name ===
                "MpesaReceiptNumber"
            );

          if (receipt) {
            payment.mpesaReceiptNumber =
              receipt.Value;
          }
        } else {
          payment.status =
            "FAILED";
        }

        await payment.save();
      }

      res.json({
        ResultCode: 0,
        ResultDesc: "Accepted",
      });
    } catch (error) {
      console.error(
        "Callback error:",
        error.message
      );

      res.json({
        ResultCode: 0,
        ResultDesc: "Accepted",
      });
    }
  }
);

// =====================================================
// PAYMENT STATUS
// =====================================================

app.get(
  "/api/payments/:checkoutRequestId",
  authenticate,
  async (req, res) => {
    try {
      const payment =
        await Payment.findOne({
          checkoutRequestId:
            req.params.checkoutRequestId,

          userId: req.user.id,
        }).select("-__v");

      if (!payment) {
        return res.status(404).json({
          success: false,
          message:
            "Payment not found",
        });
      }

      res.json({
        success: true,
        payment,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          "Unable to retrieve payment",
      });
    }
  }
);

// =====================================================
// PAYMENT HISTORY
// =====================================================

app.get(
  "/api/payments",
  authenticate,
  async (req, res) => {
    try {
      const payments =
        await Payment.find({
          userId: req.user.id,
        })
          .sort({
            createdAt: -1,
          })
          .limit(50)
          .select("-__v");

      res.json({
        success: true,
        payments,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message:
          "Unable to load payment history",
      });
    }
  }
);

// =====================================================
// FREE-PLAY GAME STATUS
// =====================================================

app.get(
  "/api/game/status",
  (req, res) => {
    res.json({
      success: true,
      mode: "FREE_PLAY",
      realMoney: false,
    });
  }
);

// =====================================================
// SPORTS API
// =====================================================

app.get(
  "/api/sports",
  async (req, res) => {
    try {
      const url =
        process.env.SPORTS_API_URL;

      const key =
        process.env.SPORTS_API_KEY;

      if (!url || !key) {
        return res.json({
          success: true,
          demo: true,
          fixtures: [],
          message:
            "Sports API not configured",
        });
      }

      const response =
        await axios.get(url, {
          headers: {
            "x-apisports-key":
              key,
          },
        });

      res.json({
        success: true,
        data: response.data,
      });
    } catch (error) {
      console.error(
        "Sports API:",
        error.message
      );

      res.status(502).json({
        success: false,
        message:
          "Sports service unavailable",
      });
    }
  }
);

// =====================================================
// SPA FALLBACK
// =====================================================

app.get('/*splat', (req, res) => {
  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );
});

// =====================================================
// ERROR HANDLER
// =====================================================

app.use(
  (err, req, res, next) => {
    console.error(err);

    res.status(500).json({
      success: false,
      message:
        "Internal server error",
    });
  }
);

// =====================================================
// START
// =====================================================

app.listen(PORT, () => {
  console.log("");
  console.log(
    "================================"
  );
  console.log(
    "🚀 Server running"
  );
  console.log(
    `🌐 Port: ${PORT}`
  );
  console.log(
    "💳 Daraja: SANDBOX"
  );
  console.log(
    "💰 Payments: DEMO/SANDBOX"
  );
  console.log(
    "================================"
  );
});
