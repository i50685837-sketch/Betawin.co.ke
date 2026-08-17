const Activity = require("../models/Activity");

exports.getActivity = async (req, res) => {
  try {
    const activities = await Activity
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
    console.error("ACTIVITY:", error);

    res.status(500).json({
      success: false,
      message: "Unable to load activity"
    });
  }
};

exports.createActivity = async (req, res) => {
  try {
    const {
      type,
      title,
      description
    } = req.body;

    if (!type || !title) {
      return res.status(400).json({
        success: false,
        message: "Activity type and title are required"
      });
    }

    const activity = await Activity.create({
      userId: req.user._id,
      type,
      title,
      description: description || ""
    });

    res.status(201).json({
      success: true,
      activity
    });

  } catch (error) {
    console.error("CREATE ACTIVITY:", error);

    res.status(500).json({
      success: false,
      message: "Unable to create activity"
    });
  }
};
