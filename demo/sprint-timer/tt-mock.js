// Minimal mock for tt APIs used by sprint timer demo
window.tt = (() => {
  let likeCount = 0;
  let auto = false;
  const bus = new Set();
  const commentListeners = new Set();

  function emit(type, payload) {
    bus.forEach((fn) => fn({ type, payload }));
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
    async getLiveRoomLikeCount() { return likeCount; },
    subscribeLiveInteractPluginMessage() { /* no-op */ },
    onReceiveLiveInteractPluginMessage(fn) { bus.add(fn); return () => bus.delete(fn); },
    onComment(fn) { commentListeners.add(fn); return () => commentListeners.delete(fn); },
    __mock: {
      addLikes(n){ likeCount += n; emit('LIKE_DELTA', { count: n }); },
      addComment(text){ commentListeners.forEach(fn => fn({ userId: 'u'+Math.random().toString(16).slice(2), text })); },
      toggleAuto(){ auto ? stopAuto() : startAuto(); return auto; }
    }
  };
})();
