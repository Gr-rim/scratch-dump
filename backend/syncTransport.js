// syncTransport.js — ScratchDump
//
// Phone sync's transport, run in the service worker rather than in the panel.
//
// Dormant: the phone app is not released, so background.js does not load this
// file, and it is left out of the store package. Turning sync back on means
// `importScripts('/backend/syncTransport.js')` in background.js — see the
// sync section of the README for the rest.
//
// panel.html is a chrome-extension:// page, which Chrome treats as a secure
// context, so a plain-http fetch out of it counts as mixed content and gets
// silently upgraded to https. The phone speaks http on a raw socket and has
// no TLS to answer with, so the upgraded request dies in the handshake —
// net::ERR_SSL_PROTOCOL_ERROR, which surfaces as "can't reach that address"
// and looks for all the world like a network fault.
//
// A service worker is not a document and its fetches are not subresource
// loads, so no upgrade is applied. Only the transport lives here: pairing, key
// derivation and every envelope still happen in syncClient.js.

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.action !== 'syncFetch') return false;
  syncFetch(msg.url, msg.init, msg.timeoutMs)
    .then(sendResponse)
    .catch(err => sendResponse({ ok: false, kind: 'network', error: String((err && err.message) || err) }));
  return true;   // response is sent asynchronously
});

/**
 * One http request to the phone, on the panel's behalf.
 *
 * Returns rather than throws: the panel needs to tell a timeout apart from a
 * refusal, and an exception thrown here would reach it as a bare
 * "could not establish connection" with everything useful lost.
 *
 * @param {string} url
 * @param {{method?:string, headers?:Object, body?:string}} init
 * @param {number} timeoutMs
 * @returns {Promise<{ok:boolean, kind?:string, status?:number, body?:*, error?:string}>}
 */
async function syncFetch(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(timeoutMs) || 30000);

  try {
    const res = await fetch(url, {
      method: (init && init.method) || 'GET',
      headers: (init && init.headers) || undefined,
      body: (init && init.body) || undefined,
      signal: controller.signal,
      cache: 'no-store',
    });

    // Read as text and parse here. A body that is not JSON is a peer that is
    // not ScratchDump, which the panel reports differently from a failure to
    // reach anything at all.
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = null; }

    return { ok: true, status: res.status, body };

  } catch (e) {
    const kind = (e && e.name === 'AbortError') ? 'timeout' : 'network';
    return { ok: false, kind, error: String((e && e.message) || e) };
  } finally {
    clearTimeout(timer);
  }
}
