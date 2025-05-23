const User = require("../models/user");
const Course = require("../models/Course");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { sendEmail } = require("../utils/emailService");
const logger = require("../utils/logger");
const generateVerificationCode = () =>
  crypto.randomInt(100000, 999999).toString();
const { validationResult } = require("express-validator");



exports.getEnrolledCourses = async (req, res) => {
  try {
    logger.info("getEnrolledCourses Endpoint called");
    const userId = req.user.id; 
    logger.info(`Fetching enrolled courses for user ID: ${userId}`);
    const courses = await Course.find({ students: userId });

    if (!courses || courses.length === 0) {
      logger.warn(`No enrolled courses found for user ID: ${userId}`);
      return res.status(404).json({ message: "No enrolled courses found" });
    }

    logger.info(`Enrolled courses fetched successfully for user ID: ${userId}`);
    return res.status(200).json({
      message: "Enrolled courses fetched successfully",
      courses,
    });
  } catch (error) {
    logger.error(`Error fetching enrolled courses for user ID: ${req.user.id} - ${error.message}`);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};
exports.signUp = async (req, res) => {
  try {
    logger.info("User SignUp called");
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn("Validation errors in signUp: " + JSON.stringify(errors.array()));
      return res.status(400).json({ errors: errors.array() });
    }
    const { firstName, lastName, email, password, phoneNumber, role } = req.body;
    const existingUser = await User.findOne({ email: email });
    if (existingUser) {
      logger.warn(`User already exists with email: ${email}`);
      return res.status(400).json({ msg: "User already exists" });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationCode = generateVerificationCode();
    const verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000);

    const user = await new User({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      phoneNumber,
      role,
      verificationCode,
      verificationCodeExpires,
    }).save();
    logger.info(`New user created with email: ${email}`);
    await sendEmail(
      email,
      "Account Verification Code",
      `Your verification code is: ${verificationCode}. It expires in 10 minutes.`
    );
    logger.info(`Verification email sent to: ${email}`);

    return res.status(201).json({
      message:
        "Signed Up Successfully. Check your email for the verification code.",
    });
  } catch (error) {
    logger.error("Error in signUp: " + error.message);
    res.status(500).json({
      msg: error.message,
    });
  }
};
exports.verifyAccount = async (req, res) => {
  try {
    logger.info("verifyAccount function called");
    const { email, verificationCode } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      logger.warn(`User not found with email: ${email}`);
      return res.status(404).json({ message: "User not found" }); 
    } 

     if (user.isVerified) {
      logger.warn(`Account already verified for email: ${email}`);
      return res.status(400).json({ message: "Account is already verified" });
    }

    if (!user.verificationCode || user.verificationCodeExpires < new Date()) {
      logger.warn(`Verification code expired for email: ${email}`);
      return res
        .status(400)
        .json({ message: "Verification code expired. Request a new one." });
    }

    if (user.verificationCode !== verificationCode) {
      logger.warn(`Invalid verification code for email: ${email}`);
      return res.status(400).json({ message: "Invalid verification code" });
    }

    user.isVerified = true;
    user.verificationCode = null;
    user.verificationCodeExpires = null;
    await user.save();
    logger.info(`Account verified for email: ${email}`);
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    return res
      .status(200)
      .json({ message: "Account verified successfully", token });
  } catch (error) {
    logger.error("Error in verifyAccount: " + error.message);
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};
exports.resendVerificationCode = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.isVerified)
      return res.status(400).json({ message: "Account is already verified" });

    const newVerificationCode = generateVerificationCode();
    user.verificationCode = newVerificationCode;
    user.verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    await sendEmail(
      email,
      "New Verification Code",
      `Your new verification code is: ${newVerificationCode}. It expires in 10 minutes.`
    );

    return res.status(200).json({ message: "New verification code sent." });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};
exports.signIn = async (req,res) => {
  try {
    let { email, password } = req.body
    let singleUser = await User.findOne ({
      email
    })

    if (singleUser) {
      let isEqual = await bcrypt.compare(password, singleUser.password);
      if(isEqual) {
        let token = jwt.sign({
          id: singleUser._id
        }, process.env.JWT_SECRET);
      res.json ({
        message:
            "User logged in successfully",
        token
        })

      } else {
        return res.status(404).json({ message: "Incorrect Login Details" });
      }
    } else {
      return res.status(404).json({ message: "User not found" });
    }
  } catch(error) {
    console.error(error.message);
    res.status(500).json({
      msg: error.message,
    });

  }
}


exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    await User.findByIdAndDelete(id);
    return res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};


exports.updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, password, phoneNumber, role } = req.body;

    if (!firstName && !lastName && !email && !password && !phoneNumber && !role) {
      return res.status(400).json({ message: "No fields provided to update" });
    }
    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (email) user.email = email;
    if (phoneNumber) user.phoneNumber = phoneNumber;
    if (password) user.password = await bcrypt.hash(password, 10);
    if (role && req.user.role === "admin") user.role = role; 
    await user.save();

    return res.status(200).json({ message: "User updated successfully", user });
  } catch (error) {
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; 
    await user.save();

    const resetUrl = `${req.protocol}://${req.get("host")}/api/lms/users/reset-password/${resetToken}`;
    const message = `You requested a password reset. Click the link below to reset your password:\n\n${resetUrl}\n\nIf you did not request this, please ignore this email.`;

    await sendEmail(email, "Password Reset Request", message);

    return res.status(200).json({ message: "Password reset email sent." });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match" });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }, 
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired token" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    return res.status(200).json({ message: "Password reset successfully" });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};
exports.getUserProfile = async (req, res) => {
  try {
    logger.info("getUserProfile endpoint called");
    const userId = req.user.id; 
    const user = await User.findById(userId).select("-password"); 

    if (!user) {
      logger.warn(`User not found with ID: ${userId}`);
      return res.status(404).json({ message: "User not found" });
    }

    logger.info(`User profile fetched successfully for ID: ${userId}`);
    return res.status(200).json({ message: "User profile fetched successfully", user });
  } catch (error) {
    logger.error(`Error fetching user profile for ID: ${req.user.id} - ${error.message}`);
    return res.status(500).json({ message: "Server error", error: error.message });
  }
};
exports.signOut = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: 'Invalid token format' });
    }
    return res.status(200).json({ message: 'User signed out successfully' });
  } catch (error) {
    logger.error(error.message);
    return res.status(500).json({ message: 'Something went wrong during signout' });
  }
};
