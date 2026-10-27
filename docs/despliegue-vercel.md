# Despliegue en Vercel (plan gratuito)

PetAlert se despliega como **dos proyectos de Vercel** a partir del mismo repositorio:

| Proyecto | Carpeta raíz (Root Directory) | Qué es |
|---|---|---|
| `petalert-api` | `backend` | API en FastAPI |
| `petalert` | `frontend` | Aplicación React (Vite) |

Se despliega primero el backend, porque el frontend necesita su URL.

## Requisitos previos

- El código ya está subido a GitHub (rama `main`).
- Una cuenta de Vercel creada con GitHub (plan **Hobby**, gratuito).
- La base de datos Firestore creada en el proyecto de Firebase `smartcity-pets`.
- El archivo `.json` de la clave de cuenta de servicio de Firebase. **Nunca** se sube al repositorio.

## 1. Backend (`petalert-api`)

1. En Vercel: **Add New… → Project** e importa el repositorio.
2. Nombre del proyecto: `petalert-api` (o el que prefieras).
3. En **Root Directory** pulsa *Edit* y elige `backend`.
4. Vercel detecta FastAPI solo, porque `backend/main.py` define `app`. La versión de Python (3.13) sale de `backend/.python-version`.
5. En **Environment Variables** agrega:

| Variable | Valor | Obligatoria |
|---|---|---|
| `FIREBASE_CREDENTIALS_JSON` | El contenido **completo** del `.json` de la clave de Firebase, pegado tal cual | Sí |
| `REPORTS_STORE` | `firestore` | Recomendada (en Vercel ya es el valor por defecto) |
| `SMTP_USER` | Tu cuenta de Gmail que envía los correos | Solo si quieres correos |
| `SMTP_PASS` | La contraseña de aplicación de esa cuenta | Solo si quieres correos |

6. Pulsa **Deploy**.
7. Comprueba que funciona abriendo estas dos direcciones (cambia el dominio por el tuyo):
   - `https://petalert-api.vercel.app/` debe responder `{"status":"ok"}`.
   - `https://petalert-api.vercel.app/api/reports` debe responder `[]`.

Si Vercel te pide iniciar sesión al abrir esas direcciones, desactiva la protección en **Settings → Deployment Protection**.

## 2. Frontend (`petalert`)

1. **Add New… → Project** e importa el mismo repositorio.
2. Nombre del proyecto: `petalert`.
3. **Root Directory**: `frontend`. Vercel detecta Vite y usa `npm run build`.
4. En **Environment Variables** agrega:

| Variable | Valor |
|---|---|
| `VITE_API_URL` | La URL del backend, **sin barra final**. Ejemplo: `https://petalert-api.vercel.app` |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | Los mismos valores de `frontend/.env` (app web `petalert-web` de Firebase). Son valores públicos del SDK web, no secretos. |

5. Pulsa **Deploy**.
6. En Firebase: **Authentication → Configuración → Dominios autorizados** y agrega el dominio del frontend (por ejemplo `petalert.vercel.app`). Sin esto, el inicio de sesión falla en producción.

`VITE_API_URL` se incorpora al código **al construirlo**. Si la cambias después, hay que volver a desplegar el frontend.

## 3. Probar todo

1. Abre la URL del frontend.
2. Crea un reporte de mascota perdida con una foto.
3. En la consola de Firebase (Firestore Database) debe aparecer la colección `reports` con el reporte.
4. En la pestaña "Mascotas Reportadas" el reporte debe verse, con los filtros y la paginación.

## Problemas frecuentes

| Síntoma | Causa probable |
|---|---|
| El backend responde error 500 | Revisa **Logs** en Vercel. Suele ser `FIREBASE_CREDENTIALS_JSON` mal pegada o ausente. |
| El frontend dice que no hay reportes y la red muestra `localhost:8000` | Falta `VITE_API_URL`. Agrégala y vuelve a desplegar el frontend. |
| El navegador bloquea la petición (CORS) | El backend permite todos los orígenes; revisa que la URL de `VITE_API_URL` sea correcta y use `https`. |
| Los reportes se guardan pero no llegan correos | Faltan `SMTP_USER` / `SMTP_PASS`, o la contraseña de aplicación no es válida. En serverless los correos corren en segundo plano y podrían no completarse; hay que comprobarlo. |

## Seguridad

- La clave de Firebase y la contraseña SMTP solo viven en las variables de entorno de Vercel.
- Las variables `VITE_*` quedan visibles en el navegador: nunca guardes secretos en ellas. `VITE_API_URL` es solo una dirección pública.
