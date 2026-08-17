const Activity = require("../models/Activity");

exports.getProfile = async (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user._id,
      fullName: req.user.fullName,
      phone: req.user.phone,
      createdAt: req.user.createdAt
    }
  });
};

exports.updateProfile = async (req, res) => {
  try {
    const { fullName } = req.body;

    if (!fullName || fullName.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Valid full name required"
      });
    }

    req.user.fullName = fullName.trim();

    await req.user.save();

    await Activity.create({
      userId: req.user._id,
      type: "profile",
      title: "Profile Updated",
      description: "Your profile was updated."
    });

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: req.user._id,
        fullName: req.user.fullName,
        phone: req.user.phone
      }
    });

  } catch (error) {
    console.error("PROFILE:", error);

    res.status(500).json({
      success: false,
      message: "Unable to update profile"
    });
  }
};
