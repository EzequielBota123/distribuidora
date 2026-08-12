if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Only reload on a controller change that happens AFTER this page was
    // already controlled — that's an update, not the first-ever install.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('/sw.js');

    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded || !hadController) return;
      reloaded = true;
      window.location.reload();
    });
  });
}
