const Activity = require("../models/Activity");

exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Activity
      .find({
        userId: req.user._id
      })
      .sort({
        createdAt: -1
      })
      .limit(30);

    res.json({
      success: true,
      notifications
    });

  } catch (error) {
    console.error("NOTIFICATIONS:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load notifications"
    });
  }
};
