// controllers/mpesa.controller.js

const mpesaService = require("../services/mpesa.service");
const Transaction = require("../models/Transaction");
const User = require("../models/User"); // adjust path to match your project

// POST /api/payments/mpesa/stkpush
exports.initiateDeposit = async (req, res) => {
  try {
    const { amount, phone } = req.body; // already validated by middleware

    const { checkoutRequestId, merchantRequestId } = await mpesaService.initiateStkPush({
      amount,
      phone,
      accountReference: "Betawin",
      description: "Betawin wallet deposit",
    });

    await Transaction.create({
      user: req.user.id,
      type: "deposit",
      amount,
      phone: mpesaService.normalizePhone(phone),
      status: "pending",
      checkoutRequestId,
      merchantRequestId,
    });

    res.json({
      success: true,
      message: "STK prompt sent — enter your M-Pesa PIN to complete the deposit",
      checkoutRequestId,
    });
  } catch (error) {
    console.error("[mpesa] STK push error:", error.response?.data || error.message);
    res.status(error.status || 502).json({
      success: false,
      message: "Could not initiate M-Pesa payment. Please try again.",
    });
  }
};

// POST /api/payments/mpesa/callback  (called by Safaricom, not your frontend)
exports.handleCallback = async (req, res) => {
  try {
    const callback = req.body?.Body?.stkCallback;

    if (!callback) {
      return res.status(400).json({ success: false, message: "Malformed callback" });
    }

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callback;

    const transaction = await Transaction.findOne({ checkoutRequestId: CheckoutRequestID });

    if (!transaction) {
      console.warn("[mpesa] Callback for unknown transaction:", CheckoutRequestID);
      return res.json({ ResultCode: 0, ResultDesc: "Accepted" }); // ack anyway, avoid retry storms
    }

    // Idempotency guard — if this transaction was already settled, don't credit twice
    if (transaction.status !== "pending") {
      return res.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }

    transaction.resultCode = ResultCode;
    transaction.resultDesc = ResultDesc;

    if (ResultCode === 0) {
      const items = CallbackMetadata?.Item || [];
      const receipt = items.find((i) => i.Name === "MpesaReceiptNumber")?.Value;

      transaction.status = "completed";
      transaction.mpesaReceiptNumber = receipt || "";
      await transaction.save();

      await User.findByIdAndUpdate(transaction.user, {
        $inc: { walletBalance: transaction.amount },
      });
    } else {
      transaction.status = "failed";
      await transaction.save();
    }

    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    console.error("[mpesa] Callback handling error:", error);
    res.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
};

// GET /api/payments/mpesa/status/:checkoutRequestId
exports.getDepositStatus = async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      checkoutRequestId: req.params.checkoutRequestId,
      user: req.user.id,
    });

    if (!transaction) {
      return res.status(404).json({ success: false, message: "Transaction not found" });
    }

    // If still pending after a while, optionally double-check with Safaricom directly
    if (transaction.status === "pending" && req.query.forceCheck === "true") {
      try {
        const result = await mpesaService.queryStkStatus(transaction.checkoutRequestId);
        if (String(result.ResultCode) === "0") {
          transaction.status = "completed";
          await transaction.save();
          await User.findByIdAndUpdate(transaction.user, { $inc: { walletBalance: transaction.amount } });
        } else if (result.ResultCode !== undefined) {
          transaction.status = "failed";
          await transaction.save();
        }
      } catch (e) {
        // Query failed (e.g. still processing) — leave status as pending
      }
    }

    res.json({
      success: true,
      status: transaction.status,
      amount: transaction.amount,
      receipt: transaction.mpesaReceiptNumber || null,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not check deposit status" });
  }
};

