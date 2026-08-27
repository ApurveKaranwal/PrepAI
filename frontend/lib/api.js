"use client";

/**
 * =============================================================================
 * The single door between this frontend and the backend.
 * =============================================================================
 * Every authenticated call goes through `apiFetch`. Two rules make that worth
 * enforcing:
 *
 *   1. The client never tells the server who it is. There is no `user_id` or
 *      `recruiter_id` in any request body — identity comes from the bearer
 *      token, and the org a recruiter acts on behalf of is resolved server-side
 *      from that token's membership row. Anything else is a tenancy hole.
 *
 *   2. Failures surface. The old code caught errors into `console.warn` and
 *      rendered an empty state, so "your session expired" and "you have no
 *      candidates" looked identical. `apiFetch` throws an `ApiError` carrying
 *      the HTTP status and the backend's own `detail` string, which the UI is
 *      expected to show the user verbatim — those strings are written for
 *      humans.
 *
 * A 401 means the stored token is gone or expired. That is handled once, here:
 * the session is cleared and every `onUnauthorized` subscriber is notified, so
 * the app drops to the sign-in screen instead of each caller reinventing it.
 */

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8001";

export const TOKEN_STORAGE_KEY = "prepflow_token";
export const USER_STORAGE_KEY = "prepflow_user";

// Shown when the backend sends a bare status with no `detail` worth repeating.
const STATUS_FALLBACKS = {
  0: "Could not reach the server. Check your connection and try again.",
  400: "That request was not valid.",
  401: "Your session has expired. Please sign in again.",
  403: "You do not have access to that.",
  404: "That item no longer exists.",
  409: "That action conflicts with the current state.",
  410: "That link is no longer valid.",
  429: "Too many requests. Give it a moment and try again.",
  500: "The server ran into a problem. Please try again.",
  502: "The server is unreachable right now. Please try again.",
  503: "The server is temporarily unavailable. Please try again.",
};

export class ApiError extends Error {
  constructor(message, { status = 0, detail = "", payload = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
    this.payload = payload;
  }

  /** True when the caller should be sent back to sign-in. */
  get isAuthError() {
    return this.status === 401;
  }

  /** True when the request never reached the server. */
  get isNetworkError() {
    return this.status === 0;
  }
}

// -----------------------------------------------------------------------------
// Session storage
// -----------------------------------------------------------------------------

export function getToken() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    // Private-browsing modes can throw on localStorage access.
    return null;
  }
}

export function setToken(token) {
  if (typeof window === "undefined") return;
  try {
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    /* nothing we can do; the user will be asked to sign in again */
  }
}

export function getStoredUser() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user) {
  if (typeof window === "undefined") return;
  try {
    if (user) window.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    else window.localStorage.removeItem(USER_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function clearSession() {
  setToken(null);
  setStoredUser(null);
}

// -----------------------------------------------------------------------------
// 401 fan-out
// -----------------------------------------------------------------------------

const unauthorizedHandlers = new Set();

/**
 * Register a callback for "the session is no longer valid". Returns an
 * unsubscribe function, so it composes with `useEffect` cleanup.
 */
export function onUnauthorized(handler) {
  unauthorizedHandlers.add(handler);
  return () => unauthorizedHandlers.delete(handler);
}

function announceUnauthorized() {
  for (const handler of Array.from(unauthorizedHandlers)) {
    try {
      handler();
    } catch {
      /* a broken listener must not swallow the original error */
    }
  }
}

// -----------------------------------------------------------------------------
// Request helpers
// -----------------------------------------------------------------------------

/**
 * Builds `path?a=1&b=2`, dropping params that are null, undefined or "" so an
 * untouched filter never narrows a query by accident.
 */
export function withQuery(path, params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

/** FastAPI validation errors arrive as a list of objects, not a string. */
function readDetail(data) {
  const detail = data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((entry) => {
        if (typeof entry === "string") return entry;
        const field = Array.isArray(entry?.loc) ? entry.loc[entry.loc.length - 1] : "";
        return field ? `${field}: ${entry?.msg || "is invalid"}` : entry?.msg || "";
      })
      .filter(Boolean);
    if (messages.length) return messages.join(" · ");
  }
  if (typeof data?.message === "string") return data.message;
  return "";
}

/**
 * @param {string} path      Path beginning with "/", or a full URL.
 * @param {object} [options]
 * @param {string} [options.method="GET"]
 * @param {any}    [options.body]          Serialized as JSON when present.
 * @param {AbortSignal} [options.signal]   For cancelling superseded requests.
 * @param {boolean}[options.auth=true]     Set false for public endpoints.
 * @param {object} [options.headers]
 * @returns {Promise<any>} The parsed JSON body (null for an empty response).
 * @throws {ApiError} On any non-2xx response or transport failure.
 * @throws {DOMException} Re-thrown unchanged when the caller aborts.
 */
export async function apiFetch(path, options = {}) {
  const { method = "GET", body, signal, auth = true, headers = {} } = options;
  const url = /^https?:\/\//i.test(path) ? path : `${BACKEND_URL}${path}`;

  const requestHeaders = { ...headers };
  let serializedBody;
  if (body !== undefined && body !== null) {
    requestHeaders["Content-Type"] = "application/json";
    serializedBody = JSON.stringify(body);
  }

  if (auth) {
    const token = getToken();
    if (token) requestHeaders["Authorization"] = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(url, { method, headers: requestHeaders, body: serializedBody, signal });
  } catch (err) {
    // A caller-initiated abort is not a failure; let it propagate as itself so
    // effects can quietly ignore it.
    if (err?.name === "AbortError") throw err;
    throw new ApiError(STATUS_FALLBACKS[0], { status: 0 });
  }

  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
  }

  if (!response.ok) {
    const detail = readDetail(data);
    if (response.status === 401) {
      clearSession();
      announceUnauthorized();
    }
    throw new ApiError(
      detail || STATUS_FALLBACKS[response.status] || `Request failed (${response.status}).`,
      { status: response.status, detail, payload: data }
    );
  }

  return data;
}

export const apiGet = (path, options) => apiFetch(path, { ...options, method: "GET" });
export const apiPost = (path, body, options) => apiFetch(path, { ...options, method: "POST", body });
export const apiPatch = (path, body, options) => apiFetch(path, { ...options, method: "PATCH", body });
export const apiDelete = (path, options) => apiFetch(path, { ...options, method: "DELETE" });

/**
 * Turns anything thrown by `apiFetch` into a string safe to render. Keeps the
 * backend's wording when there is any, because those messages tell the user
 * what to do next.
 */
export function errorMessage(err, fallback = "Something went wrong. Please try again.") {
  if (!err) return fallback;
  if (err instanceof ApiError) return err.message || fallback;
  if (typeof err?.message === "string" && err.message) return err.message;
  return fallback;
}

export { BACKEND_URL };
