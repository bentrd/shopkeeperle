import { createShareCard, SHARE_FORMATS } from './share-card.js';

/** The native share call runs on a separate click after the PNG is ready (Safari activation). */
export function initSharing({ dialog, onDismiss }) {
  dialog.innerHTML = `<button class="icon-button share-close" aria-label="Close sharing" autofocus>×</button>
    <span class="eyebrow">A RECEIPT WORTH SHARING</span><h2 id="share-title">Share your result</h2>
    <div class="share-formats" aria-label="Image format">${Object.entries(SHARE_FORMATS).map(([id, format]) => `<button type="button" data-share-format="${id}" aria-pressed="${id === 'story'}">${format.label}<small>${format.ratio}</small></button>`).join('')}</div>
    <div class="share-preview-wrap"><img id="share-preview" alt="" hidden><span class="share-rendering" role="status">Preparing your card…</span></div>
    <div class="share-image-actions"><button class="gold-button share-native" disabled hidden>Share image ↗</button><a class="gold-button share-save" aria-disabled="true">Save PNG ↓</a></div>
    <div class="share-copy-actions"><button class="secondary-button share-copy">Copy result</button><button class="secondary-button share-link">Copy link</button><a class="text-button share-open" target="_blank" rel="noopener" hidden>Open image ↗</a></div>
    <p class="share-hint">Save the card for Instagram Stories or a post. On iPhone, you can also touch and hold the preview.</p>
    <p id="share-status" class="share-status" role="status" aria-live="polite"></p>
    <textarea class="share-manual-copy" readonly aria-label="Copy this text" hidden></textarea>`;
  const find = selector => dialog.querySelector(selector);
  const preview = find('#share-preview'), status = find('#share-status');
  const native = find('.share-native'), save = find('.share-save'), openImage = find('.share-open');
  const urls = new Set();
  let model, format = 'story', file = null, generation = 0, nativeBusy = false, restoreFocus = true;
  let cacheKey = '', prepared = new Map();
  const nativeSupported = value => {
    try { return !!value && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [value] }); }
    catch { return false; }
  };
  async function render() {
    const token = ++generation;
    file = null; native.disabled = true; native.hidden = true; save.removeAttribute('href'); save.setAttribute('aria-disabled', 'true'); openImage.hidden = true;
    preview.hidden = true; find('.share-rendering').hidden = false; status.textContent = '';
    find('.share-manual-copy').hidden = true;
    for (const button of dialog.querySelectorAll('[data-share-format]')) button.setAttribute('aria-pressed', String(button.dataset.shareFormat === format));
    try {
      let ready = prepared.get(format);
      const result = ready || await createShareCard(model, format);
      if (token !== generation || !dialog.open) return;
      if (!ready) {
        const url = URL.createObjectURL(result.blob); urls.add(url);
        ready = { ...result, url, file:typeof File === 'function' ? new File([result.blob], result.filename, { type: 'image/png' }) : null };
        prepared.set(format, ready);
      }
      file = ready.file;
      preview.src = ready.url; preview.alt = model.alt; preview.hidden = false;
      preview.width = result.width; preview.height = result.height;
      preview.style.aspectRatio = `${result.width} / ${result.height}`;
      save.href = ready.url; save.download = result.filename; save.setAttribute('aria-disabled', 'false');
      openImage.href = ready.url; openImage.hidden = false;
      native.hidden = !nativeSupported(file); native.disabled = nativeBusy || !nativeSupported(file);
      find('.share-hint').textContent = nativeSupported(file) ? 'Share the image to an available app, or save it for Instagram. On iPhone, touch and hold the preview to save it.' : 'Save the card for Instagram Stories or a post. On iPhone, you can also touch and hold the preview.';
    } catch {
      if (token !== generation) return;
      status.textContent = 'Couldn’t create the card. You can still copy your result or link.';
      native.hidden = true;
    } finally { if (token === generation) find('.share-rendering').hidden = true; }
  }
  async function copy(value, message) {
    try { await navigator.clipboard.writeText(value); status.textContent = message; }
    catch { const field = find('.share-manual-copy'); field.value = value; field.hidden = false; field.focus(); field.select(); status.textContent = 'Select and copy the text below.'; }
  }
  native.onclick = async () => {
    if (!file || nativeBusy || !nativeSupported(file)) return;
    nativeBusy = true; native.disabled = true;
    try { await navigator.share({ files: [file] }); }
    catch (error) { if (error.name !== 'AbortError') status.textContent = 'Use Save PNG or Open image to share this card instead.'; }
    finally { nativeBusy = false; native.disabled = !nativeSupported(file); }
  };
  find('.share-close').onclick = () => dialog.close();
  find('.share-copy').onclick = () => copy(model.text, 'Result copied. No item spoilers.');
  find('.share-link').onclick = () => copy(model.url, 'Game link copied.');
  save.onclick = event => { if (save.getAttribute('aria-disabled') === 'true') event.preventDefault(); };
  for (const button of dialog.querySelectorAll('[data-share-format]')) button.onclick = () => { if (format !== button.dataset.shareFormat) { format = button.dataset.shareFormat; render(); } };
  dialog.addEventListener('close', () => { generation++; file = null; if (restoreFocus) onDismiss(); });
  // Retain prior Blob URLs for iOS save/open interactions; release all only when the page leaves.
  window.addEventListener('pagehide', event => { if (!event.persisted) { for (const url of urls) URL.revokeObjectURL(url); urls.clear(); } });
  return {
    open(resultModel) {
      model = structuredClone(resultModel); format = 'story';
      const nextKey = JSON.stringify(model);
      if (nextKey !== cacheKey) { cacheKey = nextKey; prepared = new Map(); }
      restoreFocus = true;
      if (!dialog.open) dialog.showModal();
      dialog.scrollTop = 0; render();
    },
    close({navigating = false} = {}) { restoreFocus = !navigating; if (dialog.open) dialog.close(); },
  };
}
