const express = require("express");

const Activity =
  require("../models/Activity");

const authMiddleware =
  require("../middleware/authMiddleware");

const router = express.Router();


/*
  GET CURRENT USER ACTIVITY
*/

router.get(
  "/",
  authMiddleware,
  async (req, res) => {

    try {

      const activities =
        await Activity
          .find({
            userId: req.user._id
          })
          .sort({
            createdAt: -1
          })
          .limit(50);

      res.json({
        success: true,
        activities
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        success: false,
        message:
          "Unable to load activity"
      });
    }
  }
);

module.exports = router;
