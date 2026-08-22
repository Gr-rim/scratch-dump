// content.js — ScratchDump
(function () {
  if (window.__scratchdump_loaded__) return;
  window.__scratchdump_loaded__ = true;

  let panelContainer = null;
  let panelIframe = null;
  let resizeOverlay = null;
  let isVisible = false;
  let fixedSize = false;

  // Compute extension origin once for secure postMessage
  const extOrigin = new URL(chrome.runtime.getURL('')).origin;

  // The panel gets its identity from the service worker, not from here, so
  // nothing on this side races the iframe's load any more. What is left is
  // panel chrome: close, opacity, size lock.
  window.addEventListener('message', onIframeMessage);

  // ── BUILD PANEL ────────────────────────────────────────────────────────────
  function createPanel() {
    if (panelContainer) return;

    panelContainer = document.createElement('div');
    panelContainer.id = '__scratchdump__';
    Object.assign(panelContainer.style, {
      position: 'fixed',
      top: '16px', right: '16px',
      width: '420px', height: '520px',
      minWidth: '280px', minHeight: '320px',
      zIndex: '2147483630',
      display: 'none',
      borderRadius: '12px',
      boxShadow: '0 24px 64px rgba(0,0,0,0.28), 0 4px 16px rgba(0,0,0,0.14)',
      overflow: 'hidden',
    });

    panelIframe = document.createElement('iframe');
    panelIframe.src = chrome.runtime.getURL('frontend/panel.html');
    Object.assign(panelIframe.style, {
      position: 'absolute', inset: '0',
      width: '100%', height: '100%',
      border: 'none', borderRadius: '12px',
      display: 'block', background: 'transparent',
    });
    // web-share lets the panel hand an exported folder straight to the OS share
    // sheet. Without it navigator.share() throws in here — the Web Share API is
    // gated by permission policy, and an iframe is not granted it by default.
    panelIframe.allow = 'clipboard-read; clipboard-write; microphone; web-share';

    // Resize grip — BOTTOM LEFT corner
    const resizeHandle = document.createElement('div');
    resizeHandle.id = '__scratchdump_resize__';
    Object.assign(resizeHandle.style, {
      position: 'absolute', bottom: '0', left: '0',
      width: '22px', height: '22px',
      cursor: 'nesw-resize',
      zIndex: '5',
    });

    // Full-page overlay shown only while resizing
    resizeOverlay = document.createElement('div');
    Object.assign(resizeOverlay.style, {
      position: 'fixed', inset: '0',
      zIndex: '2147483645',
      display: 'none', cursor: 'nesw-resize',
    });

    panelContainer.appendChild(panelIframe);
    panelContainer.appendChild(resizeHandle);
    document.documentElement.appendChild(panelContainer);
    document.documentElement.appendChild(resizeOverlay);

    setupResize(panelContainer, resizeHandle);
  }

  // ── RESIZE (bottom-left corner) ─────────────────────────────────────────────
  // Bottom-left resize: dragging left expands width (inverted X), dragging down expands height.
  // We must also move the panel's RIGHT edge to stay anchored while left edge moves.
  function setupResize(container, handle) {
    let active = false;
    let startX, startY, startW, startH, startRight;

    handle.addEventListener('mousedown', (e) => {
      if (fixedSize) return;
      e.preventDefault();
      e.stopPropagation();
      active = true;
      startX = e.clientX;
      startY = e.clientY;
      startH = container.offsetHeight;

      // Anchor the RIGHT edge so the panel grows leftward from the grip.
      //
      // Measure against documentElement.clientWidth, not window.innerWidth.
      // innerWidth counts the vertical scrollbar, while the `right` offset of
      // a fixed element resolves against the viewport without it. Mixing the
      // two wrote a value one scrollbar-width too large, so the right edge
      // jumped inward the moment the grip was pressed — the twitch this
      // anchoring exists to prevent. Rounding matters for the same reason:
      // rect.right is fractional under browser zoom or a fractional DPI
      // scale, and the leftover sub-pixel would nudge the edge again.
      const rect = container.getBoundingClientRect();
      startRight = Math.round(document.documentElement.clientWidth - rect.right);

      // Switch to right-anchored so the left edge is free to move.
      container.style.left = 'auto';
      container.style.right = startRight + 'px';

      // Read the width only after the anchor swap, so the drag maths starts
      // from the value the layout has actually settled on.
      startW = container.offsetWidth;

      panelIframe.style.pointerEvents = 'none';
      resizeOverlay.style.display = 'block';
    });

    resizeOverlay.addEventListener('mousemove', (e) => {
      if (!active) return;
      // Moving left (negative dx) increases width
      const newW = Math.max(280, startW - (e.clientX - startX));
      const newH = Math.max(320, startH + (e.clientY - startY));
      container.style.width = newW + 'px';
      container.style.height = newH + 'px';
    });

    function endResize() {
      if (!active) return;
      active = false;
      panelIframe.style.pointerEvents = '';
      resizeOverlay.style.display = 'none';
    }
    resizeOverlay.addEventListener('mouseup', endResize);
    document.addEventListener('mouseup', endResize);
  }

  // ── MESSAGES FROM IFRAME ────────────────────────────────────────────────────
  function onIframeMessage(e) {
    // Only accept messages from our own extension iframe
    if (e.origin !== extOrigin) return;
    if (!e.data || e.data.source !== 'scratchpad') return;
    const { type, payload } = e.data;
    if (type === 'close') {
      hidePanel();
    } else if (type === 'setOpacity') {
      if (panelContainer) panelContainer.style.opacity = payload / 100;
    } else if (type === 'setFixedSize') {
      fixedSize = !!payload;
      const h = document.getElementById('__scratchdump_resize__');
      if (h) h.style.cursor = fixedSize ? 'default' : 'nesw-resize';
    }
  }

  // ── SHOW / HIDE ─────────────────────────────────────────────────────────────
  function showPanel() {
    if (!panelContainer) createPanel();
    panelContainer.style.display = 'block';
    isVisible = true;
  }

  function hidePanel() {
    if (panelContainer) panelContainer.style.display = 'none';
    isVisible = false;
    // The iframe survives being hidden, and so does anything running in it.
    // Tell the panel, so it can stop the microphone rather than leave the tab's
    // recording indicator lit behind a panel the user thinks they closed.
    notifyPanel('panelHidden');
  }

  function notifyPanel(type) {
    if (!panelIframe || !panelIframe.contentWindow) return;
    try {
      panelIframe.contentWindow.postMessage({ source: 'scratchpad-host', type }, extOrigin);
    } catch { /* iframe not on the extension origin yet */ }
  }

  // ── RUNTIME ─────────────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'togglePanel') {
      if (isVisible) hidePanel();
      else showPanel();
      sendResponse({ ok: true });
    }
    return false;
  });

})();
