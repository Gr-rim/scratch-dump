// background.js — ScratchDump
chrome.action.onClicked.addListener(async (tab) => {
  const url = tab.url || '';
  if (/^(chrome|brave|edge|about|data):/.test(url) || !url) return;

  try {
    // Try sending to existing content script first
    await chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
  } catch {
    // Content script not present — inject it, then toggle
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content.css']
      });
      // Retry sending the message until the content script is ready
      for (let attempt = 1; attempt <= 5; attempt++) {
        await new Promise(r => setTimeout(r, 50 * attempt));
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'togglePanel' });
          return; // success
        } catch { /* content script not ready yet, retry */ }
      }
      console.warn('ScratchDump: content script did not respond after retries');
    } catch (err) {
      console.warn('ScratchDump: could not inject', err);
    }
  }
});