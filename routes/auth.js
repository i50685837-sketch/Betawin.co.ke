const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const Activity = require("../models/Activity");
const authMiddleware =
  require("../middleware/authMiddleware");

const router = express.Router();

function generateToken(userId) {
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d"
    }
  );
}

/*
  REGISTER
*/

router.post("/register", async (req, res) => {
  try {
    const {
      fullName,
      phone,
      password,
      confirmPassword
    } = req.body;

    if (
      !fullName ||
      !phone ||
      !password ||
      !confirmPassword
    ) {
      return res.status(400).json({
        success: false,
        message: "All fields are required"
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match"
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message:
          "Password must contain at least 6 characters"
      });
    }

    const existing =
      await User.findOne({ phone });

    if (existing) {
      return res.status(409).json({
        success: false,
        message:
          "Phone number is already registered"
      });
    }

    const hashedPassword =
      await bcrypt.hash(password, 12);

    const user = await User.create({
      fullName,
      phone,
      password: hashedPassword
    });

    await Activity.create({
      userId: user._id,
      type: "account",
      title: "Account Created",
      description:
        "Your account was successfully created."
    });

    res.status(201).json({
      success: true,
      message: "Registration successful"
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Registration failed"
    });
  }
});


/*
  LOGIN
*/

router.post("/login", async (req, res) => {
  try {
    const {
      phone,
      password
    } = req.body;

    if (!phone || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Phone number and password are required"
      });
    }

    const user =
      await User
        .findOne({ phone })
        .select("+password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid phone number or password"
      });
    }

    const valid =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!valid) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid phone number or password"
      });
    }

    const token =
      generateToken(user._id.toString());

    await Activity.create({
      userId: user._id,
      type: "login",
      title: "Account Login",
      description:
        "You successfully logged into your account."
    });

    res.json({
      success: true,
      message: "Login successful",

      token,

      user: {
        id: user._id,
        fullName: user.fullName,
        phone: user.phone
      }
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Login failed"
    });
  }
});


/*
  CURRENT USER
*/

router.get(
  "/me",
  authMiddleware,
  async (req, res) => {

    res.json({
      success: true,

      user: {
        id: req.user._id,
        fullName: req.user.fullName,
        phone: req.user.phone,
        createdAt: req.user.createdAt
      }
    });

  }
);

module.exports = router;
