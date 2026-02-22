// shared/auth.js
// Alpine.js global store + auth guards
// Include AFTER Alpine CDN and api.js on every page

document.addEventListener('alpine:init', () => {

  // ── Global Store ───────────────────────────────────────────────────────────
  Alpine.store('auth', {
    user: null,
    ready: false,

    init() {
      this.user = TG.TokenStore.getUser();
      this.ready = true;
    },

    get isLoggedIn()         { return !!this.user; },
    get isStudent()          { return this.user?.role === 'student'; },
    get isTeacher()          { return this.user?.role === 'teacher'; },
    get isAdmin()            { return this.user?.role === 'admin'; },
    get dashboardPath()      {
      if (this.user?.role === 'teacher') return '/teacher-dashboard.html';
      if (this.user?.role === 'admin') return '/admin.html';
      return '/dashboard.html';
    },
    get isSubscribed()       { return this.user?.is_subscribed === true; },
    get isVerifiedTeacher()  { return this.user?.is_verified_teacher === true; },
    get firstName()          {
      return this.user?.full_name?.split(' ')[0] || 'Friend';
    },

    async refresh() {
      if (!TG.TokenStore.isLoggedIn()) return;
      try {
        const data = await TG.Students.getMe().catch(() => TG.Teachers.getMe());
        // Re-read from storage after any API call may have updated it
        this.user = TG.TokenStore.getUser();
      } catch {}
    },

    logout() { TG.Auth.logout(); },
  });

  // ── Notification Badge ─────────────────────────────────────────────────────
  Alpine.store('notifs', {
    count: 0,
    async fetch() {
      if (!TG.TokenStore.isLoggedIn()) return;
      try {
        const d = await TG.Notifications.getUnreadCount();
        this.count = d?.count ?? 0;
      } catch {}
    },
    async markAllRead() {
      if (!TG.TokenStore.isLoggedIn()) return;
      this.count = 0;
      try {
        await TG.Notifications.markAllRead();
      } catch {}
      try {
        await this.fetch();
      } catch {}
    },
    async openAndGo(target) {
      await this.markAllRead();
      if (!target) return;
      if (target.startsWith('#')) {
        window.location.hash = target;
      } else {
        window.location.href = target;
      }
    },
  });

});

// ── Page Guards ────────────────────────────────────────────────────────────────

window.Guards = {
  // Call at top of any auth-required page
  requireLogin(redirectTo = '/login.html') {
    if (!TG.TokenStore.isLoggedIn()) {
      window.location.href = redirectTo;
      return false;
    }
    return true;
  },

  // Call at top of teacher-only pages
  requireTeacher() {
    if (!this.requireLogin()) return false;
    const user = TG.TokenStore.getUser();
    if (user?.role !== 'teacher') {
      window.location.href = '/dashboard.html';
      return false;
    }
    return true;
  },

  // Call at top of admin-only pages
  requireAdmin() {
    if (!this.requireLogin()) return false;
    const user = TG.TokenStore.getUser();
    if (user?.role !== 'admin') {
      window.location.href = '/dashboard.html';
      return false;
    }
    return true;
  },

  // Redirect logged-in users away from login page
  redirectIfLoggedIn() {
    if (!TG.TokenStore.isLoggedIn()) return;
    const user = TG.TokenStore.getUser();
    if (user?.role === 'teacher') window.location.href = '/teacher-dashboard.html';
    else if (user?.role === 'admin') window.location.href = '/admin.html';
    else window.location.href = '/dashboard.html';
  },
};

// ── Utility Helpers ────────────────────────────────────────────────────────────

window.Utils = {
  formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  },
  formatTime(iso) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit'
    });
  },
  formatDateTime(iso) {
    return `${this.formatDate(iso)}, ${this.formatTime(iso)}`;
  },
  relativeTime(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1)   return 'just now';
    if (mins < 60)  return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24)   return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  },
  // Show ₹ formatted price
  formatRupees(paise) {
    return '₹' + (paise / 100).toLocaleString('en-IN');
  },
  // Truncate text
  truncate(str, n = 120) {
    if (!str) return '';
    return str.length > n ? str.slice(0, n) + '…' : str;
  },
  // Subject badge colours
  subjectColor(subject) {
    const map = {
      mathematics: '#E8640C',
      maths: '#E8640C',
      science: '#0D5C63',
      physics: '#2563EB',
      chemistry: '#7C3AED',
      biology: '#059669',
    };
    return map[subject?.toLowerCase()] || '#6B7280';
  },
};
