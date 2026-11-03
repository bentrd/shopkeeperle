/** Image-only idle animation and reactions to the game's existing buttons. */
export function initShopkeeper({ scene, image }) {
  if (!scene || !image || scene.querySelector('.keeper-rig')) return { react() {}, destroy() {} };

  const originalClass = image.className;
  const rig = document.createElement('div');
  rig.className = 'keeper keeper-rig';
  const pose = document.createElement('div');
  pose.className = 'keeper-pose';
  const head = image.cloneNode(false);
  head.className = 'keeper-head';
  head.alt = '';
  head.setAttribute('aria-hidden', 'true');
  head.removeAttribute('fetchpriority');
  image.before(rig);
  image.className = 'keeper-body';
  pose.append(image, head);
  rig.append(pose);

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reactionTimer = 0;
  let destroyed = false;
  function updateMotionPreference() {
    if (motionQuery.matches) {
      clearTimeout(reactionTimer);
      rig.removeAttribute('data-reaction');
    }
  }
  motionQuery.addEventListener('change', updateMotionPreference);

  return {
    react(kind) {
      if (destroyed || motionQuery.matches || !['success', 'miss', 'chat', 'ack'].includes(kind)) return;
      clearTimeout(reactionTimer);
      rig.removeAttribute('data-reaction');
      // Consecutive button clicks can restart the same gentle reaction.
      void rig.offsetWidth;
      rig.dataset.reaction = kind;
      reactionTimer = window.setTimeout(() => rig.removeAttribute('data-reaction'), 750);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(reactionTimer);
      motionQuery.removeEventListener('change', updateMotionPreference);
      image.className = originalClass;
      rig.replaceWith(image);
    },
  };
}
