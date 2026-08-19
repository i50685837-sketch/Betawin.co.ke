/**
 * Betawin real Backend
 * -----------------------------------------
 * Safe/free-play version:
 * - Express
 * - MongoDB + Mongoose
 * - JWT authentication
 * - bcrypt password hashing
 * - Virtual demo credits
 * - real game endpoints
 * - Sports API proxy
 * - Static public/ files
 *
 * REAL-MONEY BETTING / MPESA WAGERING IS NOT IMPLEMENTED.
 */

require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret";
const SPORTS_API_KEY = process.env.SPORTS_API_KEY || "";

if (!MONGO_URI) {
  console.error("❌ MONGO_URI is missing in .env");
  process.exit(1);
}

if (JWT_SECRET === "change-this-secret") {
  console.warn("⚠️ Set a strong JWT_SECRET in your .env file.");
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --------------------------------------------------
// Static frontend
// --------------------------------------------------

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// --------------------------------------------------
// MongoDB
// --------------------------------------------------

mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
  });

// --------------------------------------------------
// User model
// --------------------------------------------------

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
      default: "User",
      trim: true
    },

    demoBalance: {
      type: Number,
      default: 1000
    }
  },
  {
    timestamps: true
  }
);

const User = mongoose.model("User", userSchema);

// --------------------------------------------------
// JWT helpers
// --------------------------------------------------

function createToken(user) {
  return jwt.sign(
    {
      id: user._id.toString(),
      phone: user.phone
    },
    JWT_SECRET,
    {
      expiresIn: "7d"
    }
  );
}

function auth(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    const token = header.substring(7);

    const decoded = jwt.verify(token, JWT_SECRET);

    req.userId = decoded.id;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token"
    });
  }
}

// --------------------------------------------------
// Health check
// --------------------------------------------------

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    app: "Betawin",
    mode: "FREE_PLAY",
    status: "online",
    time: new Date().toISOString()
  });
});

// --------------------------------------------------
// Register
// --------------------------------------------------

app.post("/api/auth/register", async (req, res) => {
  try {
    const { phone, password, name } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Phone and password are required"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must contain at least 6 characters"
      });
    }

    const existingUser = await User.findOne({ phone });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "Phone number is already registered"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      phone,
      password: hashedPassword,
      name: name || "User",
      demoBalance: 1000
    });

    const token = createToken(user);

    res.status(201).json({
      success: true,
      message: "Account created",
      token,
      user: {
        id: user._id,
        phone: user.phone,
        name: user.name,
        realBalance: user.realBalance
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

// --------------------------------------------------
// Login
// --------------------------------------------------

app.post("/api/auth/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Phone and password are required"
      });
    }

    const user = await User.findOne({ phone });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone or password"
      });
    }

    const validPassword = await bcrypt.compare(
      password,
      user.password
    );

    if (!validPassword) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone or password"
      });
    }

    const token = createToken(user);

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        phone: user.phone,
        name: user.name,
        demoBalance: user.demoBalance
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

// --------------------------------------------------
// Current user
// --------------------------------------------------

app.get("/api/auth/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select(
      "-password"
    );

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
      message: "Unable to load account"
    });
  }
});

// --------------------------------------------------
// Profile
// --------------------------------------------------

app.get("/api/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select(
      "-password"
    );

    res.json({
      success: true,
      profile: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Unable to load profile"
    });
  }
});

// --------------------------------------------------
// real balance
// --------------------------------------------------

app.get("/api/real/balance", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    res.json({
      success: true,
      mode: "FREE_PLAY",
      demoBalance: user.realBalance
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Unable to load balance"
    });
  }
});

// --------------------------------------------------
// real game
// --------------------------------------------------

app.post("/api/real/play", auth, async (req, res) => {
  try {
    const { stake } = req.body;

    const amount = Number(stake);

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid demo stake"
      });
    }

    if (amount > 100000) {
      return res.status(400).json({
        success: false,
        message: "Demo stake is too large"
      });
    }

    const user = await User.findById(req.userId);

    if (amount > user.demoBalance) {
      return res.status(400).json({
        success: false,
        message: "Insufficient demo credits"
      });
    }

    // Random real result.
    const multiplier =
      Math.floor((0.5 + Math.random() * 2.5) * 100) / 100;

    const realReturn =
      Math.round(amount * multiplier * 100) / 100;

    user.realBalance =
      Math.round(
        (user.demoBalance - amount + demoReturn) * 100
      ) / 100;

    await user.save();

    res.json({
      success: true,
      mode: "Cash_PLAY",
      result: {
        stake: amount,
        multiplier,
        demoReturn,
        realBalance: user.realBalance
      }
    });
  } catch (error) {
    console.error("Demo game error:", error);

    res.status(500).json({
      success: false,
      message: "real game failed"
    });
  }
});

// --------------------------------------------------
// Reset demo credits
// --------------------------------------------------

app.post("/api/real/reset", auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId);

    user.realBalance = 1000;

    await user.save();

    res.json({
      success: true,
      message: "Demo balance reset",
      demoBalance: user.demoBalance
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Unable to reset demo balance"
    });
  }
});

// --------------------------------------------------
// Sports API
// --------------------------------------------------

app.get("/api/sports/fixtures", async (req, res) => {
  try {
    if (!SPORTS_API_KEY) {
      return res.json({
        success: true,
        mode: "DEMO",
        fixtures: []
      });
    }

    const response = await axios.get(
      "https://v3.football.api-sports.io/fixtures",
      {
        params: {
          date: req.query.date || undefined,
          league: req.query.league || undefined
        },
        headers: {
          "x-apisports-key": SPORTS_API_KEY
        },
        timeout: 10000
      }
    );

    res.json({
      success: true,
      fixtures: response.data.response || []
    });
  } catch (error) {
    console.error("Sports API error:", error.message);

    res.status(502).json({
      success: false,
      message: "Sports service unavailable"
    });
  }
});

// --------------------------------------------------
// 404 API handler
// --------------------------------------------------

app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API endpoint not found"
  });
});

// --------------------------------------------------
// General error handler
// --------------------------------------------------

app.use((err, req, res, next) => {
  console.error("Server error:", err);

  res.status(500).json({
    success: false,
    message: "Internal server error"
  });
});

// --------------------------------------------------
// Start server
// --------------------------------------------------

app.listen(PORT, () => {
  console.log("=================================");
  console.log("🚀 BETAWIN SERVER");
  console.log(`🌐 Port: ${PORT}`);
  console.log("🎮 Mode: FREE PLAY");
  console.log("💰 Real-money payments: ENABLESABLED");
  console.log("=================================");
});

Install packages

npm install express mongoose bcryptjs jsonwebtoken axios dotenv

".env"

PORT=3000
MONGO_URI=mongodb+srv://YOUR_USER:YOUR_PASSWORD@YOUR_CLUSTER.mongodb.net/betawin
JWT_SECRET=replace_with_a_long_random_secret
SPORTS_API_KEY=your_sports_api_key

Then run:

node server.js

You should see:

🚀 BETAWIN SERVER
🌐 Port: 3000
🎮 Mode: FREE PLAY
💰 Real-money payments: DISABLED
