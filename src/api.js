// src/api.js
// ──────────────────────────────────────────────────────────────
// たまわり API クライアント層
//
// フロントエンドからバックエンド (Fastify) を叩くための薄いラッパー。
// 「dev認証モード」では x-dev-user-id ヘッダーを自動付与する。
// ──────────────────────────────────────────────────────────────

const BASE_URL  = import.meta?.env?.VITE_API_URL || "http://localhost:3000";
const AUTH_MODE = import.meta?.env?.VITE_AUTH_MODE || "dev";

// dev認証で使う現在ユーザーのID（ログイン後に setDevUser で更新）
let currentDevUserId = localStorage.getItem("devUserId") || null;
// firebase認証で使うIDトークン取得関数（外部から差し込む）
let getFirebaseToken = null;

export function setDevUser(userId) {
  currentDevUserId = userId;
  if (userId) localStorage.setItem("devUserId", userId);
  else        localStorage.removeItem("devUserId");
}

export function setFirebaseTokenProvider(fn) {
  getFirebaseToken = fn;
}

// 認証ヘッダーを組み立てる
async function authHeaders() {
  if (AUTH_MODE === "dev") {
    return currentDevUserId ? { "x-dev-user-id": currentDevUserId } : {};
  }
  // firebase モード
  if (getFirebaseToken) {
    const token = await getFirebaseToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }
  return {};
}

// 共通フェッチ処理
async function request(method, path, { body, auth = false, query } = {}) {
  const url = new URL(BASE_URL + path);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });
  }

  const headers = { "Content-Type": "application/json" };
  if (auth) Object.assign(headers, await authHeaders());

  let res;
  try {
    res = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (networkErr) {
    // サーバーに繋がらない等
    throw new ApiError("ネットワークエラー：サーバーに接続できません", 0, networkErr);
  }

  // 204 No Content
  if (res.status === 204) return null;

  let data = null;
  try { data = await res.json(); } catch { /* bodyなし */ }

  if (!res.ok) {
    throw new ApiError(data?.error || `エラーが発生しました (${res.status})`, res.status, data);
  }
  return data;
}

// カスタムエラー型
export class ApiError extends Error {
  constructor(message, status, detail) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

// ──────────────────────────────────────────────────────────────
// API メソッド（バックエンドのエンドポイントに1対1で対応）
// ──────────────────────────────────────────────────────────────
export const api = {
  // ── ユーザー ──
  register: (payload) =>
    request("POST", "/users", { body: payload }),

  getMe: () =>
    request("GET", "/users/me", { auth: true }),

  getUser: (id) =>
    request("GET", `/users/${id}`),

  updateMe: (payload) =>
    request("PUT", "/users/me", { body: payload, auth: true }),

  // ── 募集 ──
  // listings({ lat, lng, radius, status, limit, offset })
  getListings: (params) =>
    request("GET", "/listings", { query: params }),

  getListing: (id) =>
    request("GET", `/listings/${id}`),

  createListing: (payload) =>
    request("POST", "/listings", { body: payload, auth: true }),

  updateListing: (id, payload) =>
    request("PUT", `/listings/${id}`, { body: payload, auth: true }),

  setListingStatus: (id, status) =>
    request("PATCH", `/listings/${id}/status`, { body: { status }, auth: true }),

  deleteListing: (id) =>
    request("DELETE", `/listings/${id}`, { auth: true }),

  // ── 参加申請 ──
  join: (listingId, eggCount) =>
    request("POST", `/listings/${listingId}/applications`, { body: { egg_count: eggCount }, auth: true }),

  cancelApplication: (applicationId) =>
    request("DELETE", `/applications/${applicationId}`, { auth: true }),

  getMyApplications: () =>
    request("GET", "/me/applications", { auth: true }),

  getMyListings: () =>
    request("GET", "/me/listings", { auth: true }),

  // ── 評価 ──
  postReview: (listingId, payload) =>
    request("POST", `/listings/${listingId}/reviews`, { body: payload, auth: true }),

  getReviews: (listingId) =>
    request("GET", `/listings/${listingId}/reviews`),
};

export default api;
