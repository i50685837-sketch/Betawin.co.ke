const axios = require('axios');
require('dotenv').config();

class MpesaService {
  constructor() {
    this.consumerKey = process.env.MPESA_CONSUMER_KEY;
    this.consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    this.shortCode = process.env.MPESA_SHORTCODE;
    this.passKey = process.env.MPESA_PASSKEY;
    this.callbackUrl = process.env.MPESA_CALLBACK_URL;
    
    this.baseUrl = process.env.MPESA_ENVIRONMENT === 'live' 
      ? 'https://safaricom.co.ke' 
      : 'https://safaricom.co.ke';
  }

  // Generates current timestamp in YYYYMMDDHHmmss format
  getTimestamp() {
    const date = new Date();
    return date.getFullYear() +
      String(date.getMonth() + 1).padStart(2, '0') +
      String(date.getDate()).padStart(2, '0') +
      String(date.getHours()).padStart(2, '0') +
      String(date.getMinutes()).padStart(2, '0') +
      String(date.getSeconds()).padStart(2, '0');
  }

  // Generates OAuth Access Token
  async getAccessToken() {
    const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
    
    try {
      const response = await axios.get(
        `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
        { headers: { Authorization: `Basic ${auth}` } }
      );
      return response.data.access_token;
    } catch (error) {
      throw new Error(`Failed to generate token: ${error.response?.data?.errorMessage || error.message}`);
    }
  }

  // Initiates STK Push
  async sendStkPush(phone, amount, accountReference) {
    const token = await this.getAccessToken();
    const timestamp = this.getTimestamp();
    
    // Password generation: Base64(ShortCode + PassKey + Timestamp)
    const password = Buffer.from(`${this.shortCode}${this.passKey}${timestamp}`).toString('base64');
    
    // Format phone to 2547XXXXXXXX or 2541XXXXXXXX
    let formattedPhone = phone.replace(/^(?:\+254|0|^)/, '254');

    const payload = {
      BusinessShortCode: this.shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(amount),
      PartyA: formattedPhone,
      PartyB: this.shortCode,
      PhoneNumber: formattedPhone,
      CallBackURL: this.callbackUrl,
      AccountReference: accountReference || "Payment",
      TransactionDesc: "STK Push payment"
    };

    try {
      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
        payload,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.errorMessage || error.message);
    }
  }
}

module.exports = new MpesaService();

