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

  // Register message listener immediately — before iframe even loads
  // so we never miss the early getHostname request from panel.js
  window.addEventListener('message', onIframeMessage);

  // ── BUILD PANEL ─────────────────────────────────────────────────────────────
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
    panelIframe.src = chrome.runtime.getURL('panel.html');
    Object.assign(panelIframe.style, {
      position: 'absolute', inset: '0',
      width: '100%', height: '100%',
      border: 'none', borderRadius: '12px',
      display: 'block', background: 'transparent',
    });
    panelIframe.allow = 'clipboard-read; clipboard-write';

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
      startW = container.offsetWidth;
      startH = container.offsetHeight;
      // Anchor the RIGHT edge position so panel grows leftward
      const rect = container.getBoundingClientRect();
      startRight = window.innerWidth - rect.right;
      // Switch to right-anchored so left edge is free
      container.style.left = 'auto';
      container.style.right = startRight + 'px';

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
    } else if (type === 'getHostname') {
      sendHostname();
    }
  }

  function sendHostname() {
    if (panelIframe && panelIframe.contentWindow) {
      panelIframe.contentWindow.postMessage({
        source: 'scratchpad-host',
        type: 'hostname',
        payload: window.location.hostname
      }, extOrigin);
    }
  }

  // ── SHOW / HIDE ─────────────────────────────────────────────────────────────
  function showPanel() {
    if (!panelContainer) createPanel();
    panelContainer.style.display = 'block';
    isVisible = true;
    // Send hostname — both immediately and after a delay as fallback
    sendHostname();
    setTimeout(sendHostname, 400);
  }

  function hidePanel() {
    if (panelContainer) panelContainer.style.display = 'none';
    isVisible = false;
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