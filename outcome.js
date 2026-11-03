/** An original League-inspired crest, shared by the reveal and the completed board. */
export const outcomeCrest = `<svg class="outcome-crest" viewBox="0 0 680 168" aria-hidden="true">
  <g class="crest-wings"><path d="M317 82 268 24 248 43 183 26 202 64 115 44 151 83 35 70 96 113 229 126 303 111M363 82 412 24 432 43 497 26 478 64 565 44 529 83 645 70 584 113 451 126 377 111"/>
  <path d="m65 88 98 14 72 8 69-14M615 88l-98 14-72 8-69-14M151 83l87 14 43-15M529 83l-87 14-43-15"/></g>
  <path class="crest-ring" d="m340 7 61 70-23 62-38 22-38-22-23-62Z"/>
  <path class="crest-gem" d="m340 26 40 52-15 47-25 17-25-17-15-47Z"/>
  <path class="crest-facets" d="m340 26-10 52 10 64 10-64Zm-40 52 30 0m20 0h30m-65 47 25-15 25 15"/>
  <path class="crest-crack" d="m342 28-12 37 18 15-21 28 9 29"/>
  <path class="crest-spark" d="M340 0v18m-9-9h18M279 77h18m-9-9v18m95-9h18m-9-9v18"/>
</svg>`;

export function initOutcomeDialog({ dialog, onNext, onShare, onDismiss }) {
  dialog.innerHTML = `<div class="endgame-content">
    <button class="endgame-close icon-button" aria-label="Close results" autofocus>×</button>
    <div class="endgame-eyebrow"></div>${outcomeCrest}
    <h2 id="outcome-title" class="endgame-title"></h2>
    <div class="endgame-rule" aria-hidden="true"><span></span></div>
    <p id="outcome-summary" class="endgame-summary"></p>
    <div class="endgame-item"><img width="64" height="64" alt=""><div><span class="endgame-item-label">THE MYSTERY ITEM</span><strong></strong></div></div>
    <div class="endgame-actions"><button class="endgame-continue gold-button"></button><button class="endgame-inspect secondary-button">View recipe</button></div>
    <button class="endgame-share text-button">Share result ↗</button>
  </div>`;
  let restoreFocus = true;
  const close = ({ navigating = false } = {}) => {
    restoreFocus = !navigating;
    if (dialog.open) dialog.close();
  };
  dialog.querySelector('.endgame-close').onclick = () => close();
  dialog.querySelector('.endgame-inspect').onclick = () => close();
  dialog.querySelector('.endgame-continue').onclick = () => { close({ navigating: true }); onNext(); };
  dialog.querySelector('.endgame-share').onclick = () => { close(); onShare(); };
  dialog.addEventListener('close', () => { if (restoreFocus) onDismiss(); });

  return {
    show({ status, item, guesses, limit, mode }) {
      const victory = status === 'won';
      dialog.className = `endgame-dialog ${victory ? 'victory' : 'defeat'}`;
      dialog.querySelector('.endgame-eyebrow').textContent = mode === 'daily' ? 'DAILY CHALLENGE COMPLETE' : 'UNLIMITED RECIPE COMPLETE';
      dialog.querySelector('#outcome-title').textContent = victory ? 'VICTORY' : 'DEFEAT';
      dialog.querySelector('#outcome-summary').textContent = victory ? `Recipe found in ${guesses} of ${limit} guesses. A fine purchase.` : `All ${limit} guesses used. The shopkeeper wins this round.`;
      const image = dialog.querySelector('.endgame-item img');
      image.src = item.image; image.alt = item.name;
      dialog.querySelector('.endgame-item strong').textContent = item.name;
      dialog.querySelector('.endgame-continue').textContent = mode === 'daily' ? 'Play unlimited' : 'Next recipe';
      restoreFocus = true;
      if (!dialog.open) dialog.showModal();
      dialog.scrollTop = 0;
    },
    close,
  };
}
