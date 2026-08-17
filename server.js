/**
 * server.js
 * Comprehensive Entry Point for a Gambling Support Backend Application
 * Integrates: M-Pesa Daraja, Pesapal v3, JWT Auth, MongoDB (Mongoose), and Live Sports API.
 */

require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const axios = require('axios');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PORT = process.env.PORT || 3000;

// ==========================================
// 1. MONGODB CONNECTION & SCHEMAS
// ==========================================
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:2017/gambling_platform')
  .then(() => console.log('MongoDB Connected Successfully'))
  .catch(err => console.error('MongoDB Connection Error:', err));

const UserSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  phone: { type: String, required: true, unique: true }, // Format: 2547XXXXXXXX
  password: { type: String, required: true },
  balance: { type: Number, default: 0 }
});

const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reference: { type: String, required: true, unique: true },
  amount: { type: Number, required: true },
  provider: { type: String, enum: ['mpesa', 'pesapal'], required: true },
  status: { type: String, enum: ['Pending', 'Completed', 'Failed'], default: 'Pending' },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Transaction = mongoose.model('Transaction', TransactionSchema);

// ==========================================
// 2. MIDDLEWARE FOR JWT AUTHENTICATION
// ==========================================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ error: 'Access token missing' });

  jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret', (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

// ==========================================
// 3. AUTHENTICATION ROUTES (JWT)
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, phone, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newUser = new User({ username, phone, password: hashedPassword });
    await newUser.save();
    
    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    res.status(400).json({ error: 'Registration failed', details: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ error: 'User not found' });

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) return res.status(400).json({ error: 'Invalid password' });

    const token = jwt.sign({ id: user._id, phone: user.phone }, process.env.JWT_SECRET || 'fallback_secret', { expiresIn: '2h' });
    res.json({ token, balance: user.balance });
  } catch (error) {
    res.status(500).json({ error: 'Login server error' });
  }
});

// ==========================================
// 4. M-PESA DARAJA INTEGRATION
// ==========================================
// Middleware to generate M-Pesa OAuth Token
const getMpesaToken = async (req, res, next) => {
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  try {
    const response = await axios.get('https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials', {
      headers: { Authorization: `Basic ${auth}` }
    });
    req.mpesaToken = response.data.access_token;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate M-Pesa token', log: error.message });
  }
};

// STK Push Trigger
app.post('/api/payment/mpesa-stk', authenticateToken, getMpesaToken, async (req, res) => {
  const { amount } = req.body;
  const phone = req.user.phone; // Extracted from verified JWT
  
  const shortCode = process.env.MPESA_SHORTCODE || '174379';
  const passKey = process.env.MPESA_PASSKEY;
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const password = Buffer.from(`${shortCode}${passKey}${timestamp}`).toString('base64');
  const callbackUrl = process.env.MPESA_CALLBACK_URL;

  const checkoutRequest = {
    BusinessShortCode: shortCode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: amount,
    PartyA: phone,
    PartyB: shortCode,
    PhoneNumber: phone,
    CallBackURL: callbackUrl,
    AccountReference: 'GamblingPlatform',
    TransactionDesc: 'Wallet Top Up'
  };

  try {
    const response = await axios.post('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', checkoutRequest, {
      headers: { Authorization: `Bearer ${req.mpesaToken}` }
    });

    // Save initial transaction state
    const transaction = new Transaction({
      userId: req.user.id,
      reference: response.data.CheckoutRequestID,
      amount: amount,
      provider: 'mpesa',
      status: 'Pending'
    });
    await transaction.save();

    res.json({ message: 'STK push initialized successfully', data: response.data });
  } catch (error) {
    res.status(500).json({ error: 'STK Push initialization failed', details: error.response?.data || error.message });
  }
});

// M-Pesa Callback Endpoint
app.post('/api/payment/mpesa-callback', async (req, res) => {
  const { Body } = req.body;
  if (!Body || !Body.stkCallback) return res.status(400).send('Invalid Callback data');

  const { MerchantRequestID, CheckoutRequestID, ResultCode } = Body.stkCallback;

  try {
    const transaction = await Transaction.findOne({ reference: CheckoutRequestID });
    if (!transaction) return res.status(404).send('Transaction reference mismatch');

    if (ResultCode === 0) {
      transaction.status = 'Completed';
      await transaction.save();

      // Credit User Balance
      await User.findByIdAndUpdate(transaction.userId, { $inc: { balance: transaction.amount } });
      console.log(`Wallet credited successfully for transaction: ${CheckoutRequestID}`);
    } else {
      transaction.status = 'Failed';
      await transaction.save();
    }
    res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    res.status(500).send('Error handling callback processing');
  }
});

// ==========================================
// 5. PESAPAL v3 INTEGRATION
// ==========================================
const getPesapalToken = async (req, res, next) => {
  try {
    const response = await axios.post('https://cybqa.pesapal.com/pesapalv3/api/Auth/RequestToken', {
      consumer_key: process.env.PESAPAL_CONSUMER_KEY,
      consumer_secret: process.env.PESAPAL_CONSUMER_SECRET
    });
    req.pesapalToken = response.data.token;
    next();
  } catch (error) {
    res.status(500).json({ error: 'Failed to authenticate with Pesapal v3' });
  }
};

// Register IPN (Instant Payment Notification) URL with Pesapal
app.post('/api/payment/pesapal-ipn', getPesapalToken, async (req, res) => {
  try {
    const response = await axios.post('https://cybqa.pesapal.com/pesapalv3/api/URLSetup/RegisterIPN', {
      url: process.env.PESAPAL_IPN_URL,
      ipn_notification_type: 'GET'
    }, {
      headers: { Authorization: `Bearer ${req.pesapalToken}` }
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to register Pesapal IPN URL' });
  }
});

// Order Initiation
app.post('/api/payment/pesapal-order', authenticateToken, getPesapalToken, async (req, res) => {
  const { amount, description } = req.body;
  const merchantRef = 'PESA_' + Math.floor(100000 + Math.random() * 900000);

  const orderPayload = {
    id: merchantRef,
    currency: 'KES',
    amount: amount,
    description: description || 'Deposit to Gaming Account',
    callback_url: process.env.PESAPAL_CALLBACK_URL,
    notification_id: process.env.PESAPAL_IPN_ID,
    billing_address: {
      phone_number: req.user.phone
    }
  };

  try {
    const response = await axios.post('https://cybqa.pesapal.com/pesapalv3/api/Transactions/SubmitOrderRequest', orderPayload, {
      headers: { Authorization: `Bearer ${req.pesapalToken}` }
    });

    const transaction = new Transaction({
      userId: req.user.id,
      reference: response.data.order_tracking_id,
      amount: amount,
      provider: 'pesapal',
      status: 'Pending'
    });
    await transaction.save();

    res.json({ message: 'Order submitted', redirect_url: response.data.redirect_url, order_tracking_id: response.data.order_tracking_id });
  } catch (error) {
    res.status(500).json({ error: 'Pesapal order execution failed', details: error.response?.data || error.message });
  }
});

// Pesapal IPN Listener Hook
app.get('/api/payment/pesapal-callback', getPesapalToken, async (req, res) => {
  const { OrderTrackingId, OrderMerchantReference } = req.query;

  try {
    const statusResponse = await axios.get(`https://cybqa.pesapal.com/pesapalv3/api/Transactions/GetTransactionStatus?orderTrackingId=${OrderTrackingId}`, {
      headers: { Authorization: `Bearer ${req.pesapalToken}` }
    });

    const paymentStatus = statusResponse.data.payment_status_description; // "Completed", "Failed" etc.
    const transaction = await Transaction.findOne({ reference: OrderTrackingId });

    if (transaction && transaction.status === 'Pending') {
      if (paymentStatus === 'Completed') {
        transaction.status = 'Completed';
        await transaction.save();
        await User.findByIdAndUpdate(transaction.userId, { $inc: { balance: transaction.amount } });
      } else if (paymentStatus === 'Failed') {
        transaction.status = 'Failed';
        await transaction.save();
      }
    }
    res.json({ message: 'Status processed successfully', status: paymentStatus });
  } catch (error) {
    res.status(500).json({ error: 'Error pulling Pesapal transaction status verification' });
  }
});

// ==========================================
// 6. LIVE SPORTS ODDS API INTEGRATION
// ==========================================
// Integrates standard fixtures from api-football or the-odds-api
app.get('/api/sports/fixtures', authenticateToken, async (req, res) => {
  const SPORTS_API_KEY = process.env.SPORTS_API_KEY;
  const SPORTS_API_URL = process.env.SPORTS_API_URL || 'https://api.the-odds-api.com/v4/sports/soccer_epl/odds';

  try {
    // Configured natively for The Odds API as a standard production example
    const response = await axios.get(SPORTS_API_URL, {
      params: {
        apiKey: SPORTS_API_KEY,
        regions: 'eu',
        markets: 'h2h',
        oddsFormat: 'decimal'
      }
    });
    
    res.json({
      success: true,
      fixtures: response.data
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch sports events fixtures', 
      details: error.response?.data || error.message 
    });
  }
});

// App Startup Engine Initialization
app.listen(PORT, () => {
  console.log(`Backend Application server executing securely on runtime port: ${PORT}`);
});
