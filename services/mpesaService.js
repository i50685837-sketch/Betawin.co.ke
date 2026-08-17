const axios = require('axios');

class MpesaService {
  constructor() {
    this.consumerKey = process.env.MPESA_CONSUMER_KEY;
    this.consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    this.shortCode = process.env.MPESA_SHORTCODE || '174379'; // Default Sandbox Till
    this.passkey = process.env.MPESA_PASSKEY || 'bfb272756020a96b4da30a3b953707407547a1552d33d84a2485c53554d65c6d';
    this.callbackUrl = process.env.MPESA_CALLBACK_URL;
    this.baseUrl = process.env.MPESA_ENV === 'production' 
      ? 'https://api.safaricom.co.ke' 
      : 'https://sandbox.safaricom.co.ke';
  }

  async getAccessToken() {
    const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
    try {
      const response = await axios.get(
        `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
        { headers: { Authorization: `Basic ${auth}` } }
      );
      return response.data.access_token;
    } catch (error) {
      throw new Error(`Auth Failed: ${error.response?.data?.errorMessage || error.message}`);
    }
  }

  async initiateStkPush(phone, amount, reference) {
    // Sanitize phone number to format: 2547XXXXXXXX or 2541XXXXXXXX
    let formattedPhone = phone.replace(/\s+/g, '').replace(/\+/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '254' + formattedPhone.slice(1);
    } else if (formattedPhone.startsWith('7') || formattedPhone.startsWith('1')) {
      formattedPhone = '254' + formattedPhone;
    }

    if (!/^254[17]\d{8}$/.test(formattedPhone)) {
      throw new Error('Invalid Safaricom phone number format. Use 2547XXXXXXXX or 07XXXXXXXX');
    }

    const accessToken = await this.getAccessToken();
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
    const password = Buffer.from(`${this.shortCode}${this.passkey}${timestamp}`).toString('base64');

    const body = {
      BusinessShortCode: this.shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.ceil(amount),
      PartyA: formattedPhone,
      PartyB: this.shortCode,
      PhoneNumber: formattedPhone,
      CallBackURL: this.callbackUrl,
      AccountReference: reference.substring(0, 12),
      TransactionDesc: 'STK Push Payment',
    };

    try {
      const response = await axios.post(
        `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
        body,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      return response.data;
    } catch (error) {
      throw new Error(`STK Push Request Failed: ${error.response?.data?.errorMessage || error.message}`);
    }
  }
}

module.exports = new MpesaService();
