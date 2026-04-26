/**
 * keepalive.js — Prevents mobile browsers from killing the WebSocket connection
 * when the tab goes to the background.
 *
 * Strategies used:
 * 1. Wake Lock API (prevents screen sleep on supported browsers)
 * 2. Web Worker-based ping interval (keeps JS alive even when tab is throttled)
 * 3. Silent audio loop (iOS Safari fallback — plays inaudible audio to stay alive)
 * 4. Aggressive visibility-based reconnection
 */
(function () {
  'use strict';

  // ── 1. Wake Lock ───────────────────────────────────────
  let wakeLock = null;

  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => {
          console.log('[KeepAlive] Wake Lock released');
          wakeLock = null;
        });
        console.log('[KeepAlive] Wake Lock acquired');
      }
    } catch (e) {
      console.log('[KeepAlive] Wake Lock unavailable:', e.message);
    }
  }

  // Re-acquire wake lock when page becomes visible again
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !wakeLock) {
      requestWakeLock();
    }
  });

  // Acquire on first user interaction (required by some browsers)
  function acquireOnInteraction() {
    requestWakeLock();
    document.removeEventListener('click', acquireOnInteraction);
    document.removeEventListener('touchstart', acquireOnInteraction);
  }
  document.addEventListener('click', acquireOnInteraction, { once: true });
  document.addEventListener('touchstart', acquireOnInteraction, { once: true });

  // ── 2. Web Worker Keepalive Ping ───────────────────────
  // Inline Web Worker that sends periodic pings to keep the main thread alive.
  // Mobile browsers throttle setTimeout/setInterval in background tabs,
  // but Web Workers are less aggressively throttled.
  let keepaliveWorker = null;
  try {
    const workerCode = `
      let interval = null;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          if (interval) clearInterval(interval);
          interval = setInterval(() => { self.postMessage('ping'); }, 5000);
        } else if (e.data === 'stop') {
          if (interval) clearInterval(interval);
          interval = null;
        }
      };
    `;
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    keepaliveWorker = new Worker(URL.createObjectURL(blob));

    keepaliveWorker.onmessage = function (e) {
      if (e.data === 'ping') {
        // If the socket exists and is connected, send a keepalive ping
        if (typeof socket !== 'undefined' && socket.connected) {
          socket.emit('ping_keepalive');
        }
        // If socket is disconnected, try reconnecting
        if (typeof socket !== 'undefined' && !socket.connected) {
          console.log('[KeepAlive] Socket disconnected, attempting reconnect...');
          socket.connect();
        }
      }
    };

    keepaliveWorker.postMessage('start');
    console.log('[KeepAlive] Web Worker keepalive started');
  } catch (e) {
    console.log('[KeepAlive] Web Worker not available:', e.message);
    // Fallback: plain setInterval (will be throttled in background but better than nothing)
    setInterval(() => {
      if (typeof socket !== 'undefined') {
        if (socket.connected) {
          socket.emit('ping_keepalive');
        } else {
          socket.connect();
        }
      }
    }, 5000);
  }

  // ── 3. Silent Audio Loop (iOS Safari) ──────────────────
  // iOS Safari suspends all JS execution when the tab is in background,
  // but audio playback keeps the process alive.
  let silentAudioCtx = null;
  let silentSource = null;
  let silentAudioStarted = false;

  function startSilentAudio() {
    if (silentAudioStarted) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      silentAudioCtx = new AudioCtx();

      // Create a buffer with near-silence (tiny amplitude to avoid auto-pause)
      const bufferSize = silentAudioCtx.sampleRate * 2; // 2 seconds
      const buffer = silentAudioCtx.createBuffer(1, bufferSize, silentAudioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = 0.00001; // Near-inaudible
      }

      silentSource = silentAudioCtx.createBufferSource();
      silentSource.buffer = buffer;
      silentSource.loop = true;

      // Connect through a gain node with very low volume
      const gainNode = silentAudioCtx.createGain();
      gainNode.gain.value = 0.001; // Extremely quiet
      silentSource.connect(gainNode);
      gainNode.connect(silentAudioCtx.destination);

      silentSource.start(0);
      silentAudioStarted = true;
      console.log('[KeepAlive] Silent audio loop started (iOS keepalive)');
    } catch (e) {
      console.log('[KeepAlive] Silent audio failed:', e.message);
    }
  }

  // Start silent audio on first user interaction (required for autoplay policy)
  function startAudioOnInteraction() {
    startSilentAudio();
    // Also resume any suspended audio context
    if (silentAudioCtx && silentAudioCtx.state === 'suspended') {
      silentAudioCtx.resume();
    }
    document.removeEventListener('click', startAudioOnInteraction);
    document.removeEventListener('touchstart', startAudioOnInteraction);
  }
  document.addEventListener('click', startAudioOnInteraction, { once: true });
  document.addEventListener('touchstart', startAudioOnInteraction, { once: true });

  // Resume audio context when page becomes visible (iOS pauses it)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (silentAudioCtx && silentAudioCtx.state === 'suspended') {
        silentAudioCtx.resume();
      }
    }
  });

  // ── 4. Aggressive Reconnect on Visibility ──────────────
  // Enhanced version: retries multiple times with increasing delays
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (typeof socket !== 'undefined' && !socket.connected) {
        console.log('[KeepAlive] Tab visible again, reconnecting...');
        socket.connect();
        // Retry after a short delay in case the first attempt fails
        setTimeout(() => {
          if (typeof socket !== 'undefined' && !socket.connected) {
            socket.connect();
          }
        }, 1500);
      }
    }
  });

  // ── 5. Page Freeze / Resume Handling ───────────────────
  // Some browsers fire 'freeze' and 'resume' events
  if ('onfreeze' in document) {
    document.addEventListener('freeze', () => {
      console.log('[KeepAlive] Page frozen');
    });
    document.addEventListener('resume', () => {
      console.log('[KeepAlive] Page resumed from freeze');
      if (typeof socket !== 'undefined' && !socket.connected) {
        socket.connect();
      }
    });
  }

  // ── 6. Periodic Heartbeat Check ────────────────────────
  // Check every 15 seconds if socket is still connected
  setInterval(() => {
    if (typeof socket !== 'undefined') {
      if (!socket.connected) {
        console.log('[KeepAlive] Heartbeat: socket disconnected, reconnecting...');
        socket.connect();
      }
    }
  }, 15000);

  console.log('[KeepAlive] Background keepalive system initialized');
})();
