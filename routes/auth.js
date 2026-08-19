/**
 * auth.js
 * Shared helper for authenticated requests across Betawin pages.
 *
 * Access tokens are short-lived (15 min). Instead of sending users
 * back to login every time one expires, this wraps fetch() so that
 * on a 401 it silently exchanges the refresh token for a new pair
 * and retries the original request once.
 *
 * Usage (in place of raw fetch for authenticated calls):
 *   const res = await authFetch("/api/dashboard");
 *   const json = await res.json();
 */

const API_BASE = ""; // same-origin

function getAccessToken() {
  return localStorage.getItem("betawin_token");
}

function getRefreshToken() {
  return localStorage.getItem("betawin_refresh_token");
}

function setTokens(accessToken, refreshToken) {
  localStorage.setItem("betawin_token", accessToken);
  if (refreshToken) {
    localStorage.setItem("betawin_refresh_token", refreshToken);
  }
}

function clearSession() {
  localStorage.removeItem("betawin_token");
  localStorage.removeItem("betawin_refresh_token");
}

function goToLogin() {
  clearSession();
  window.location.href = "login.html";
}

let refreshInFlight = null;

async function refreshAccessToken() {
  // De-dupe concurrent refresh attempts (e.g. multiple fetches firing
  // on page load) into a single request.
  if (refreshInFlight) return refreshInFlight;

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    goToLogin();
    return null;
  }

  refreshInFlight = fetch(`${API_BASE}/api/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken })
  })
    .then(async (res) => {
      const json = await res.json();
      if (!json.success) {
        goToLogin();
        return null;
      }
      setTokens(json.accessToken, json.refreshToken);
      return json.accessToken;
    })
    .catch(() => {
      goToLogin();
      return null;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

/**
 * Drop-in replacement for fetch() on authenticated endpoints.
 * Automatically attaches the access token and retries once with a
 * refreshed token if the server responds 401.
 */
async function authFetch(path, options = {}) {
  const token = getAccessToken();

  if (!token) {
    goToLogin();
    return Promise.reject(new Error("Not authenticated"));
  }

  const doFetch = (accessToken) =>
    fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${accessToken}`
      }
    });

  let res = await doFetch(token);

  if (res.status === 401) {
    const newToken = await refreshAccessToken();
    if (!newToken) {
      // refreshAccessToken already redirected to login
      return res;
    }
    res = await doFetch(newToken);
  }

  return res;
}

async function logout() {
  const refreshToken = getRefreshToken();
  try {
    if (refreshToken) {
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken })
      });
    }
  } catch (err) {
    console.error("Logout request failed:", err);
  } finally {
    goToLogin();
  }
}
