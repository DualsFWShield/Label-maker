/**
 * pwa.js — PWA installation prompt and Service Worker lifecycle management
 */

let _deferredPrompt = null;

function initPWA() {
  registerServiceWorker();
  setupInstallPrompt();
  setupForceUpdate();
}

/* ---------- Service Worker Registration ---------- */

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./sw.js')
    .then((registration) => {
      console.log('SW registered:', registration.scope);

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBar();
          }
        });
      });
    })
    .catch((err) => console.warn('SW registration failed:', err));

  // Handle controller change (after skipWaiting)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.location.reload();
  });
}

/* ---------- Install Prompt ---------- */

function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    _deferredPrompt = e;
    showInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    _deferredPrompt = null;
    hideInstallButton();
  });
}

function showInstallButton() {
  const btn = document.getElementById('btn-install-pwa');
  if (btn) btn.style.display = 'inline-flex';
}

function hideInstallButton() {
  const btn = document.getElementById('btn-install-pwa');
  if (btn) btn.style.display = 'none';
}

async function promptInstall() {
  if (!_deferredPrompt) return;
  _deferredPrompt.prompt();
  const { outcome } = await _deferredPrompt.userChoice;
  if (outcome === 'accepted') {
    _deferredPrompt = null;
    hideInstallButton();
  }
}

/* ---------- Update Bar ---------- */

function showUpdateBar() {
  const bar = document.getElementById('pwa-update-bar');
  if (bar) bar.classList.add('visible');
}

function applyUpdate() {
  if (!navigator.serviceWorker.controller) return;
  navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
}

/* ---------- Force Update ---------- */

function setupForceUpdate() {
  const btn = document.getElementById('btn-force-update');
  if (btn) {
    btn.addEventListener('click', forceUpdate);
  }
}

async function forceUpdate() {
  try {
    // Unregister all service workers
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));

    // Clear all caches
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));

    // Hard reload
    window.location.reload(true);
  } catch (e) {
    console.error('Force update failed:', e);
    window.location.reload(true);
  }
}

export { initPWA, promptInstall, applyUpdate, forceUpdate };
