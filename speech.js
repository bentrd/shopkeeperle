/** Smoothly resizes the existing, bottom-anchored shopkeeper speech button. */
export function initSpeechBubble({ button, quote }) {
  if (!button || !quote) return { setText() {}, destroy() {} };

  const originalHeight = button.style.height;
  const originalOpacity = quote.style.opacity;
  const hadQuoteClass = quote.classList.contains('speech-quote');
  const hadReadyClass = button.classList.contains('speech-bubble-ready');
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const canAnimate = typeof button.animate === 'function' && typeof quote.animate === 'function';
  quote.classList.add('speech-quote');
  button.classList.add('speech-bubble-ready');

  let latestText = quote.textContent;
  let initialized = false;
  let destroyed = false;
  let revision = 0;
  let heightAnimation = null;
  let textAnimation = null;
  let sheenTimer = 0;
  let lastWidth = button.getBoundingClientRect().width;

  function cancelAnimations() {
    revision++;
    heightAnimation?.cancel();
    textAnimation?.cancel();
    heightAnimation = textAnimation = null;
    clearTimeout(sheenTimer);
    button.classList.remove('speech-bubble-changing');
  }

  function settle(text) {
    cancelAnimations();
    quote.textContent = text;
    quote.style.opacity = originalOpacity;
    button.style.height = originalHeight;
  }

  function measureNaturalHeight() {
    // Both writes and the measurement occur in one frame, before any paint.
    button.style.height = originalHeight;
    return button.getBoundingClientRect().height;
  }

  function reveal(text, fromHeight, currentRevision, duration = 300) {
    if (destroyed || currentRevision !== revision) return;
    quote.textContent = text;
    quote.style.opacity = '0';
    const nextHeight = measureNaturalHeight();
    button.style.height = `${nextHeight}px`;
    if (Math.abs(nextHeight - fromHeight) > .5) {
      heightAnimation = button.animate(
        [{ height: `${fromHeight}px` }, { height: `${nextHeight}px` }],
        { duration, easing: 'cubic-bezier(.22,.68,.24,1)' },
      );
      heightAnimation.finished.then(() => {
        if (currentRevision !== revision || destroyed) return;
        heightAnimation = null;
        button.style.height = originalHeight;
      }).catch(() => {});
    } else {
      button.style.height = originalHeight;
    }
    textAnimation = quote.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
    textAnimation.finished.then(() => {
      if (currentRevision !== revision || destroyed) return;
      textAnimation = null;
      quote.style.opacity = originalOpacity;
    }).catch(() => {});
    button.classList.add('speech-bubble-changing');
    sheenTimer = window.setTimeout(() => button.classList.remove('speech-bubble-changing'), 520);
  }

  function transition(text, skipFadeOut = false) {
    const fromHeight = button.getBoundingClientRect().height;
    const fromOpacity = Number.parseFloat(getComputedStyle(quote).opacity) || 0;
    cancelAnimations();
    const currentRevision = revision;
    button.style.height = `${fromHeight}px`;
    quote.style.opacity = `${fromOpacity}`;
    if (skipFadeOut) {
      reveal(text, fromHeight, currentRevision, 260);
      return;
    }
    textAnimation = quote.animate([{ opacity: fromOpacity }, { opacity: 0 }], { duration: 90, easing: 'ease-in' });
    textAnimation.finished.then(() => reveal(text, fromHeight, currentRevision)).catch(() => {});
  }

  function updateMotionPreference() {
    if (motionQuery.matches) settle(latestText);
  }
  motionQuery.addEventListener('change', updateMotionPreference);

  // Only width changes matter; animated height updates must not restart themselves.
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => {
    if (destroyed) return;
    const width = button.getBoundingClientRect().width;
    if (Math.abs(width - lastWidth) < .5) return;
    lastWidth = width;
    if (!heightAnimation && !textAnimation) return;
    if (motionQuery.matches || !canAnimate) settle(latestText);
    else transition(latestText, true);
  }) : null;
  resizeObserver?.observe(button);

  return {
    setText(text) {
      if (destroyed) return;
      text = String(text);
      const firstSet = !initialized;
      initialized = true;
      if (text === latestText) return;
      latestText = text;
      if (firstSet || motionQuery.matches || !canAnimate || text === quote.textContent) settle(text);
      else transition(text);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      settle(latestText);
      resizeObserver?.disconnect();
      motionQuery.removeEventListener('change', updateMotionPreference);
      if (!hadQuoteClass) quote.classList.remove('speech-quote');
      if (!hadReadyClass) button.classList.remove('speech-bubble-ready');
    },
  };
}
