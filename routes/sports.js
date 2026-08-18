const express = require("express");

const {
  getFixtures,
  getLiveScores,
  getTeams,
  getStandings,
  getFixtureById,
  getTeamById
} = require("../services/sportsAPI");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| GET /api/sports/fixtures
|--------------------------------------------------------------------------
| Query parameters:
| ?league=premier-league
| ?date=2026-08-20
| ?team=123
| ?page=1
| ?limit=50
*/
router.get("/fixtures", async (req, res) => {
  try {
    const {
      league,
      date,
      team,
      page = 1,
      limit = 50
    } = req.query;

    const data = await getFixtures({
      league,
      date,
      team,
      page: Number(page),
      limit: Number(limit)
    });

    res.json({
      success: true,
      type: "fixtures",
      data
    });
  } catch (error) {
    console.error("Fixtures route error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to load fixtures"
    });
  }
});

/*
|--------------------------------------------------------------------------
| GET /api/sports/live
|--------------------------------------------------------------------------
| Returns currently live matches.
|
| Example:
| /api/sports/live
| /api/sports/live?league=premier-league
*/
router.get("/live", async (req, res) => {
  try {
    const {
      league,
      page = 1,
      limit = 50
    } = req.query;

    const data = await getLiveScores({
      league,
      page: Number(page),
      limit: Number(limit)
    });

    res.json({
      success: true,
      type: "live",
      data
    });
  } catch (error) {
    console.error("Live scores route error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to load live scores"
    });
  }
});

/*
|--------------------------------------------------------------------------
| GET /api/sports/teams
|--------------------------------------------------------------------------
| Query parameters:
| ?league=premier-league
| ?search=Arsenal
| ?page=1
| ?limit=50
*/
router.get("/teams", async (req, res) => {
  try {
    const {
      league,
      search,
      page = 1,
      limit = 50
    } = req.query;

    const data = await getTeams({
      league,
      search,
      page: Number(page),
      limit: Number(limit)
    });

    res.json({
      success: true,
      type: "teams",
      data
    });
  } catch (error) {
    console.error("Teams route error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to load teams"
    });
  }
});

/*
|--------------------------------------------------------------------------
| GET /api/sports/standings
|--------------------------------------------------------------------------
| Query parameters:
| ?league=premier-league
| ?season=2026
*/
router.get("/standings", async (req, res) => {
  try {
    const {
      league,
      season,
      page = 1,
      limit = 100
    } = req.query;

    const data = await getStandings({
      league,
      season,
      page: Number(page),
      limit: Number(limit)
    });

    res.json({
      success: true,
      type: "standings",
      data
    });
  } catch (error) {
    console.error("Standings route error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to load standings"
    });
  }
});

/*
|--------------------------------------------------------------------------
| GET /api/sports/fixtures/:id
|--------------------------------------------------------------------------
| Get one fixture by ID.
*/
router.get("/fixtures/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const data = await getFixtureById(id);

    res.json({
      success: true,
      type: "fixture",
      data
    });
  } catch (error) {
    console.error("Fixture details error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to load fixture"
    });
  }
});

/*
|--------------------------------------------------------------------------
| GET /api/sports/teams/:id
|--------------------------------------------------------------------------
| Get one team by ID.
*/
router.get("/teams/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const data = await getTeamById(id);

    res.json({
      success: true,
      type: "team",
      data
    });
  } catch (error) {
    console.error("Team details error:", error.message);

    res.status(500).json({
      success: false,
      message: "Unable to load team"
    });
  }
});

/*
|--------------------------------------------------------------------------
| GET /api/sports/health
|--------------------------------------------------------------------------
| Simple route for checking whether the sports router is working.
*/
router.get("/health", (req, res) => {
  res.json({
    success: true,
    service: "sports",
    status: "online"
  });
});

module.exports = router;
