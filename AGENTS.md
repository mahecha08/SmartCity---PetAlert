# AGENTS.md — PetAlert (smartcity-pets)

Plataforma web para reportar mascotas perdidas o encontradas. Lee este archivo antes de tocar código.

## Stack

- **Frontend:** React + Vite, Tailwind CSS, Leaflet (mapa). Carpeta `frontend/`.
- **Backend:** FastAPI (Python 3.13 en Vercel). Carpeta `backend/`.
- **Datos:** Cloud Firestore (plan gratuito Spark). No se usa Firebase Storage: exige plan de pago.
- **Despliegue:** Vercel, dos proyectos (`backend/` y `frontend/`). Ver `docs/despliegue-vercel.md`.

## Estado real del código (verificado)

- `backend/main.py` contiene los endpoints y los modelos. El acceso a datos está en `backend/services/`:
  - `reports_repository.py`: repositorio en memoria (tests y desarrollo) y repositorio Firestore.
  - `reports_filters.py`: filtros y paginación del listado.
- `backend/api/` y `backend/core/` existen pero están **vacías**.
- Endpoints:
  - `GET /api/reports` (público): filtros `pet_type`, `status`, `days`, `limit`, `offset` y cercanía `near_lat`, `near_lng`, `radius_km` (5 por defecto). El total va en el header `X-Total-Count`.
  - `POST /api/reports` (requiere sesión): crea un reporte perdido o un avistamiento. Acepta `embedding` opcional.
  - `POST /api/matches` (público): candidatos parecidos a un `embedding`, con `similarity` de 0 a 100.
  - `GET /api/my-reports` (requiere sesión): reportes del usuario.
  - `PATCH /api/reports/{id}/status` (requiere sesión, solo el dueño): `{"status": "Resuelta"}`.
  - `POST /api/notifications/token` y `POST /api/notifications/unregister` (requieren sesión): `{"token": "<token FCM>"}`. Al registrarse un avistamiento, el dueño recibe un push en todos sus dispositivos (`backend/services/push.py`).
- Sesión: el frontend envía `Authorization: Bearer <ID token de Firebase Auth>`. Los listados nunca incluyen `embedding` ni `owner_uid`.
- Las fotos se **comprimen en el navegador** (máx. 800 px, JPEG 0.7, tope de 700 000 caracteres) y viajan como Base64 dentro del documento del reporte. Firestore limita cada documento a 1 MiB.
- La IA corre en el navegador (`frontend/src/services/petClassifier.js`, cargado de forma diferida): COCO-SSD detecta perro o gato (moderación) y MobileNet v2 calcula el vector de 1280 números.
- El plan completo y su estado están en `odd/tasks/petalert-v2.md`.

## Variables de entorno

| Variable | Dónde | Para qué |
|---|---|---|
| `REPORTS_STORE` | backend | `firestore` o `memory`. Por defecto `memory`, salvo en Vercel, donde es `firestore`. |
| `GOOGLE_APPLICATION_CREDENTIALS` | backend, local | Ruta al `.json` de la cuenta de servicio de Firebase. |
| `FIREBASE_CREDENTIALS_JSON` | backend, Vercel | Contenido del `.json`. Tiene prioridad sobre la ruta. |
| `SMTP_USER`, `SMTP_PASS` | backend | Cuenta de Gmail y contraseña de aplicación para los correos. |
| `VITE_API_URL` | frontend | URL del backend. Por defecto `http://localhost:8000`. |

## Cómo correr el proyecto

```bash
cd backend
pip install -r requirements-dev.txt
uvicorn main:app --reload
```

```bash
cd frontend
npm install
npm run dev
```

## Tests

```bash
cd backend
python -m pytest
```

Los tests usan el repositorio en memoria y un envío de correo falso: no tocan Firestore ni SMTP.

## Reglas de trabajo

1. **Nunca escribas secretos en el código.** Contraseñas, claves y tokens van en variables de entorno. Si ves uno ya escrito, avisa; no lo copies a otro archivo.
2. **No commitees** `backend/venv/`, `__pycache__/`, `.env` ni claves. El `.json` de Firebase vive fuera del repositorio.
3. **Una tarea, un dueño.** Cada tarea de `odd/tasks/` la hace un solo agente, en su propio worktree.
4. **Cambios de comportamiento van con test.** Escribe el test primero y comprueba que falla.
5. **No cambies la forma de los datos** (campos de `PetReportInput`, `PetReportComplete`, `PetUpdate`) sin avisar: el frontend depende de ellos.
6. **El listado de la pantalla y el desplegable de avistamientos** usan estados distintos (`listReports` y `reports`). No los unifiques: el desplegable necesita todos los reportes.
7. **Antes de dar algo por terminado**, corre el backend y el frontend y comprueba el flujo afectado.
