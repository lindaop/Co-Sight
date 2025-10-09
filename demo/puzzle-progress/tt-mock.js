// Minimal mock of tt APIs used in the demo
window.tt = (() => {
  let likeCount = 0;
  let commentCount = 0;
  let auto = false;
  const listeners = new Set();
  const commentListeners = new Set();

  function emit(type, payload) {
    listeners.forEach((fn) => fn({ type, payload }));
  }

  function emitComment(text) {
    commentListeners.forEach((fn) => fn({ text }));
  }

  function startAuto() {
    if (auto) return;
    auto = true;
    const tick = () => {
      if (!auto) return;
      likeCount += 5;
      emit('LIKE_DELTA', { count: 5 });
      setTimeout(tick, 300);
    };
    tick();
  }

  function stopAuto() { auto = false; }

  return {
    // data
    async getLiveRoomLikeCount() { return likeCount; },
    async getLiveRoomCardInfo() { return { id: 'mock-card' }; },

    // message bus for plugin messages
    subscribeLiveInteractPluginMessage() { /* no-op in mock */ },
    onReceiveLiveInteractPluginMessage(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    // comment stream (mock)
    onComment(fn) { commentListeners.add(fn); return () => commentListeners.delete(fn); },

    // helpers for demo controls
    __mock: {
      addLikes(n) { likeCount += n; emit('LIKE_DELTA', { count: n }); },
      addComments(n) { commentCount += n; for (let i=0;i<n;i++){ emitComment('demo'); } },
      toggleAuto() { auto ? stopAuto() : startAuto(); return auto; }
    }
  };
})();
