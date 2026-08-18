// middleware/mpesa.middleware.js

const MIN_DEPOSIT = 10;
const MAX_DEPOSIT = 70000;

// Validates the incoming deposit request before it ever reaches Safaricom
function validateDepositRequest(req, res, next) {
  const { amount, phone } = req.body;
  const numericAmount = Number(amount);

  if (!numericAmount || Number.isNaN(numericAmount)) {
    return res.status(400).json({ success: false, message: "A valid amount is required" });
  }

  if (numericAmount < MIN_DEPOSIT || numericAmount > MAX_DEPOSIT) {
    return res.status(400).json({
      success: false,
      message: `Amount must be between KES ${MIN_DEPOSIT} and KES ${MAX_DEPOSIT.toLocaleString()}`,
    });
  }

  if (!phone || !/^(0|\+?254)?[71]\d{8}$/.test(String(phone).replace(/\s+/g, ""))) {
    return res.status(400).json({ success: false, message: "Enter a valid Kenyan phone number" });
  }

  req.body.amount = numericAmount;
  next();
}

// Best-effort check that the callback is actually coming from Safaricom.
// Safaricom's IP ranges can change, so treat this as a soft layer, not
// your only line of defense — the real trust anchor is that you only act
// on CheckoutRequestIDs your own server generated (see controller).
const SAFARICOM_IP_PREFIXES = ["196.201.21", "196.201.22", "196.201.23"];

function logCallbackSource(req, res, next) {
  const ip = (req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").toString();
  const looksLikeSafaricom = SAFARICOM_IP_PREFIXES.some((prefix) => ip.includes(prefix));

  if (!looksLikeSafaricom) {
    console.warn(`[mpesa] Callback received from unexpected IP: ${ip} — proceeding, but verify your callback URL isn't publicly guessable.`);
  }

  next();
}

module.exports = { validateDepositRequest, logCallbackSource, MIN_DEPOSIT, MAX_DEPOSIT };

