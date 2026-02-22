// shared/api.js
// Central API layer for TamGam frontend
// All HTTP calls go through here — handles auth headers, token refresh, errors

const _isLocalHost =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

const API_BASE = window.TAMGAM_API_BASE || '/api/v1';
const LOCAL_API_FALLBACKS = [
  `http://${window.location.hostname}:8000/api/v1`,
  'http://localhost:8000/api/v1',
  'http://127.0.0.1:8000/api/v1',
];

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
  const isFormData = (typeof FormData !== 'undefined') && (body instanceof FormData);
  const headers = isFormData ? {} : { 'Content-Type': 'application/json' };
  const token = TokenStore.getAccess();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (opts.headers) Object.assign(headers, opts.headers);

  let res;
  const base = opts._forceBase || API_BASE;
  const fullUrl = `${base}${path}`;
  try {
    res = await fetch(fullUrl, {
      method,
      headers,
      body: body ? (isFormData ? body : JSON.stringify(body)) : null,
      ...opts,
    });
  } catch (e) {
    // Local dev fallback when frontend host cannot resolve relative /api proxy.
    if (!window.TAMGAM_API_BASE && _isLocalHost && API_BASE.startsWith('/')) {
      const nextIndex = opts._fallbackIndex == null ? 0 : opts._fallbackIndex + 1;
      if (nextIndex < LOCAL_API_FALLBACKS.length) {
        return _request(method, path, body, {
          ...opts,
          _fallbackIndex: nextIndex,
          _forceBase: LOCAL_API_FALLBACKS[nextIndex],
        });
      }
    }
    const hint = `Network error calling ${base}${path}. Check API server, CORS, mixed-content (http/https), and file:// origin. You can set window.TAMGAM_API_BASE explicitly.`;
    const err = new Error(`${e?.message || 'Fetch failed'}. ${hint}`);
    err.cause = e;
    throw err;
  }

  // Local dev fallback when relative /api route returns 404 on frontend server.
  if (
    res.status === 404 &&
    !window.TAMGAM_API_BASE &&
    _isLocalHost &&
    API_BASE.startsWith('/')
  ) {
    const nextIndex = opts._fallbackIndex == null ? 0 : opts._fallbackIndex + 1;
    if (nextIndex < LOCAL_API_FALLBACKS.length) {
      return _request(method, path, body, {
        ...opts,
        _fallbackIndex: nextIndex,
        _forceBase: LOCAL_API_FALLBACKS[nextIndex],
      });
    }
  }

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
    let payload = null;
    try {
      const j = await res.json();
      payload = j?.detail ?? j;
      if (typeof payload === 'string') detail = payload;
      else if (payload && typeof payload === 'object') detail = payload.message || j.message || detail;
      else detail = j?.message || detail;
    } catch {}
    const err = new Error(detail);
    err.status = res.status;
    err.data = payload;
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

const Users = {
  getMe:           ()           => get('/users/me'),
  updateMe:        (body)       => patch('/users/me', body),
};

const Students = {
  getMe:           ()           => get('/students/me'),
  updateMe:        (body)       => patch('/students/me', body),
  getEnrollments:  ()           => get('/students/me/enrollments'),
  getBatches:      ()           => get('/students/me/batches'),
  getPublic:       (id)         => get(`/students/${id}/public`),
  unenroll:        (enrollment_id) => del(`/students/me/enroll/${enrollment_id}`),
};

// ── Teachers ──────────────────────────────────────────────────────────────────

const Teachers = {
  getMe:           ()           => get('/teachers/me'),
  updateMe:        (body)       => patch('/teachers/me', body),
  list:            (params={})  => get(`/teachers/?${new URLSearchParams(params)}`),
  getPublic:       (id)         => get(`/teachers/${id}/public`),
  getEarnings:     ()           => get('/teachers/me/earnings'),
  getVerification: ()           => get('/teachers/me/verification'),
  requestVerification: (student_ids=[]) => post('/teachers/me/verification/requests', { student_ids }),
  searchVerificationStudents: (q='', limit=20) => get(`/teachers/me/verification/students/search?${new URLSearchParams({ q, limit: String(limit) })}`),
};

// ── Classes ───────────────────────────────────────────────────────────────────

const Classes = {
  list:            (params={}) => get(`/classes/?${new URLSearchParams(params)}`),
  get:             (id)        => get(`/classes/${id}`),
  create:          (body)      => post('/classes/', body),
  update:          (id, body)  => patch(`/classes/${id}`, body),
  getUpcoming:     ()          => get('/classes/upcoming'),
  getMine:         ()          => get('/classes/mine'),
  listBatches:     (params={}) => get(`/classes/batches?${new URLSearchParams(params)}`),
  createBatch:     (body)      => post('/classes/batches', body),
  addBatchStudents:(batch_id, student_ids=[]) => post(`/classes/batches/${batch_id}/students`, { student_ids }),
  listBatchEligibleStudents: (params={}) => get(`/classes/batches/enrolled-students?${new URLSearchParams(params)}`),
  updateBatch:     (batch_id, body) => patch(`/classes/batches/${batch_id}`, body),
  cancelBatchDay:  (batch_id, day, note=null) => post(`/classes/batches/${batch_id}/cancel-day`, { day, note }),
  deleteBatch:     (batch_id) => del(`/classes/batches/${batch_id}`),
  cancelClass:     (class_id) => del(`/classes/${class_id}`),
};

// ── Subscriptions ─────────────────────────────────────────────────────────────

const Subscriptions = {
  list:            ()           => get('/subscriptions/plans'),
  getMine:         ()           => get('/subscriptions/me'),
  createOrder: (plan_id, billing='monthly') => post('/subscriptions/create', { plan_id, billing_cycle: billing }),
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
  generateStudent: (payload={}, chapterFile=null, examQuestionsFile=null) => {
    const form = new FormData();
    if (payload.subject != null) form.append('subject', payload.subject);
    if (payload.standard != null) form.append('standard', payload.standard);
    if (payload.chapter != null) form.append('chapter', payload.chapter);
    if (chapterFile) form.append('chapter_file', chapterFile);
    if (examQuestionsFile) form.append('exam_questions_file', examQuestionsFile);
    return post('/notes/student/generate', form);
  },
};

// ── Assessments ───────────────────────────────────────────────────────────────

const Assessments = {
  getForClass:       (class_id)         => get(`/assessments/${class_id}`),
  generateForClass:  (class_id)         => post(`/assessments/${class_id}/generate`, {}),
  submitForClass:    (class_id, answers)=> post(`/assessments/${class_id}/submit`, { answers }),
  provideFeedback:   (assessment_id, payload={}) => patch(`/assessments/submissions/${assessment_id}/feedback`, payload),
  generateProfile:   ()                 => post('/assessments/profile/generate', {}),
  submitProfile:     (attempt_token, answers) =>
    post('/assessments/profile/submit', { attempt_token, answers }),
  createFromUpload:  (class_id, file)   => {
    const form = new FormData();
    form.append('file', file);
    return post(`/assessments/${class_id}/generate-from-upload`, form);
  },
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
  respondTeacherVerification: (id, decision) => post(`/notifications/${id}/teacher-verification-response?decision=${encodeURIComponent(decision)}`, {}),
};

// ── Tuition Requests ──────────────────────────────────────────────────────────

const TuitionRequests = {
  create:       (body)  => post('/tuition-requests/', body),
  listMine:     (status) => get(`/tuition-requests/me${status ? '?status='+status : ''}`),
  cancel:       (id)    => del(`/tuition-requests/${id}`),
  listIncoming: (status) => get(`/tuition-requests/incoming${status ? '?status='+status : ''}`),
  listMyStudents: ()     => get('/tuition-requests/my-students'),
  accept:       (id)    => patch(`/tuition-requests/${id}/accept`, {}),
  decline:      (id, reason) => patch(`/tuition-requests/${id}/decline`, { decline_reason: reason }),
  searchStudents: (params={}) => get(`/tuition-requests/students/search?${new URLSearchParams(params)}`),
};

// ── Homework ───────────────────────────────────────────────────────────────────

const Homework = {
  listStudentFeed: () => get('/homework/me/student-feed'),
  listTeacher:     () => get('/homework/me/teacher'),
  listTeacherSubmissions: () => get('/homework/me/teacher/submissions'),
  createForClass:  (class_id, payload={}, file=null) => {
    const form = new FormData();
    if (payload.title != null) form.append('title', payload.title);
    if (payload.description != null) form.append('description', payload.description);
    if (payload.due_at != null) form.append('due_at', payload.due_at);
    if (file) form.append('file', file);
    return post(`/homework/classes/${class_id}`, form);
  },
  submitHomework: (homework_id, payload={}, file=null) => {
    const form = new FormData();
    if (payload.submission_text != null) form.append('submission_text', payload.submission_text);
    if (file) form.append('file', file);
    return post(`/homework/${homework_id}/submit`, form);
  },
  provideFeedback: (submission_id, payload={}) => {
    const form = new FormData();
    if (payload.feedback_text != null) form.append('feedback_text', payload.feedback_text);
    if (payload.feedback_score != null && payload.feedback_score !== '') form.append('feedback_score', payload.feedback_score);
    return patch(`/homework/submissions/${submission_id}/feedback`, form);
  },
  async downloadFile(homework_id) {
    const headers = {};
    const token = TokenStore.getAccess();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/homework/${homework_id}/download`, { method: 'GET', headers });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); msg = (j?.detail?.message || j?.detail || j?.message || msg); } catch {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') || '';
    const m = cd.match(/filename=\"?([^\";]+)\"?/i);
    const filename = m?.[1] || 'homework_file';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  },
  async downloadSubmissionFile(submission_id) {
    const headers = {};
    const token = TokenStore.getAccess();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/homework/submissions/${submission_id}/download`, { method: 'GET', headers });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try { const j = await res.json(); msg = (j?.detail?.message || j?.detail || j?.message || msg); } catch {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') || '';
    const m = cd.match(/filename=\"?([^\";]+)\"?/i);
    const filename = m?.[1] || 'submission_file';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  },
};

// ── Admin ─────────────────────────────────────────────────────────────────────

const Admin = {
  getStats:              ()           => get('/admin/stats'),
  listTeachers:          (p={})       => get(`/admin/teachers?${new URLSearchParams(p)}`),
  setTeacherVerified:    (teacherId, isVerified) =>
                           patch(`/admin/teachers/${teacherId}/verified`, { is_verified: !!isVerified }),
  listUsers:             (p={})       => get(`/admin/users?${new URLSearchParams(p)}`),
  setUserStatus:         (id, active) => patch(`/admin/users/${id}/status`, { is_active: !!active }),
  listVerifications:     ()           => get('/admin/teachers/pending'),
  verifyTeacher:         (teacherId, approved, rejectionReason = null, adminNotes = null) =>
                           post(`/admin/teachers/${teacherId}/verify`, {
                             approved: !!approved,
                             rejection_reason: rejectionReason,
                             admin_notes: adminNotes,
                           }),
  listSubscriptions:     (p={})       => get(`/admin/subscriptions?${new URLSearchParams(p)}`),
  updateSubscription:    (id, payload={}) => patch(`/admin/subscriptions/${id}`, payload),
  setSubscriptionCancel: (id, cancel) => patch(`/admin/subscriptions/${id}/control`, { cancel_at_period_end: !!cancel }),
  listPayments:          (p={})       => get(`/admin/payments?${new URLSearchParams(p)}`),
  updatePaymentStatus:   (id, status) => patch(`/admin/payments/${id}/status`, { status }),
  listPlans:             ()           => get('/subscriptions/plans'),
};

// ── Export ────────────────────────────────────────────────────────────────────

window.TG = {
  TokenStore, Auth, Users,
  Students, Teachers, Classes,
  Subscriptions, Transcripts, Notes,
  Assessments, Tutor, Community,
  Notifications, Admin, TuitionRequests, Homework,
};
