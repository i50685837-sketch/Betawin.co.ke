// services/mpesa.service.js
//
// Talks to Safaricom's Daraja API directly. Nothing in here touches
// Express req/res or your database — that's the controller's job.
// Keeping this isolated means you can unit test it or swap providers
// without touching route/controller code.

const axios = require("axios");

const MPESA_BASE_URL =
  process.env.MPESA_ENV === "production"
    ? "https://api.safaricom.co.ke"
    : "https://sandbox.safaricom.co.ke";

function formatTimestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    d.getFullYear().toString() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

// Normalizes 07XXXXXXXX / 7XXXXXXXX / +2547XXXXXXXX into 2547XXXXXXXX
function normalizePhone(rawPhone) {
  let phone = String(rawPhone).replace(/\s+/g, "").replace(/^\+/, "");
  if (phone.startsWith("0")) phone = "254" + phone.slice(1);
  if (phone.startsWith("7") || phone.startsWith("1")) phone = "254" + phone;
  return phone;
}

async function getAccessToken() {
  const key = process.env.MPESA_CONSUMER_KEY;
  const secret = process.env.MPESA_CONSUMER_SECRET;

  if (!key || !secret) {
    const err = new Error("M-Pesa consumer key/secret not configured");
    err.status = 503;
    throw err;
  }

  const auth = Buffer.from(`${key}:${secret}`).toString("base64");

  const response = await axios.get(
    `${MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`,
    {
      headers: { Authorization: `Basic ${auth}` },
      timeout: 10000,
    }
  );

  return response.data.access_token;
}

/**
 * Sends the STK push prompt to the customer's phone.
 * @param {Object} params
 * @param {number} params.amount
 * @param {string} params.phone - raw phone, will be normalized
 * @param {string} params.accountReference
 * @param {string} params.description
 */
async function initiateStkPush({ amount, phone, accountReference = "Betawin", description = "Wallet deposit" }) {
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const callbackUrl = process.env.MPESA_CALLBACK_URL;

  if (!shortcode || !passkey || !callbackUrl) {
    const err = new Error("M-Pesa shortcode/passkey/callback URL not configured");
    err.status = 503;
    throw err;
  }

  const msisdn = normalizePhone(phone);
  const timestamp = formatTimestamp();
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");

  const accessToken = await getAccessToken();

  const response = await axios.post(
    `${MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`,
    {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(amount),
      PartyA: msisdn,
      PartyB: shortcode,
      PhoneNumber: msisdn,
      CallBackURL: callbackUrl,
      AccountReference: accountReference,
      TransactionDesc: description,
    },
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 15000,
    }
  );

  return {
    checkoutRequestId: response.data.CheckoutRequestID,
    merchantRequestId: response.data.MerchantRequestID,
    raw: response.data,
  };
}

/**
 * Optional: actively query STK status instead of waiting for the callback.
 * Useful as a fallback if a callback gets lost.
 */
async function queryStkStatus(checkoutRequestId) {
  const shortcode = process.env.MPESA_SHORTCODE;
  const passkey = process.env.MPESA_PASSKEY;
  const timestamp = formatTimestamp();
  const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString("base64");

  const accessToken = await getAccessToken();

  const response = await axios.post(
    `${MPESA_BASE_URL}/mpesa/stkpushquery/v1/query`,
    {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    },
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      timeout: 10000,
    }
  );

  return response.data;
}

module.exports = {
  normalizePhone,
  getAccessToken,
  initiateStkPush,
  queryStkStatus,
};

