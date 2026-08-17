const express = require("express");

const User =
  require("../models/User");

const Activity =
  require("../models/Activity");

const authMiddleware =
  require("../middleware/authMiddleware");

const router = express.Router();


/*
  GET PROFILE
*/

router.get(
  "/profile",
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


/*
  UPDATE FULL NAME
*/

router.patch(
  "/profile",
  authMiddleware,
  async (req, res) => {

    try {

      const { fullName } = req.body;

      if (!fullName || fullName.trim().length < 2) {
        return res.status(400).json({
          success: false,
          message: "Valid full name required"
        });
      }

      req.user.fullName =
        fullName.trim();

      await req.user.save();

      await Activity.create({
        userId: req.user._id,
        type: "profile",
        title: "Profile Updated",
        description:
          "Your profile was updated successfully."
      });

      res.json({
        success: true,
        message: "Profile updated",

        user: {
          id: req.user._id,
          fullName: req.user.fullName,
          phone: req.user.phone
        }
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        success: false,
        message:
          "Unable to update profile"
      });
    }
  }
);

module.exports = router;
