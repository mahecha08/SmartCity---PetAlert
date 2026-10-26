# AGENTS.md — PetAlert (smartcity-pets)

Plataforma web para reportar mascotas perdidas o encontradas. Lee este archivo antes de tocar código.

## Stack

- **Frontend:** React + Vite, Tailwind CSS, Leaflet (mapa). Carpeta `frontend/`.
- **Backend:** FastAPI (Python). Carpeta `backend/`.
- **Destino previsto:** Firebase Firestore (datos) y Firebase Storage (fotos).

## Estado real del código (verificado)

- `backend/main.py` contiene toda la API en un solo archivo.
- Las carpetas `backend/api/`, `backend/core/` y `backend/services/` existen pero están **vacías**. Son el destino de la separación en capas; no hay que asumir que contienen código.
- Los reportes se guardan **en memoria** (`reports_db`). Se pierden al reiniciar el servidor.
- Las fotos viajan como **Base64** desde el frontend (`fileToBase64` en `frontend/src/App.jsx`).
- **No hay tests** en el proyecto.

## Cómo correr el proyecto

```bash
cd backend
uvicorn main:app --reload
```

```bash
cd frontend
npm install
npm run dev
```

## Reglas de trabajo

1. **Nunca escribas secretos en el código.** Contraseñas, claves y tokens van en variables de entorno. Si ves uno ya escrito, avisa; no lo copies a otro archivo.
2. **No commitees** `backend/venv/`, `__pycache__/` ni archivos `.pyc`.
3. **Una tarea, un dueño.** Cada tarea de `odd/tasks/` la hace un solo agente, en su propio worktree.
4. **Cambios de comportamiento van con test.** Como el proyecto no tiene tests, el primer cambio que toque lógica debe crear la base de tests.
5. **No cambies la forma de los datos** (campos de `PetReportInput`, `PetReportComplete`, `PetUpdate`) sin avisar: el frontend depende de ellos.
6. **Antes de dar algo por terminado**, corré el backend y el frontend y comprobá el flujo afectado.
