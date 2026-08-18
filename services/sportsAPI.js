/**
 * services/sportApi.js
 *
 * Sports data service
 *
 * Provides:
 * - Fixtures
 * - Live scores
 * - Teams
 * - Standings
 *
 * .env:
 * SPORTS_API_URL=https://your-sports-provider.example/api
 * SPORTS_API_KEY=your_api_key
 */

const axios = require("axios");

const API_URL = process.env.SPORTS_API_URL;
const API_KEY = process.env.SPORTS_API_KEY;

if (!API_URL) {
  console.warn("⚠️ SPORTS_API_URL is not configured");
}

if (!API_KEY) {
  console.warn("⚠️ SPORTS_API_KEY is not configured");
}

const api = axios.create({
  baseURL: API_URL,
  timeout: 15000,
  headers: {
    Accept: "application/json",
    "X-API-Key": API_KEY
  }
});

/**
 * Generic GET request
 */
async function request(endpoint, params = {}) {
  try {
    const response = await api.get(endpoint, {
      params
    });

    return response.data;
  } catch (error) {
    const status = error.response?.status;

    const message =
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message;

    console.error(
      `Sports API error [${status || "unknown"}]: ${message}`
    );

    throw new Error("Unable to retrieve sports data");
  }
}

/**
 * Fixtures
 *
 * Example:
 * getFixtures({
 *   league: "premier-league",
 *   date: "2026-08-20"
 * })
 */
async function getFixtures({
  league,
  date,
  team,
  page = 1,
  limit = 50
} = {}) {
  return request("/fixtures", {
    league,
    date,
    team,
    page,
    limit
  });
}

/**
 * Live scores
 */
async function getLiveScores({
  league,
  page = 1,
  limit = 50
} = {}) {
  return request("/live", {
    league,
    page,
    limit
  });
}

/**
 * Teams
 */
async function getTeams({
  league,
  search,
  page = 1,
  limit = 50
} = {}) {
  return request("/teams", {
    league,
    search,
    page,
    limit
  });
}

/**
 * League standings
 */
async function getStandings({
  league,
  season,
  page = 1,
  limit = 100
} = {}) {
  return request("/standings", {
    league,
    season,
    page,
    limit
  });
}

/**
 * Single fixture
 */
async function getFixtureById(fixtureId) {
  if (!fixtureId) {
    throw new Error("fixtureId is required");
  }

  return request(
    `/fixtures/${encodeURIComponent(fixtureId)}`
  );
}

/**
 * Single team
 */
async function getTeamById(teamId) {
  if (!teamId) {
    throw new Error("teamId is required");
  }

  return request(
    `/teams/${encodeURIComponent(teamId)}`
  );
}

module.exports = {
  getFixtures,
  getLiveScores,
  getTeams,
  getStandings,
  getFixtureById,
  getTeamById
};
