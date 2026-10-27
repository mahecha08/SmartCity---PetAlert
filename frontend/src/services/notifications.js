import { getMessaging, getToken, deleteToken, onMessage, isSupported } from 'firebase/messaging';
import { app, firebaseConfig } from '../firebaseConfig';

let swRegistrationInstance = null;
let messagingInstance = null;

export async function isNotificationSupported() {
  if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return false;
  }
  try {
    return await isSupported();
  } catch (err) {
    console.warn('Error en isSupported():', err);
    return false;
  }
}

export async function getMessagingServiceWorkerRegistration() {
  if (swRegistrationInstance) return swRegistrationInstance;
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;

  const configQuery = encodeURIComponent(JSON.stringify(firebaseConfig));
  swRegistrationInstance = await navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?config=${configQuery}`,
    { scope: '/firebase-cloud-messaging-push-scope' }
  );
  return swRegistrationInstance;
}

export async function getMessagingInstance() {
  const supported = await isNotificationSupported();
  if (!supported) return null;
  if (!messagingInstance) {
    messagingInstance = getMessaging(app);
  }
  return messagingInstance;
}

export async function obtainFcmToken() {
  const supported = await isNotificationSupported();
  if (!supported) return null;

  const messaging = await getMessagingInstance();
  if (!messaging) return null;

  const swRegistration = await getMessagingServiceWorkerRegistration();
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: swRegistration
  });
  return token;
}

export async function registerTokenWithBackend(apiUrl, fcmToken, idToken) {
  if (!apiUrl || !fcmToken || !idToken) return false;
  try {
    const res = await fetch(`${apiUrl}/api/notifications/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ token: fcmToken })
    });
    return res.ok;
  } catch (err) {
    console.error('Error registrando token FCM en el backend:', err);
    return false;
  }
}

export async function unregisterTokenFromBackend(apiUrl, fcmToken, idToken) {
  if (!apiUrl || !fcmToken || !idToken) return false;
  try {
    const res = await fetch(`${apiUrl}/api/notifications/unregister`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`
      },
      body: JSON.stringify({ token: fcmToken })
    });
    return res.ok;
  } catch (err) {
    console.error('Error desregistrando token FCM en el backend:', err);
    return false;
  }
}

export async function deleteFcmToken() {
  try {
    const messaging = await getMessagingInstance();
    if (messaging) {
      await deleteToken(messaging);
    }
  } catch (err) {
    console.warn('Error al eliminar token FCM:', err);
  }
}

export async function setupForegroundNotifications(onReceive) {
  const supported = await isNotificationSupported();
  if (!supported) return () => {};

  try {
    const messaging = await getMessagingInstance();
    if (!messaging) return () => {};

    return onMessage(messaging, (payload) => {
      onReceive(payload);
    });
  } catch (err) {
    console.warn('Error configurando onMessage:', err);
    return () => {};
  }
}
