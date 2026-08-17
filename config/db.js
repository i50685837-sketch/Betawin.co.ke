const mongoose = require("mongoose");

async function connectDB() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured");
  }

  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("✅ MongoDB Connected");

  } catch (error) {
    console.error(
      "❌ MongoDB Connection Failed:",
      error.message
    );

    throw error;
  }
}

module.exports = connectDB;
