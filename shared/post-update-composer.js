// shared/post-update-composer.js
// Rich "Post Update" composer modal — shared across dashboard, teacher-dashboard, community

(function () {

  const POST_TYPES = [
    { value: 'question',    label: '❓ Question',    color: '#2563EB', hint: 'Ask the community something'         },
    { value: 'update',      label: '📢 Update',      color: '#0D5C63', hint: 'Share news or an announcement'       },
    { value: 'achievement', label: '🏆 Achievement', color: '#D4A017', hint: 'Celebrate a win or milestone'        },
    { value: 'offer',       label: '🏷️ Offer',       color: '#E8640C', hint: 'Post a class or course deal (teachers only)' },
  ];

  window.PostComposerData = function () {
    return {
      isOpen:    false,
      channels:  [],
      posting:   false,
      error:     '',
      success:   false,

      title:     '',
      body:      '',
      postType:  'update',
      channelId: '',

      get user()           { return TG.TokenStore.getUser(); },
      get isLoggedIn()     { return TG.TokenStore.isLoggedIn(); },
      get isSubscribed()   { return this.user?.is_subscribed === true; },
      get canPost()        { return this.isTeacher || this.isSubscribed; },
      get isTeacher()      { return this.user?.role === 'teacher'; },
      get isVerified()     { return this.user?.is_verified_teacher === true; },
      get charCount()      { return this.body.length; },
      get postTypes() {
        return POST_TYPES.filter(t => t.value !== 'offer' || this.isTeacher);
      },
      get selectedType()    { return POST_TYPES.find(t => t.value === this.postType) || POST_TYPES[1]; },
      get selectedChannel() { return this.channels.find(c => c.id === this.channelId); },
      get isOffersChannel() { return this.selectedChannel?.name === 'offers'; },
      get canSubmit() {
        if (!this.title.trim() || !this.body.trim() || !this.channelId) return false;
        if (this.isOffersChannel && !this.isVerified) return false;
        return true;
      },

      // Called by x-init — just a no-op warmup, real load happens on open()
      init() {},

      async loadChannels() {
        try {
          const data = await TG.Community.listChannels();
          this.channels = Array.isArray(data) ? data : (data?.channels || []);
          const general = this.channels.find(c => c.name === 'general');
          if (general && !this.channelId) this.channelId = general.id;
        } catch(e) {
          console.warn('PostComposer: could not load channels', e);
        }
      },

      async open() {
        if (!this.isLoggedIn) { window.location.href = '/login.html'; return; }
        if (!this.isTeacher && !this.isSubscribed) { window.location.href = "/plans.html"; return; }

        this.error   = '';
        this.success = false;
        this.isOpen  = true;

        // Always (re)load channels when modal opens
        await this.loadChannels();
      },

      close() {
        this.isOpen   = false;
        this.title    = '';
        this.body     = '';
        this.postType = 'update';
        this.error    = '';
        this.success  = false;
        const general = this.channels.find(c => c.name === 'general');
        if (general) this.channelId = general.id;
      },

      selectType(val) { this.postType = val; },

      onChannelChange() {
        if (this.isOffersChannel) this.postType = 'offer';
        else if (this.postType === 'offer') this.postType = 'update';
      },

      async submit() {
        if (!this.canSubmit || this.posting) return;
        this.posting = true;
        this.error   = '';
        try {
          await TG.Community.createPost(this.channelId, {
            title: this.title.trim(),
            body:  this.body.trim(),
          });
          this.success = true;
          setTimeout(() => this.close(), 1400);
          window.dispatchEvent(new CustomEvent('postCreated', {
            detail: { channelId: this.channelId }
          }));
        } catch (e) {
          this.error = e.message || 'Failed to post. Please try again.';
        } finally {
          this.posting = false;
        }
      },
    };
  };

})();