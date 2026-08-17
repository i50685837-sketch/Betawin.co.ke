// services/sportsAPI.js

const API_URL =
  process.env.SPORTS_API_URL || "https://v3.football.api-sports.io";

const API_KEY = process.env.SPORTS_API_KEY;

async function request(endpoint, params = {}) {
  if (!API_KEY) {
    throw new Error("SPORTS_API_KEY is not configured");
  }

  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      query.append(key, value);
    }
  }

  const url = `${API_URL}${endpoint}?${query.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "x-apisports-key": API_KEY,
      "Accept": "application/json"
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.errors
        ? JSON.stringify(data.errors)
        : `Sports API returned ${response.status}`
    );
  }

  return data;
}


// Get fixtures/events
async function getFixtures(options = {}) {
  return request("/fixtures", options);
}


// Get live matches
async function getLiveMatches() {
  return request("/fixtures", {
    live: "all"
  });
}


// Get today's fixtures
async function getTodayFixtures(date) {
  return request("/fixtures", {
    date
  });
}


// Get fixtures for a league
async function getLeagueFixtures(league, season) {
  return request("/fixtures", {
    league,
    season
  });
}


// Get leagues
async function getLeagues() {
  return request("/leagues");
}


// Get teams
async function getTeams(options = {}) {
  return request("/teams", options);
}


// Get standings
async function getStandings(league, season) {
  return request("/standings", {
    league,
    season
  });
}


// Get a specific fixture
async function getFixture(fixtureId) {
  return request("/fixtures", {
    id: fixtureId
  });
}


module.exports = {
  getFixtures,
  getLiveMatches,
  getTodayFixtures,
  getLeagueFixtures,
  getLeagues,
  getTeams,
  getStandings,
  getFixture
};
