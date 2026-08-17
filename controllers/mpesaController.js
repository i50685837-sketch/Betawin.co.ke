const mpesaService = require('../services/mpesaservice');

const initiatePayment = async (req, res) => {
  try {
    const { phone, amount, reference } = req.body;

    if (!phone || !amount) {
      return res.status(400).json({ 
        success: false, 
        message: "Phone number and amount are required fields." 
      });
    }

    const result = await mpesaService.sendStkPush(phone, amount, reference);
    
    return res.status(200).json({ 
      success: true, 
      message: "STK Push triggered successfully.", 
      data: result 
    });
  } catch (error) {
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};

const handleCallback = async (req, res) => {
  try {
    const callbackData = req.body.Body.stkCallback;
    console.log("M-Pesa Callback Received:", JSON.stringify(callbackData, null, 2));

    if (callbackData.ResultCode === 0) {
      // Payment Successful. 
      // Look up transaction items inside callbackData.CallbackMetadata.Item array to update database.
    } else {
      // Payment failed or was canceled by user
      console.log(`Transaction failed: ${callbackData.ResultDesc}`);
    }

    // Safaricom expects an acknowledgment response
    return res.status(200).json({ ResultCode: 0, ResultDesc: "Success" });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

module.exports = { initiatePayment, handleCallback };

