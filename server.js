/**
 * server.js
 * Safe demo backend
 *
 * Includes:
 * - Express
 * - MongoDB / Mongoose
 * - JWT authentication
 * - Password hashing
 * - Register / Login
 * - Sports API proxy
 * - Support API
 * - Static public files
 * - Health check
 *
 * Gambling / real-money transactions are intentionally not implemented.
 */

require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const axios = require("axios");
const path = require("path");

const app = express();

/* =========================================================
   CONFIG
========================================================= */

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;

const SPORTS_API_URL =
  process.env.SPORTS_API_URL || "https://v3.football.api-sports.io";

const SPORTS_API_KEY = process.env.SPORTS_API_KEY;

/* =========================================================
   BASIC SECURITY / MIDDLEWARE
========================================================= */

app.disable("x-powered-by");

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

/* =========================================================
   STATIC FILES
========================================================= */

app.use(express.static(path.join(__dirname, "public")));

/* =========================================================
   MONGODB
========================================================= */

if (MONGO_URI) {
  mongoose
    .connect(MONGO_URI)
    .then(() => {
      console.log("✅ MongoDB connected");
    })
    .catch((err) => {
      console.error("❌ MongoDB connection failed:");
      console.error(err.message);
    });
} else {
  console.warn("⚠️ MONGO_URI is not configured.");
}

/* =========================================================
   USER MODEL
========================================================= */

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80
    },

    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 30
    },

    password: {
      type: String,
      required: true,
      minlength: 6
    }
  },
  {
    timestamps: true
  }
);

const User = mongoose.model("User", userSchema);

/* =========================================================
   JWT HELPERS
========================================================= */

function createToken(user) {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

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

/* =========================================================
   AUTH MIDDLEWARE
========================================================= */

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      message: "Authentication required"
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token"
    });
  }
}

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    time: new Date().toISOString(),
    database:
      mongoose.connection.readyState === 1
        ? "connected"
        : "disconnected"
  });
});

/* =========================================================
   REGISTER
========================================================= */

app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, phone, password } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Name, phone and password are required"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must contain at least 6 characters"
      });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: "Database is unavailable"
      });
    }

    const existingUser = await User.findOne({ phone });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this phone number already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await User.create({
      name: name.trim(),
      phone: phone.trim(),
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

/* =========================================================
   LOGIN
========================================================= */

app.post("/api/auth/login", async (req, res) => {
  try {
    const { phone, password } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message: "Phone and password are required"
      });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: "Database is unavailable"
      });
    }

    const user = await User.findOne({
      phone: phone.trim()
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid phone number or password"
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
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

/* =========================================================
   CURRENT USER
========================================================= */

app.get("/api/auth/me", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
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
    console.error("Profile error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load profile"
    });
  }
});

/* =========================================================
   SPORTS API HELPER
========================================================= */

async function sportsRequest(endpoint, params = {}) {
  if (!SPORTS_API_KEY) {
    throw new Error("SPORTS_API_KEY is not configured");
  }

  const response = await axios.get(
    `${SPORTS_API_URL}${endpoint}`,
    {
      params,
      headers: {
        "x-apisports-key": SPORTS_API_KEY
      },
      timeout: 10000
    }
  );

  return response.data;
}

/* =========================================================
   SPORTS — FIXTURES
========================================================= */

app.get("/api/sports/fixtures", async (req, res) => {
  try {
    const { date, league, season, team, live } = req.query;

    const params = {};

    if (date) params.date = date;
    if (league) params.league = league;
    if (season) params.season = season;
    if (team) params.team = team;
    if (live) params.live = live;

    const data = await sportsRequest("/fixtures", params);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error("Fixtures error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to load fixtures"
    });
  }
});

/* =========================================================
   SPORTS — LIVE SCORES
========================================================= */

app.get("/api/sports/live", async (req, res) => {
  try {
    const data = await sportsRequest("/fixtures", {
      live: "all"
    });

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error("Live scores error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to load live scores"
    });
  }
});

/* =========================================================
   SPORTS — TEAMS
========================================================= */

app.get("/api/sports/teams", async (req, res) => {
  try {
    const { league, season, team } = req.query;

    const params = {};

    if (league) params.league = league;
    if (season) params.season = season;
    if (team) params.id = team;

    const data = await sportsRequest("/teams", params);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error("Teams error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to load teams"
    });
  }
});

/* =========================================================
   SPORTS — STANDINGS
========================================================= */

app.get("/api/sports/standings", async (req, res) => {
  try {
    const { league, season, team } = req.query;

    if (!league || !season) {
      return res.status(400).json({
        success: false,
        message: "league and season are required"
      });
    }

    const params = {
      league,
      season
    };

    if (team) params.team = team;

    const data = await sportsRequest("/standings", params);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    console.error("Standings error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to load standings"
    });
  }
});

/* =========================================================
   SPORTS — RUGBY (stub)

   No rugby data provider is configured yet. This endpoint
   returns an empty, well-formed response so the frontend can
   render a "coming soon" state instead of erroring out.
   Wire this up to a real rugby data provider when you have one.
========================================================= */

app.get("/api/sports/rugby/fixtures", async (req, res) => {
  res.json({
    success: true,
    message: "Rugby fixtures are not yet configured",
    data: {
      response: []
    }
  });
});

/* =========================================================
   GAMES CATALOG (crash-game lobby metadata only)

   Static display metadata for the crash-game lobby UI (name,
   provider). This does NOT implement any game logic, RNG,
   multiplier curves, or real-money wagering — actual crash
   games are hosted and run by the licensed third-party
   providers (e.g. Spribe, SmartSoft Gaming) and should be
   launched through their official game-launch API once you
   have a signed integration agreement with them.
========================================================= */

const CRASH_GAMES_CATALOG = [
  { name: "Aviator", provider: "spribe", providerLabel: "Spribe" },
  { name: "Mines", provider: "spribe", providerLabel: "Spribe" },
  { name: "Plinko", provider: "spribe", providerLabel: "Spribe" },
  { name: "Goal", provider: "spribe", providerLabel: "Spribe" },
  { name: "Dice", provider: "spribe", providerLabel: "Spribe" },
  { name: "Hi-Lo", provider: "spribe", providerLabel: "Spribe" },
  { name: "Mini Roulette", provider: "spribe", providerLabel: "Spribe" },
  { name: "Keno", provider: "spribe", providerLabel: "Spribe" },
  { name: "Balloon", provider: "spribe", providerLabel: "Spribe" },
  { name: "Hotline", provider: "spribe", providerLabel: "Spribe" },
  { name: "JetX", provider: "smartsoft", providerLabel: "SmartSoft Gaming" },
  { name: "JetX3", provider: "smartsoft", providerLabel: "SmartSoft Gaming" },
  { name: "Zeppelin", provider: "smartsoft", providerLabel: "SmartSoft Gaming" },
  { name: "Cappadocia", provider: "smartsoft", providerLabel: "SmartSoft Gaming" },
  { name: "Rocketon", provider: "smartsoft", providerLabel: "SmartSoft Gaming" }
];

app.get("/api/games/crash-catalog", (req, res) => {
  const { provider } = req.query;

  const games = provider
    ? CRASH_GAMES_CATALOG.filter((g) => g.provider === provider)
    : CRASH_GAMES_CATALOG;

  res.json({
    success: true,
    games
  });
});

/* =========================================================
   SUPPORT API
========================================================= */

app.post("/api/support/message", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message is required"
      });
    }

    /*
      Safe demo response.

      You can later connect this endpoint to your own
      approved support/AI service.
    */

    const text = message.trim().toLowerCase();

    let reply =
      "Thanks for contacting support. Please describe the issue you're experiencing.";

    if (text.includes("login")) {
      reply =
        "For login problems, check that your phone number and password match the account you registered.";
    } else if (text.includes("password")) {
      reply =
        "If you forgot your password, use the password-reset flow provided by the application.";
    } else if (text.includes("sports")) {
      reply =
        "The sports section provides fixtures, live scores, teams and standings.";
    } else if (text.includes("account")) {
      reply =
        "Please provide a clear description of the account problem so support can assist you.";
    }

    res.json({
      success: true,
      reply
    });
  } catch (error) {
    console.error("Support error:", error);

    res.status(500).json({
      success: false,
      message: "Support service unavailable"
    });
  }
});

/* =========================================================
   DEMO USER DASHBOARD
========================================================= */

app.get("/api/dashboard", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select(
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
      dashboard: {
        user: {
          id: user._id,
          name: user.name,
          phone: user.phone
        },

        /*
          Demo-only values.
          No real-money wallet functionality.
        */
        balance: 0,
        currency: "KES"
      }
    });
  } catch (error) {
    console.error("Dashboard error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load dashboard"
    });
  }
});

/* =========================================================
   ROOT PAGE
========================================================= */

app.get("/", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

/* =========================================================
   404 HANDLER
========================================================= */

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    path: req.originalUrl
  });
});

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);

  res.status(500).json({
    success: false,
    message: "Internal server error"
  });
});

/* =========================================================
   START SERVER
========================================================= */

app.listen(PORT, "0.0.0.0", () => {
  console.log("======================================");
  console.log("🚀 Server started successfully");
  console.log(`🌐 Port: ${PORT}`);
  console.log(`📁 Public: ${path.join(__dirname, "public")}`);
  console.log("======================================");
});
                            
