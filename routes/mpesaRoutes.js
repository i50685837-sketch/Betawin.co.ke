const express = require('express');
const router = express.Router();

// Import the controller functions
const { initiatePayment, handleCallback } = require('../controllers/mpesaController');

/**
 * @route   POST /api/v1/mpesa/stkpush
 * @desc    Initiates an M-Pesa STK Push (Lipa Na M-Pesa Online)
 * @access  Public (Secure this with JWT or API keys in production)
 */
router.post('/stkpush', initiatePayment);

/**
 * @route   POST /api/v1/mpesa/callback
 * @desc    Webhook endpoint for Safaricom Daraja API to deliver transaction results
 * @access  Public (Must be open so Safaricom's servers can reach it)
 */
router.post('/callback', handleCallback);

module.exports = router;

