const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

// Load environment variables
dotenv.config();

const app = express();

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static HTML/CSS/JS files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// --- DATABASE CONNECTION ---
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    process.exit(1);
  }
};
connectDB();

// --- MONGOOSE USER MODEL ---
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  phoneNumber: { type: String, required: true }
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', userSchema);

// --- JWT AUTHENTICATION MIDDLEWARE ---
const verifyJwt = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach decoded payload (userId, email, phoneNumber) to request
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token.' });
  }
};

// --- AUTHENTICATION ROUTES ---

// 1. Register User
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, phoneNumber } = req.body;

    if (!name || !email || !password || !phoneNumber) {
      return res.status(400).json({ error: 'All fields are required.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      phoneNumber
    });

    res.status(201).json({
      message: 'User registered successfully',
      user: { id: newUser._id, name: newUser.name, email: newUser.email }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Login User (Returns JWT)
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    // Sign JWT token valid for 24 hours
    const token = jwt.sign(
      { userId: user._id, email: user.email, phoneNumber: user.phoneNumber },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(200).json({
      message: 'Login successful',
      token,
      user: { id: user._id, name: user.name, email: user.email, phoneNumber: user.phoneNumber }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- M-PESA ROUTES (PROTECTED WITH verifyJwt) ---
const mpesaRoutes = require('./routes/mpesa');
app.use('/api/mpesa', verifyJwt, mpesaRoutes);

// --- FALLBACK ROUTE TO SERVE FRONTEND ---
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- START SERVER ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});
