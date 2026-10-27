/**
 * @fileoverview Content script for Google results pages. Reads the location
 * line in the page footer and reports it to the extension.
 */

(() => {
  /**
   * Reads the location Google shows in the footer.
   * @return {?{place: string, source: string}}
   */
  const read = () => {
    const f = document.querySelector('footer, [role="contentinfo"]');
    if (!f) return null;
    const t = [...f.querySelectorAll('button, [role="button"]')]
        .map((e) => (e.getAttribute('aria-label') || e.innerText || '')
            .replace(/\s+/g, ' ')
            .trim())
        .find((t) => t.includes(' - ') && t.length < 200);
    if (!t) return null;
    const i = t.lastIndexOf(' - ');
    return {place: t.slice(0, i), source: t.slice(i + 3)};
  };

  /**
   * Sends the location to the service worker, or to the compare page when
   * this page runs in one of its frames.
   * @param {?{place: string, source: string}} v
   */
  const send = (v) => {
    if (window.top === window) {
      chrome.runtime.sendMessage({verify: v});
      return;
    }
    // The target origin drops the message unless the parent is the compare
    // page. Older Firefox versions have no location.ancestorOrigins.
    parent.postMessage(
        {serpGeo: v}, new URL(chrome.runtime.getURL('')).origin);
  };

  // The footer location loads after the results; try for up to 10 seconds.
  let n = 0;
  const timer = setInterval(() => {
    const v = read();
    if (v || ++n > 20) {
      clearInterval(timer);
      send(v);
    }
  }, 500);
})();
