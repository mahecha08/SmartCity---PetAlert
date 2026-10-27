importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.19.0/firebase-messaging-compat.js');

try {
  const url = new URL(location);
  const configParam = url.searchParams.get('config');
  if (configParam) {
    const config = JSON.parse(configParam);
    firebase.initializeApp(config);
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      // Si el mensaje trae "notification", el SDK de Firebase ya la muestra solo
      // y después llama a este handler: mostrarla aquí también la duplicaría.
      // Solo se muestra a mano cuando el mensaje es de datos (sin "notification").
      if (payload.notification) return;
      const notificationTitle = payload.data?.title || 'PetAlert';
      const notificationOptions = {
        body: payload.data?.body || '',
        icon: '/pwa-192x192.png',
        data: payload.data
      };
      self.registration.showNotification(notificationTitle, notificationOptions);
    });
  }
} catch (error) {
  console.error('Error al inicializar Firebase en firebase-messaging-sw:', error);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});
