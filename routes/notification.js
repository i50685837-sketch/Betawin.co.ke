const express = require("express");

const authMiddleware =
  require("../middleware/authMiddleware");

const notificationController =
  require("../controllers/notificationController");

const router = express.Router();

/*
  GET /api/notifications

  Returns notifications/activity
  belonging to the logged-in user.
*/
router.get(
  "/",
  authMiddleware,
  notificationController.getNotifications
);

module.exports = router;
