const express = require("express");
const router = express.Router();

const SPORTS_API_KEY = process.env.SPORTS_API_KEY;
const SPORTS_API_URL =
  process.env.SPORTS_API_URL || "https://v3.football.api-sports.io";

/**
 * GET /api/sports/events
 *
 * Optional query parameters:
 *   ?league=39
 *   ?season=2025
 *   ?date=2026-08-17
 *   ?live=all
 */
router.get("/events", async (req, res) => {
  try {
    if (!SPORTS_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "SPORTS_API_KEY is not configured"
      });
    }

    const params = new URLSearchParams();

    if (req.query.league) params.append("league", req.query.league);
    if (req.query.season) params.append("season", req.query.season);
    if (req.query.date) params.append("date", req.query.date);
    if (req.query.live) params.append("live", req.query.live);

    const response = await fetch(
      `${SPORTS_API_URL}/fixtures?${params.toString()}`,
      {
        method: "GET",
        headers: {
          "x-apisports-key": SPORTS_API_KEY
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: "Sports API request failed",
        error: data
      });
    }

    return res.json({
      success: true,
      results: data.results || 0,
      response: data.response || []
    });
  } catch (error) {
    console.error("SPORTS API ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load sports events"
    });
  }
});


/**
 * GET /api/sports/live
 *
 * Returns currently live football matches.
 */
router.get("/live", async (req, res) => {
  try {
    if (!SPORTS_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "SPORTS_API_KEY is not configured"
      });
    }

    const response = await fetch(
      `${SPORTS_API_URL}/fixtures?live=all`,
      {
        headers: {
          "x-apisports-key": SPORTS_API_KEY
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: "Failed to load live matches",
        error: data
      });
    }

    return res.json({
      success: true,
      results: data.results || 0,
      response: data.response || []
    });
  } catch (error) {
    console.error("LIVE SPORTS API ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load live matches"
    });
  }
});


/**
 * GET /api/sports/leagues
 *
 * Returns available leagues.
 */
router.get("/leagues", async (req, res) => {
  try {
    if (!SPORTS_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "SPORTS_API_KEY is not configured"
      });
    }

    const response = await fetch(
      `${SPORTS_API_URL}/leagues`,
      {
        headers: {
          "x-apisports-key": SPORTS_API_KEY
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        message: "Failed to load leagues",
        error: data
      });
    }

    return res.json({
      success: true,
      results: data.results || 0,
      response: data.response || []
    });
  } catch (error) {
    console.error("LEAGUES API ERROR:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load leagues"
    });
  }
});


module.exports = router;
