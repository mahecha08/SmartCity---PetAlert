# SmartCity Pets - Plataforma MVP

Este es el MVP (Versión 1.0) para la plataforma web orientada a la identificación y reporte de mascotas perdidas, construida con Clean Architecture y preparada para la futura integración de IA (match).

## Arquitectura

- **Frontend**: React (Vite) + Tailwind CSS + Leaflet
- **Backend**: FastAPI (Python)
- **Base de Datos & Almacenamiento**: Firebase Firestore & Firebase Storage
- **Notificaciones**: SMTP
- **Patrón de Arquitectura**: Clean Architecture (separación por capas y servicios)

## Estructura de Carpetas

```text
/smartcity-pets
  /frontend         # Código del cliente (React)
    /src
      /components   # (Añadir futuros componentes aislados)
      /services     # Lógica de firebase y backend 
      firebaseConfig.js # Config Firebase
      App.jsx       # Componente Principal
  /backend          # Código del servidor (FastAPI)
    /api            # Endpoints y Rutas
    /core           # Configuración (CORS, Env)
    /services       # Lógica (Mail, Match AI futuro)
    main.py         # Entrypoint
  /docs             # Documentación extendida
```

## Requisitos Previos

1. **Node.js** (v18+)
2. **Python 3.9+**
3. **Proyecto en Firebase** (Firestore y Storage configurados)
4. **Cuenta de correo SMTP** para envío de notificaciones.

## Configuración y Ejecución

### 1. Variables de Entorno

**Frontend (.env en /frontend)**:
```env
VITE_FIREBASE_API_KEY=tu_api_key
VITE_FIREBASE_AUTH_DOMAIN=tu_dominio
VITE_FIREBASE_PROJECT_ID=tu_project_id
VITE_FIREBASE_STORAGE_BUCKET=tu_storage
VITE_FIREBASE_MESSAGING_SENDER_ID=tu_sender_id
VITE_FIREBASE_APP_ID=tu_app_id
```

**Backend (Variables de entorno del sistema o .env para uvicorn)**:
```bash
GOOGLE_APPLICATION_CREDENTIALS=/ruta/absoluta/a/tu/service-account.json
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_correo@gmail.com
SMTP_PASSWORD=tu_contraseña_de_aplicacion
```

### 2. Levantar el Entorno Local

#### Backend (FastAPI)
Abre una terminal y ejecuta:
```bash
cd backend
python -m venv venv
# Activar entorno (Windows): venv\Scripts\activate
# Activar entorno (Mac/Linux): source venv/bin/activate
pip install fastapi uvicorn firebase-admin pydantic email-validator
uvicorn main:app --reload --port 8000
```
La API estará disponible en: `http://localhost:8000/docs`

#### Frontend (React + Vite)
Abre una terminal nueva y ejecuta:
```bash
cd frontend
npm install
npm run dev
```
La UI estará disponible en: `http://localhost:5173`

## Futuro (Integración de IA)
La arquitectura está preparada para recibir un microservicio que analice `image_url` subida a Firebase. El endpoint `POST /api/reports` servirá como trigger para el modelo de clasificación (ResNet50 / ORB) antes de llamar al método `send_match_notification`.
