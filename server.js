require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const path = require("path");

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "public")));

const requiredEnv = [
  "MONGO_URI",
  "JWT_SECRET",
  "SPORTS_API_KEY",
  "MPESA_CONSUMER_KEY",
  "MPESA_CONSUMER_SECRET",
  "MPESA_SHORTCODE",
  "MPESA_PASSKEY"
];

const missing = requiredEnv.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error("❌ Missing environment variables:");
  console.error(missing.join(", "));
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });

app.get("/api/health", (req, res) => {
  res.json({
    server: "online",
    database: Boolean(process.env.MONGO_URI),
    sports: Boolean(process.env.SPORTS_API_KEY),
    mpesa: Boolean(process.env.MPESA_CONSUMER_KEY),
    casino: Boolean(process.env.CASINO_API_KEY),
    crash: Boolean(process.env.CRASH_API_KEY)
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
