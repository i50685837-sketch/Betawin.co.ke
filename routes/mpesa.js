const express = require('express');
const router = express.Router();
const axios = require('axios');
const mongoose = require('mongoose');

// --- MONGOOSE TRANSACTION SCHEMA & MODEL ---
const transactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  phoneNumber: { type: String, required: true },
  amount: { type: Number, required: true },
  checkoutRequestId: { type: String, required: true, unique: true },
  merchantRequestId: { type: String },
  mpesaReceiptNumber: { type: String },
  status: { type: String, enum: ['PENDING', 'SUCCESS', 'FAILED'], default: 'PENDING' },
  resultDesc: { type: String }
}, { timestamps: true });

const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', transactionSchema);

// --- DARAJA OAUTH MIDDLEWARE ---
const getMpesaToken = async (req, res, next) => {
  const secret = process.env.MPESA_CONSUMER_SECRET;
  const key = process.env.MPESA_CONSUMER_KEY;

  if (!key || !secret) {
    return res.status(500).json({ error: 'M-Pesa Consumer Key or Secret is missing in environment variables.' });
  }

  const auth = Buffer.from(`${key}:${secret}`).toString('base64');

  try {
    const response = await axios.get(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      { headers: { Authorization: `Basic ${auth}` } }
    );
    req.token = response.data.access_token;
    next();
  } catch (error) {
    console.error('M-Pesa Token Generation Error:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to generate M-Pesa OAuth access token' });
  }
};

// --- ROUTES ---

/**
 * @route   POST /api/mpesa/stkpush
 * @desc    Initiate Lipa Na M-Pesa Online (STK Push)
 * @access  Private (Requires verifyJwt middleware in server.js)
 */
router.post('/stkpush', getMpesaToken, async (req, res) => {
  try {
    const { amount } = req.body;
    // Extract userId and default phone number directly from JWT payload set by verifyJwt
    const userId = req.user.userId;
    const rawPhone = req.body.phoneNumber || req.user.phoneNumber;

    if (!rawPhone || !amount) {
      return res.status(400).json({ error: 'Phone number and amount are required.' });
    }

    // Standardize phone number format to 2547XXXXXXXX or 2541XXXXXXXX
    const formattedPhone = rawPhone.toString().trim().replace(/^(\+254|0)/, '254');

    const shortCode = process.env.MPESA_PAYBILL; // e.g., 174379 for Sandbox
    const passkey = process.env.MPESA_PASSKEY;
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14); // Format: YYYYMMDDHHmmss
    const password = Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64');

    const payload = {
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: formattedPhone,
      PartyB: shortCode,
      PhoneNumber: formattedPhone,
      CallBackURL: `${process.env.SERVER_BASE_URL}/api/mpesa/callback`,
      AccountReference: 'Betawin',
      TransactionDesc: 'Deposit to Betawin account'
    };

    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      payload,
      { headers: { Authorization: `Bearer ${req.token}` } }
    );

    // Save initial transaction record as PENDING in MongoDB
    await Transaction.create({
      userId,
      phoneNumber: formattedPhone,
      amount,
      checkoutRequestId: response.data.CheckoutRequestID,
      merchantRequestId: response.data.MerchantRequestID,
      status: 'PENDING'
    });

    res.status(200).json({
      message: 'STK Push sent to phone successfully',
      checkoutRequestId: response.data.CheckoutRequestID,
      customerMessage: response.data.CustomerMessage
    });
  } catch (error) {
    console.error('STK Push Error:', error.response?.data || error.message);
    res.status(500).json({
      error: 'STK Push request failed',
      details: error.response?.data || error.message
    });
  }
});

/**
 * @route   POST /api/mpesa/callback
 * @desc    Asynchronous Webhook called by Safaricom Daraja
 * @access  Public (Called directly by Safaricom)
 */
router.post('/callback', async (req, res) => {
  // Acknowledge receipt immediately to Safaricom
  res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });

  try {
    const callbackData = req.body?.Body?.stkCallback;
    if (!callbackData) return;

    const { ResultCode, ResultDesc, CheckoutRequestID, CallbackMetadata } = callbackData;

    const transaction = await Transaction.findOne({ checkoutRequestId: CheckoutRequestID });
    if (!transaction) {
      console.warn(`Transaction not found for CheckoutRequestID: ${CheckoutRequestID}`);
      return;
    }

    if (ResultCode === 0 && CallbackMetadata) {
      // Payment Successful
      const metadataItems = CallbackMetadata.Item;
      const mpesaReceiptNumber = metadataItems.find(item => item.Name === 'MpesaReceiptNumber')?.Value;

      transaction.status = 'SUCCESS';
      transaction.mpesaReceiptNumber = mpesaReceiptNumber;
      transaction.resultDesc = ResultDesc;
      await transaction.save();

      console.log(`Payment Successful: ${mpesaReceiptNumber} for user ${transaction.userId}`);
    } else {
      // Payment Failed, Cancelled, or Timed Out
      transaction.status = 'FAILED';
      transaction.resultDesc = ResultDesc;
      await transaction.save();

      console.log(`Payment Failed for CheckoutRequestID ${CheckoutRequestID}: ${ResultDesc}`);
    }
  } catch (error) {
    console.error('Error processing M-Pesa callback:', error.message);
  }
});

module.exports = router;
  
