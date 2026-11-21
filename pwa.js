/* SIXZEE install UX. Android Chrome shows INSTALL once the PWA checks pass. */
(function () {
  const installButton = document.getElementById('install-btn');
  let deferredPrompt = null;
  const standalone = window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }

  if (!installButton || standalone) return;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    installButton.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installButton.hidden = true;
  });

  installButton.addEventListener('click', async () => {
    if (!deferredPrompt) {
      installButton.hidden = true;
      return;
    }
    const promptEvent = deferredPrompt;
    deferredPrompt = null;
    promptEvent.prompt();
    const choice = await promptEvent.userChoice.catch(() => ({ outcome: 'dismissed' }));
    if (choice.outcome === 'accepted') installButton.hidden = true;
  });
})();
