// stt.js — Speech-to-text module for ScratchDump
// Loaded after historyManager.js, before panel.js
'use strict';

const STT = (() => {
  let recognition = null;
  let isListening = false;

  function isSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  function isBrave() {
    return navigator.brave?.isBrave?.() ?? false;
  }

  // Track how many results we've already committed as final text,
  // so we don't re-insert them when new interim events fire.
  let finalizedUpTo = 0;

  function init(onResult, onEnd, onError) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    finalizedUpTo = 0;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = ScratchDump.settings.sttLang || 'en-US';

    recognition.onresult = (e) => {
      let interim = '';
      let final = '';
      for (let i = finalizedUpTo; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          final += e.results[i][0].transcript;
          finalizedUpTo = i + 1;
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      onResult(final, interim);
    };

    recognition.onend = () => {
      isListening = false;
      ScratchDump.sttActive = false;
      onEnd();
    };

    recognition.onerror = (e) => {
      const fatal = ['not-allowed', 'service-not-allowed', 'network', 'aborted'];
      if (fatal.includes(e.error)) {
        isListening = false;
        ScratchDump.sttActive = false;
        showSTTUnavailableHint();
        onEnd();
      } else if (e.error !== 'no-speech') {
        onError(e.error);
      }
    };
  }

  function start(onResult, onEnd, onError) {
    if (!isSupported() || isListening) return;
    init(onResult, onEnd, onError);
    try {
      recognition.start();
    } catch (e) {
      showSTTUnavailableHint();
      onEnd();
      return;
    }
    isListening = true;
    ScratchDump.sttActive = true;
  }

  function stop() {
    if (!recognition || !isListening) return;
    recognition.stop();
    isListening = false;
    ScratchDump.sttActive = false;
  }

  function toggle(onResult, onEnd, onError) {
    isListening ? stop() : start(onResult, onEnd, onError);
  }

  function showSTTUnavailableHint() {
    // Remove existing hint if any
    const existing = document.getElementById('sttHint');
    if (existing) existing.remove();

    const hint = document.createElement('div');
    hint.id = 'sttHint';
    hint.textContent = 'Voice input unavailable — your browser may be blocking it';
    const anchor = document.querySelector('.bottom-right');
    if (anchor) anchor.appendChild(hint);

    setTimeout(() => { if (hint.parentNode) hint.remove(); }, 4000);
  }

  return {
    isSupported,
    isBrave,
    start,
    stop,
    toggle,
    get isListening() { return isListening; }
  };
})();
