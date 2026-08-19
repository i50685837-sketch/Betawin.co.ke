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
const crypto = require("crypto");
const axios = require("axios");
const path = require("path");

const app = express();

/* =========================================================
   CONFIG
========================================================= */

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET;

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL = "7d";
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

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
    },

    failedLoginAttempts: {
      type: Number,
      default: 0
    },

    lockUntil: {
      type: Date,
      default: null
    },

    // Hashed refresh tokens currently valid for this user.
    // Storing them lets us revoke individual sessions (logout)
    // instead of trusting any signed refresh token forever.
    refreshTokens: [
      {
        tokenHash: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
        expiresAt: { type: Date, required: true }
      }
    ]
  },
  {
    timestamps: true
  }
);

const User = mongoose.model("User", userSchema);

/* =========================================================
   JWT HELPERS
========================================================= */

function createAccessToken(user) {
  if (!JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    {
      id: user._id.toString(),
      phone: user.phone,
      type: "access"
    },
    JWT_SECRET,
    {
      expiresIn: ACCESS_TOKEN_TTL
    }
  );
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function createRefreshToken(user) {
  if (!JWT_REFRESH_SECRET) {
    throw new Error("JWT_REFRESH_SECRET is not configured");
  }

  const jti = crypto.randomBytes(16).toString("hex");

  const refreshToken = jwt.sign(
    {
      id: user._id.toString(),
      jti,
      type: "refresh"
    },
    JWT_REFRESH_SECRET,
    {
      expiresIn: REFRESH_TOKEN_TTL
    }
  );

  user.refreshTokens.push({
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
  });

  // Cap stored sessions per user so this array can't grow unbounded
  if (user.refreshTokens.length > 10) {
    user.refreshTokens = user.refreshTokens.slice(-10);
  }

  await user.save();

  return refreshToken;
}

async function issueTokenPair(user) {
  const accessToken = createAccessToken(user);
  const refreshToken = await createRefreshToken(user);
  return { accessToken, refreshToken };
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

    if (decoded.type !== "access") {
      return res.status(401).json({
        success: false,
        message: "Invalid token type"
      });
    }

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

    const { accessToken, refreshToken } = await issueTokenPair(user);

    res.status(201).json({
      success: true,
      message: "Account created successfully",
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL,
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

    // Account lockout check
    if (user.lockUntil && user.lockUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.lockUntil.getTime() - Date.now()) / 60000
      );

      return res.status(423).json({
        success: false,
        message: `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatches) {
      user.failedLoginAttempts += 1;

      if (user.failedLoginAttempts >= MAX_LOGIN_ATTEMPTS) {
        user.lockUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        user.failedLoginAttempts = 0;
      }

      await user.save();

      return res.status(401).json({
        success: false,
        message: "Invalid phone number or password"
      });
    }

    // Successful login — reset lockout state
    user.failedLoginAttempts = 0;
    user.lockUntil = null;

    const { accessToken, refreshToken } = await issueTokenPair(user);

    res.json({
      success: true,
      message: "Login successful",
      accessToken,
      refreshToken,
      expiresIn: ACCESS_TOKEN_TTL,
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
   REFRESH ACCESS TOKEN
========================================================= */

app.post("/api/auth/refresh", async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: "Refresh token is required"
      });
    }

    let decoded;

    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token"
      });
    }

    if (decoded.type !== "refresh") {
      return res.status(401).json({
        success: false,
        message: "Invalid token type"
      });
    }

    const user = await User.findById(decoded.id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid refresh token"
      });
    }

    const tokenHash = hashToken(refreshToken);
    const storedIndex = user.refreshTokens.findIndex(
      (t) => t.tokenHash === tokenHash
    );

    if (storedIndex === -1) {
      // Token not recognized (already used, revoked, or forged) —
      // treat as a possible compromise and wipe all sessions.
      user.refreshTokens = [];
      await user.save();

      return res.status(401).json({
        success: false,
        message: "Refresh token no longer valid. Please log in again."
      });
    }

    // Rotate: remove the used refresh token, issue a new pair
    user.refreshTokens.splice(storedIndex, 1);
    const accessToken = createAccessToken(user);
    const newRefreshToken = await createRefreshToken(user);

    res.json({
      success: true,
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: ACCESS_TOKEN_TTL
    });
  } catch (error) {
    console.error("Refresh error:", error);

    res.status(500).json({
      success: false,
      message: "Unable to refresh session"
    });
  }
});

/* =========================================================
   LOGOUT
========================================================= */

app.post("/api/auth/logout", async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.json({ success: true, message: "Logged out" });
    }

    let decoded;

    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (error) {
      // Already invalid/expired — nothing to revoke
      return res.json({ success: true, message: "Logged out" });
    }

    const user = await User.findById(decoded.id);

    if (user) {
      const tokenHash = hashToken(refreshToken);
      user.refreshTokens = user.refreshTokens.filter(
        (t) => t.tokenHash !== tokenHash
      );
      await user.save();
    }

    res.json({ success: true, message: "Logged out" });
  } catch (error) {
    console.error("Logout error:", error);

    res.status(500).json({
      success: false,
      message: "Logout failed"
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

    const text = message.trim().toLowerCase(
