# PetAlert v2 — funciones pendientes antes de publicar

Objetivo: completar cuentas, búsqueda por cercanía, PWA con cámara, IA de detección y match, notificaciones y moderación, sin salir de planes gratuitos (Firebase Spark, Vercel Hobby).
Rama: `main` sin commits hasta que el usuario lo pida. Reparto: Claude Code = backend (`smartcity-pets`), Antigravity = frontend (`smartcity-frontend`). Tests: `python -m pytest` en `backend/`; `vite build` en el frontend.

## Specs

- **S1 — Cuentas.** "Cuentas de usuario (Firebase Auth) y “Mis reportes” para marcar como encontrada."
  - El backend verifica el ID token de Firebase. Cada reporte guarda el `uid` de quien lo creó.
  - "Mis reportes" lista solo los reportes del usuario. Solo el dueño puede marcar su reporte como `Resuelta`.
- **S2 — Cercanía.** "Búsqueda por cercanía (radio de 5 km)."
  - `GET /api/reports` acepta `near_lat`, `near_lng` y `radius_km` (por defecto 5). Devuelve solo los reportes dentro del radio, con su distancia.
- **S3 — Celular.** "App en el celular: PWA y acceso a la cámara."
  - La app se puede instalar (manifest + service worker) y permite tomar la foto con la cámara o elegirla de la galería.
- **S4 — IA.** "El modelo de IA: detectar la mascota en la foto y hacer el match por similitud."
  - Del pedido original: "que el modelo de ia pueda detectar la mascota, no tener uno mismo que elegir y tener que adivinar cual es la mascota perdida" y "que se pueda acceder a la camara y se pueda tomar la foto para que el modelo a implementar detecte cual es la mascota y hata un tipo de "match" para que determine cuales son las mascotas a las que se parecen".
  - **Aprobado (L4):** detección y vector de características en el navegador (TensorFlow.js: COCO-SSD + MobileNet); el backend guarda el vector y calcula similitud coseno. Resultado: candidatos ordenados con porcentaje, para que una persona confirme.
  - Backend: `POST /api/matches` recibe `embedding` (y opcionalmente `pet_type`, cercanía y `limit`) y devuelve candidatos con `similarity` de 0 a 100. Excluye reportes `Resuelta` y sin vector. El vector no se incluye en los listados.
- **S5 — Notificaciones y moderación.** "Notificaciones push/SMS y moderación de contenido."
  - Push web con Firebase Cloud Messaging (gratuito).
  - **SMS: fuera de alcance** (L4). Twilio y similares cobran por mensaje.
  - **Moderación (L4):** la detección de S4 rechaza en el navegador las fotos sin perro ni gato. Reemplaza a Google Vision SafeSearch, que exige facturación.

## Tasks

| ID | Spec | Dueño | Ruta | Estado | Evidencia |
|---|---|---|---|---|---|
| T1 | S2 | Claude Code | backend, inline | hecho (sin commit) | RED: ImportError de `distancia_km`. GREEN: 52 tests. Firestore real: 1 resultado a 1.0 km, `distance_km` no se guarda. |
| T2 | S1 | Claude Code | backend, inline | hecho (sin commit) | RED: falta `services.auth`. GREEN: 91 tests. Firebase real: tokens inválidos → 401. Login real (usuario temporal, ya borrado): POST 200, my-reports 1, PATCH Resuelta 200. Decisión: crear reportes exige sesión; leer es público. |
| T3 | S4 | Claude Code | backend, inline | hecho (sin commit) | RED: falta `services.matching`. GREEN: 74 tests. Firestore real: foto de 700 000 caracteres + vector de 1280 se guarda y se lee intacto; vector parecido da 99.9 %. |
| T4 | S5 | Claude Code | backend, inline | hecho (sin commit) | RED: falta `services.push`. GREEN: 107 tests. Firestore real: tokens sin duplicar, otro usuario no puede borrar, limpieza en 0. FCM real: token inventado → `InvalidArgumentError`, marcado como inválido. Se mantiene `tokens` (no `fids`, que son Installation IDs). |
| F1 | S3 | Antigravity | frontend | hecho (sin commit); falta confirmar el service worker en Chrome real | Build: JS principal 404 KB, TensorFlow.js en chunk diferido de 1.118 KB, no se carga al abrir. Manifest enlazado; íconos PNG reales 192 y 512. Dos inputs: `capture="environment"` y galería. `sw.js` válido pero el navegador embebido no lo registra ("unknown error fetching the script"). Precache de 1.528 KB incluye TensorFlow.js. |
| F2 | S1 | Antigravity | frontend | hecho (sin commit); cierre de sesión probado con F5 | Navegador (usuario temporal, ya borrado): registro con correo → sesión iniciada; reporte enviado con `Authorization: Bearer`; listado público sin token; "Mis Reportes" lo muestra; "Marcar como encontrada" pide confirmación → RESUELTA en verde; backend: `status=Resuelta`, sin `owner_uid`. Error en dev resuelto con `vite --force` (caché de dependencias vieja). |
| F3 | S4, S5 | Antigravity | frontend | hecho (sin commit); pendiente carga diferida de TensorFlow.js | Navegador: husky detectado como perro 92 % (27 s la primera vez, 1 s después); reporte guardado sin exponer el vector; avistamiento con la misma foto sugiere el reporte con 100 %; imagen sin mascota rechazada y botón deshabilitado. Build: JS principal 394 KB → 1.521 KB. |
| F4 | S2 | Antigravity | frontend | hecho (sin commit); permiso denegado sin probar | Navegador con ubicación simulada: "a 1.0 km", radios 1/5/10, petición con `near_lat`/`near_lng`/`radius_km=5`, "Quitar cercanía" vuelve al listado normal. |
| F5 | S5 | Antigravity (+ corrección de Claude Code) | frontend | hecho (sin commit); falta recibir un push real en Chrome | Revisión: el SDK 12.19.0 muestra solo los mensajes con `notification` y después llama a `onBackgroundMessage` (`index.sw.esm.js` 1413-1419) → el SW los duplicaba; corregido. Backend con auth y FCM reales: token registrado → avistamiento → envío a FCM → token inválido borrado. Navegador: permiso `denied` muestra el mensaje correcto; cierre de sesión actualiza la pantalla sin recargar. Pendiente menor: muestra "Notificaciones activadas" aunque el backend falle al registrar. |

## Log

- **L1 (2026-10-27, pedido del usuario):** "antes de llegar a publicar necesito y de hacer commits que desarrollemos lo que hace falta que es lo siguiente: Cuentas de usuario (Firebase Auth) y “Mis reportes” para marcar como encontrada. Búsqueda por cercanía (radio de 5 km). App en el celular: PWA y acceso a la cámara. No está preparado ni probado. El modelo de IA: detectar la mascota en la foto y hacer el match por similitud. Es lo que hace “smart” al proyecto, y todavía no existe. Notificaciones push/SMS y moderación de contenido. Necesito que ya lo hagamos y avancemos con eso, que lo hagamos tanto con claude code y antigravity, entonces puedes empezar a desarrollar"
- **L2:** Sin commits por pedido del usuario. Riesgo: los cambios se acumulan sin commitear en `main` y en el worktree del frontend.
- **L5 (2026-10-27, despliegue):** Vercel `petalert-api` (backend, `petalert-api.vercel.app`) y `petalert` (frontend, `petalert-xi.vercel.app`) desde `cfa51cc`, ambos READY. Producción: health 200, listado desde Firestore, 401 sin sesión, CORS correcto; login real, reporte, Mis reportes, avistamiento y cercanía → 200; frontend llama al backend real y muestra el reporte. Correos: no verificables por logs (plan Hobby no devuelve logs por API); **el usuario confirmó que llegaron los dos** (confirmación y avistamiento). `petalert-xi.vercel.app` autorizado en Firebase Auth. Datos de prueba borrados (0 reportes, 0 usuarios, 0 tokens).
- **L4 (2026-10-27, decisión del usuario):** "Apruebo: IA en el navegador con TensorFlow.js, sin SMS, y moderación por detección de perro o gato."
- **L3:** Restricciones verificadas antes: Firebase Storage exige plan Blaze; la función Python de Vercel tiene un límite de 500 MB, lo que descarta PyTorch/TensorFlow en el servidor.
