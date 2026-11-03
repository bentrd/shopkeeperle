/** Resize the item grid through a small, keyboard-accessible bottom grip. */
export function initShopResize({ panel, grid }) {
  if (!panel || !grid || panel.querySelector('.shop-resize-handle')) return { destroy() {} };

  const originalHeight = panel.style.getPropertyValue('--shop-grid-height');
  const originalPriority = panel.style.getPropertyPriority('--shop-grid-height');
  const originalGridId = grid.id;
  if (!grid.id) grid.id = 'shop-resizable-items';
  const handle = document.createElement('div');
  handle.className = 'shop-resize-handle';
  handle.tabIndex = 0;
  handle.setAttribute('role', 'separator');
  handle.setAttribute('aria-orientation', 'horizontal');
  handle.setAttribute('aria-controls', grid.id);
  handle.setAttribute('aria-label', 'Resize item shop. Use the Up and Down arrow keys.');
  handle.title = 'Drag to resize · Arrow keys · Home / End';
  const grip = document.createElement('span');
  grip.className = 'shop-resize-grip';
  grip.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.className = 'shop-resize-label';
  label.textContent = 'Drag to expand';
  label.setAttribute('aria-hidden', 'true');
  handle.append(grip, label);
  panel.append(handle);

  let explicitHeight = null;
  let drag = null;
  let destroyed = false;
  let lastWidth = grid.getBoundingClientRect().width;

  function limits() {
    const base = Number.parseFloat(getComputedStyle(panel).getPropertyValue('--shop-grid-default')) || 112;
    return { min: base, max: Math.max(base, Math.min(720, Math.floor(window.innerHeight * .8))) };
  }
  function currentHeight() {
    return explicitHeight ?? limits().min;
  }
  function updateAccessibility() {
    const { min, max } = limits();
    const current = Math.round(currentHeight());
    const firstItem = grid.querySelector('.shop-item');
    const styles = getComputedStyle(grid);
    const rowSize = (firstItem?.getBoundingClientRect().height || 46) + (Number.parseFloat(styles.rowGap) || 8);
    const visibleHeight = Math.min(current, grid.scrollHeight || current);
    const rows = Math.max(1, Math.round(visibleHeight / rowSize));
    handle.setAttribute('aria-valuemin', String(Math.round(min)));
    handle.setAttribute('aria-valuemax', String(Math.round(max)));
    handle.setAttribute('aria-valuenow', String(current));
    handle.setAttribute('aria-valuetext', `About ${rows} ${rows === 1 ? 'row' : 'rows'} of items visible`);
    label.textContent = current > min + 1 ? 'Drag to resize' : 'Drag to expand';
  }
  function setHeight(height) {
    const { min, max } = limits();
    const next = Math.round(Math.min(max, Math.max(min, height)));
    if (next <= min) {
      explicitHeight = null;
      panel.style.removeProperty('--shop-grid-height');
    } else {
      explicitHeight = next;
      panel.style.setProperty('--shop-grid-height', `${next}px`);
    }
    updateAccessibility();
  }
  function stopDrag() {
    if (!drag) return;
    const pointerId = drag.pointerId;
    drag = null;
    panel.classList.remove('shop-is-resizing');
    if (handle.hasPointerCapture?.(pointerId)) handle.releasePointerCapture(pointerId);
  }
  function onPointerDown(event) {
    if (event.button !== 0 || event.isPrimary === false || drag) return;
    event.preventDefault();
    handle.focus({ preventScroll: true });
    drag = { pointerId: event.pointerId, startY: event.clientY, startHeight: currentHeight() };
    panel.classList.add('shop-is-resizing');
    handle.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    setHeight(drag.startHeight + event.clientY - drag.startY);
  }
  function onPointerEnd(event) {
    if (drag?.pointerId === event.pointerId) stopDrag();
  }
  function onKeyDown(event) {
    const { min, max } = limits();
    let next;
    if (event.key === 'ArrowDown') next = currentHeight() + 56;
    else if (event.key === 'ArrowUp') next = currentHeight() - 56;
    else if (event.key === 'Home') next = min;
    else if (event.key === 'End') next = max;
    else if (event.key === 'Enter' || event.key === ' ') next = currentHeight() > min + 1 ? min : Math.min(max, min + 224);
    else return;
    event.preventDefault();
    setHeight(next);
  }
  function refreshSize() {
    if (destroyed) return;
    const width = grid.getBoundingClientRect().width;
    if (Math.abs(width - lastWidth) > .5) {
      lastWidth = width;
      // A width change can also change the default row size at a breakpoint.
      if (explicitHeight !== null) setHeight(explicitHeight);
    }
    if (explicitHeight !== null && explicitHeight > limits().max) setHeight(explicitHeight);
    else updateAccessibility();
  }
  handle.addEventListener('pointerdown', onPointerDown);
  handle.addEventListener('pointermove', onPointerMove);
  handle.addEventListener('pointerup', onPointerEnd);
  handle.addEventListener('pointercancel', onPointerEnd);
  handle.addEventListener('lostpointercapture', onPointerEnd);
  handle.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', refreshSize, { passive: true });
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(refreshSize) : null;
  observer?.observe(grid);
  updateAccessibility();

  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopDrag();
      observer?.disconnect();
      window.removeEventListener('resize', refreshSize);
      handle.removeEventListener('pointerdown', onPointerDown);
      handle.removeEventListener('pointermove', onPointerMove);
      handle.removeEventListener('pointerup', onPointerEnd);
      handle.removeEventListener('pointercancel', onPointerEnd);
      handle.removeEventListener('lostpointercapture', onPointerEnd);
      handle.removeEventListener('keydown', onKeyDown);
      handle.remove();
      if (originalHeight) panel.style.setProperty('--shop-grid-height', originalHeight, originalPriority);
      else panel.style.removeProperty('--shop-grid-height');
      if (!originalGridId) grid.removeAttribute('id');
    },
  };
}
