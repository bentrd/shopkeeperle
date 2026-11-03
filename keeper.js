/** A small, image-only puppet. No canvas, tracking, or generated artwork. */
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
  const hit = document.createElement('button');
  hit.className = 'keeper-hit';
  hit.type = 'button';
  hit.setAttribute('aria-label', 'Chat with the shopkeeper');
  hit.title = 'Chat with the shopkeeper';
  const onHover = () => { rig.dataset.hover = 'true'; };
  const onLeave = () => { delete rig.dataset.hover; };
  const onChat = () => scene.dispatchEvent(new CustomEvent('keeper-chat', { bubbles: true }));
  hit.addEventListener('pointerenter', onHover);
  hit.addEventListener('pointerleave', onLeave);
  hit.addEventListener('click', onChat);
  rig.append(hit);
  for (let n = 0; n < 3; n++) {
    const spark = document.createElement('span');
    spark.className = `keeper-spark keeper-spark-${n}`;
    spark.textContent = '✦';
    spark.setAttribute('aria-hidden', 'true');
    rig.append(spark);
  }

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const pointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
  let frame = 0;
  let reactionTimer = 0;
  let pointerListening = false;
  let destroyed = false;
  let angle = 0;
  let targetAngle = 0;
  let nod = 0;
  let targetNod = 0;
  let pointerX = null;
  let pointerY = null;

  function animateLook() {
    frame = 0;
    if (destroyed || motionQuery.matches) return;
    if (pointerX !== null) {
      const bounds = rig.getBoundingClientRect();
      const faceX = bounds.left + bounds.width * .46;
      const faceY = bounds.top + bounds.height * .30;
      targetAngle = Math.max(-1.8, Math.min(1.8, (pointerX - faceX) / Math.max(180, window.innerWidth * .40) * 1.8));
      targetNod = Math.max(-.8, Math.min(.8, (pointerY - faceY) / Math.max(180, window.innerHeight * .40) * .8));
      pointerX = pointerY = null;
    }
    angle += (targetAngle - angle) * .12;
    nod += (targetNod - nod) * .12;
    rig.style.setProperty('--keeper-look', `${angle.toFixed(3)}deg`);
    rig.style.setProperty('--keeper-look-y', `${nod.toFixed(3)}px`);
    if (Math.abs(targetAngle - angle) > .008 || Math.abs(targetNod - nod) > .008) frame = requestAnimationFrame(animateLook);
  }

  function requestLook() {
    if (!frame) frame = requestAnimationFrame(animateLook);
  }
  function onPointer(event) {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    requestLook();
  }
  function resetLook() {
    pointerX = pointerY = null;
    targetAngle = targetNod = 0;
    requestLook();
  }
  function updateMotionPreference() {
    const enabled = !motionQuery.matches && pointerQuery.matches;
    if (enabled && !pointerListening) {
      window.addEventListener('pointermove', onPointer, { passive: true });
      document.documentElement.addEventListener('pointerleave', resetLook);
      window.addEventListener('blur', resetLook);
      pointerListening = true;
    } else if (!enabled && pointerListening) {
      window.removeEventListener('pointermove', onPointer);
      document.documentElement.removeEventListener('pointerleave', resetLook);
      window.removeEventListener('blur', resetLook);
      pointerListening = false;
    }
    if (!enabled) {
      cancelAnimationFrame(frame);
      frame = 0;
      angle = targetAngle = nod = targetNod = 0;
      pointerX = pointerY = null;
      rig.style.removeProperty('--keeper-look');
      rig.style.removeProperty('--keeper-look-y');
      rig.removeAttribute('data-reaction');
    }
  }
  motionQuery.addEventListener('change', updateMotionPreference);
  pointerQuery.addEventListener('change', updateMotionPreference);
  updateMotionPreference();

  return {
    react(kind) {
      if (destroyed || motionQuery.matches || !['success', 'miss', 'chat'].includes(kind)) return;
      clearTimeout(reactionTimer);
      rig.removeAttribute('data-reaction');
      // One forced layout allows consecutive equal reactions to restart cleanly.
      void rig.offsetWidth;
      rig.dataset.reaction = kind;
      reactionTimer = window.setTimeout(() => rig.removeAttribute('data-reaction'), kind === 'success' ? 1100 : 800);
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearTimeout(reactionTimer);
      cancelAnimationFrame(frame);
      window.removeEventListener('pointermove', onPointer);
      document.documentElement.removeEventListener('pointerleave', resetLook);
      window.removeEventListener('blur', resetLook);
      motionQuery.removeEventListener('change', updateMotionPreference);
      pointerQuery.removeEventListener('change', updateMotionPreference);
      hit.removeEventListener('pointerenter', onHover);
      hit.removeEventListener('pointerleave', onLeave);
      hit.removeEventListener('click', onChat);
      image.className = originalClass;
      rig.replaceWith(image);
    },
  };
}
