// shared/api.js
// Central API layer for TamGam frontend
// All HTTP calls go through here — handles auth headers, token refresh, errors

const API_BASE = window.TAMGAM_API_BASE || 'http://localhost:8000/api/v1';

// ── Token Management ──────────────────────────────────────────────────────────

const TokenStore = {
  getAccess()    { return localStorage.getItem('tg_access'); },
  getRefresh()   { return localStorage.getItem('tg_refresh'); },
  getUser()      {
    try { return JSON.parse(localStorage.getItem('tg_user') || 'null'); }
    catch { return null; }
  },
  set(access, refresh, user) {
    localStorage.setItem('tg_access',  access);
    localStorage.setItem('tg_refresh', refresh);
    localStorage.setItem('tg_user',    JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem('tg_access');
    localStorage.removeItem('tg_refresh');
    localStorage.removeItem('tg_user');
  },
  isLoggedIn() { return !!this.getAccess(); },
};

// ── Core Fetch ────────────────────────────────────────────────────────────────

let _refreshing = null; // singleton refresh promise

async function _request(method, path, body = null, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const token = TokenStore.getAccess();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
    ...opts,
  });

  // Auto-refresh on 401
  if (res.status === 401 && TokenStore.getRefresh() && !opts._retried) {
    if (!_refreshing) {
      _refreshing = _refreshToken().finally(() => { _refreshing = null; });
    }
    const ok = await _refreshing;
    if (ok) return _request(method, path, body, { ...opts, _retried: true });
    else { TokenStore.clear(); window.location.href = '/login.html'; return; }
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try { const j = await res.json(); detail = j.detail || j.message || detail; } catch {}
    const err = new Error(detail);
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

async function _refreshToken() {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: TokenStore.getRefresh() }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    const user = TokenStore.getUser();
    TokenStore.set(data.access_token, TokenStore.getRefresh(), user);
    return true;
  } catch { return false; }
}

const get  = (path, opts)       => _request('GET',    path, null, opts);
const post = (path, body, opts) => _request('POST',   path, body, opts);
const patch= (path, body, opts) => _request('PATCH',  path, body, opts);
const del  = (path, opts)       => _request('DELETE', path, null, opts);

// ── Auth ──────────────────────────────────────────────────────────────────────

const Auth = {
  async login(email, password) {
    const data = await post('/auth/login', { email, password });
    TokenStore.set(data.access_token, data.refresh_token, {
      user_id: data.user_id,
      role: data.role,
      full_name: data.full_name,
      is_subscribed: data.is_subscribed,
      is_verified_teacher: data.is_verified_teacher,
    });
    return data;
  },
  async signup(email, password, full_name, role) {
    const data = await post('/auth/signup', { email, password, full_name, role });
    TokenStore.set(data.access_token, data.refresh_token, {
      user_id: data.user_id,
      role: data.role,
      full_name: data.full_name,
      is_subscribed: data.is_subscribed,
      is_verified_teacher: data.is_verified_teacher,
    });
    return data;
  },
  logout() {
    TokenStore.clear();
    window.location.href = '/login.html';
  },
  isLoggedIn: () => TokenStore.isLoggedIn(),
  user:       () => TokenStore.getUser(),
};

// ── Students ──────────────────────────────────────────────────────────────────

const Students = {
  getMe:           ()           => get('/students/me'),
  updateMe:        (body)       => patch('/students/me', body),
  getEnrollments:  ()           => get('/students/me/enrollments'),
  getBatches:      ()           => get('/students/me/batches'),
  getPublic:       (id)         => get(`/students/${id}/public`),
};

// ── Teachers ──────────────────────────────────────────────────────────────────

const Teachers = {
  getMe:           ()           => get('/teachers/me'),
  updateMe:        (body)       => patch('/teachers/me', body),
  list:            ()           => get('/teachers/'),
  getPublic:       (id)         => get(`/teachers/${id}/public`),
  getEarnings:     ()           => get('/teachers/me/earnings'),
  getVerification: ()           => get('/teachers/me/verification'),
};

// ── Classes ───────────────────────────────────────────────────────────────────

const Classes = {
  list:            (params={}) => get(`/classes/?${new URLSearchParams(params)}`),
  get:             (id)        => get(`/classes/${id}`),
  create:          (body)      => post('/classes/', body),
  update:          (id, body)  => patch(`/classes/${id}`, body),
  getUpcoming:     ()          => get('/classes/upcoming'),
  getMine:         ()          => get('/classes/mine'),
};

// ── Subscriptions ─────────────────────────────────────────────────────────────

const Subscriptions = {
  list:            ()           => get('/subscriptions/plans'),
  getMine:         ()           => get('/subscriptions/me'),
  createOrder: (plan_id, billing='monthly') => post('/subscriptions/create', { plan_id, billing }),
  cancel:          ()           => post('/subscriptions/cancel'),
};

// ── Transcripts ───────────────────────────────────────────────────────────────

const Transcripts = {
  getForClass:     (class_id)   => get(`/transcripts/class/${class_id}`),
  get:             (id)         => get(`/transcripts/${id}`),
  trigger:         (class_id)   => post(`/transcripts/class/${class_id}/process`),
};

// ── Notes ─────────────────────────────────────────────────────────────────────

const Notes = {
  getForClass:     (class_id)   => get(`/notes/class/${class_id}`),
  get:             (id)         => get(`/notes/${id}`),
  generate:        (class_id)   => post(`/notes/class/${class_id}/generate`),
};

// ── Assessments ───────────────────────────────────────────────────────────────

const Assessments = {
  getForClass:     (class_id)   => get(`/assessments/class/${class_id}`),
  start:           (class_id)   => post(`/assessments/class/${class_id}/start`),
  submit:          (id, answers) => post(`/assessments/${id}/submit`, { answers }),
  getResult:       (id)         => get(`/assessments/${id}/result`),
  getHistory:      ()           => get('/assessments/me/history'),
};

// ── Tutor (Diya) ──────────────────────────────────────────────────────────────

const Tutor = {
  ask:             (question, session_id, class_id) =>
                     post('/tutor/ask', { question, session_id, class_id }),
  getSessions:     ()           => get('/tutor/sessions'),
  getSession:      (id)         => get(`/tutor/sessions/${id}`),
};

// ── Community ─────────────────────────────────────────────────────────────────

const Community = {
  listChannels:    ()                       => get('/posts/channels'),
  listPosts:       (channel_id, params={})  => get(`/posts/channels/${channel_id}/posts?${new URLSearchParams(params)}`),
  getPost:         (post_id)                => get(`/posts/posts/${post_id}`),
  createPost:      (channel_id, body)       => post(`/posts/channels/${channel_id}/posts`, body),
  deletePost:      (post_id)                => del(`/posts/posts/${post_id}`),
  reply:           (post_id, body)          => post(`/posts/posts/${post_id}/replies`, body),
  react:           (post_id, emoji, target_type, target_id) =>
                     post(`/posts/posts/${post_id}/reactions`, { emoji, target_type, target_id }),
};

// ── Notifications ─────────────────────────────────────────────────────────────

const Notifications = {
  list:            ()           => get('/notifications/'),
  markRead:        (id)         => patch(`/notifications/${id}/read`),
  markAllRead:     ()           => patch('/notifications/read-all'),
  getUnreadCount:  ()           => get('/notifications/unread-count'),
};

// ── Tuition Requests ──────────────────────────────────────────────────────────

const TuitionRequests = {
  create:       (body)  => post('/tuition-requests/', body),
  listMine:     (status) => get(`/tuition-requests/me${status ? '?status='+status : ''}`),
  cancel:       (id)    => del(`/tuition-requests/${id}`),
  listIncoming: (status) => get(`/tuition-requests/incoming${status ? '?status='+status : ''}`),
  accept:       (id)    => patch(`/tuition-requests/${id}/accept`, {}),
  decline:      (id, reason) => patch(`/tuition-requests/${id}/decline`, { decline_reason: reason }),
  searchStudents: (params={}) => get(`/tuition-requests/students/search?${new URLSearchParams(params)}`),
};

// ── Admin ─────────────────────────────────────────────────────────────────────

const Admin = {
  getStats:           ()        => get('/admin/stats'),
  listUsers:          (p={})    => get(`/admin/users?${new URLSearchParams(p)}`),
  getUser:            (id)      => get(`/admin/users/${id}`),
  updateUser:         (id, b)   => patch(`/admin/users/${id}`, b),
  listVerifications:  ()        => get('/admin/verifications/pending'),
  approveVerification:(id)      => post(`/admin/verifications/${id}/approve`),
  rejectVerification: (id, r)   => post(`/admin/verifications/${id}/reject`, { reason: r }),
  listPlans:          ()        => get('/admin/subscription-plans'),
  createPlan:         (b)       => post('/admin/subscription-plans', b),
  updatePlan:         (id, b)   => patch(`/admin/subscription-plans/${id}`, b),
  listWebhookLogs:    ()        => get('/admin/webhook-logs'),
};

// ── Export ────────────────────────────────────────────────────────────────────

window.TG = {
  TokenStore, Auth,
  Students, Teachers, Classes,
  Subscriptions, Transcripts, Notes,
  Assessments, Tutor, Community,
  Notifications, Admin, TuitionRequests,
};