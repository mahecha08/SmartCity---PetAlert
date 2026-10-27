from fastapi import FastAPI, HTTPException, Body, BackgroundTasks, Depends, Query, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Literal, Optional
import os
import uuid
import smtplib
from email.message import EmailMessage
from datetime import datetime

from services.auth import usuario_actual
from services.matching import buscar_parecidos
from services.push import build_token_store, enviar_push
from services.reports_filters import filtrar_y_paginar
from services.reports_repository import build_repository

# --- Configuración Inicial ---
app = FastAPI(title="PetAlert API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Total-Count"],
)

# --- Credenciales SMTP (desde variables de entorno, nunca en el código) ---
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")

def send_email(to_email: str, subject: str, html_content: str):
    if not SMTP_USER or not SMTP_PASS:
        print("SMTP_USER o SMTP_PASS no están configurados; no se envió el correo.")
        return

    msg = EmailMessage()
    msg['Subject'] = subject
    msg['From'] = SMTP_USER
    msg['To'] = to_email
    msg.set_content("Por favor activa la visualización HTML para ver este correo.")
    msg.add_alternative(html_content, subtype='html')

    try:
        with smtplib.SMTP_SSL('smtp.gmail.com', 465) as server:
            server.login(SMTP_USER, SMTP_PASS)
            server.send_message(msg)
    except Exception as e:
        print(f"Error enviando correo a {to_email}: {e}")

# --- Modelos de Datos ---
class PetUpdate(BaseModel):
    reporter_name: str
    reporter_email: str
    description: str
    location_lat: float
    location_lng: float
    image_url: str
    timestamp: str

class PetReportInput(BaseModel):
    reporter_name: str
    reporter_email: str
    pet_type: str
    description: str
    location_lat: float
    location_lng: float
    image_url: str
    report_type: str  # 'lost' o 'found'
    linked_report_id: Optional[str] = None
    # Vector de características de la foto, calculado en el navegador (MobileNet).
    embedding: Optional[List[float]] = Field(None, min_length=16, max_length=4096)

class PetReportPublic(BaseModel):
    """Lo que ve el frontend. No incluye el vector de la foto."""
    id: str
    reporter_name: str
    reporter_email: str
    pet_type: str
    description: str
    location_lat: float
    location_lng: float
    image_url: str
    status: str = "Perdida"
    updates: List[PetUpdate] = []
    created_at: Optional[str] = None
    # Solo se calcula en búsquedas por cercanía; no se guarda en la base.
    distance_km: Optional[float] = None


class PetReportComplete(PetReportPublic):
    """Reporte tal como se guarda. El vector y el dueño no se envían en los listados."""
    embedding: Optional[List[float]] = None
    # uid de Firebase Auth de quien creó el reporte.
    owner_uid: Optional[str] = None


CAMPOS_PRIVADOS = {"embedding", "owner_uid"}


def a_publico(report: PetReportComplete) -> PetReportPublic:
    return PetReportPublic(**report.model_dump(exclude=CAMPOS_PRIVADOS))


class PushToken(BaseModel):
    # Token de Firebase Cloud Messaging del dispositivo.
    token: str = Field(..., min_length=10, max_length=4096)


class StatusUpdate(BaseModel):
    # Por ahora el dueño solo puede cerrar su reporte.
    status: Literal["Resuelta"]


class MatchRequest(BaseModel):
    embedding: List[float] = Field(..., min_length=16, max_length=4096)
    pet_type: Optional[str] = None
    near_lat: Optional[float] = Field(None, ge=-90, le=90)
    near_lng: Optional[float] = Field(None, ge=-180, le=180)
    radius_km: float = Field(5, gt=0, le=50)
    limit: int = Field(5, ge=1, le=20)


class MatchCandidate(BaseModel):
    report: PetReportPublic
    similarity: float  # Porcentaje de 0 a 100

# --- Almacenamiento (memoria o Firestore, según REPORTS_STORE) ---
repo = build_repository()
tokens_push = build_token_store()


def notificar_avistamiento(owner_uid, report_id, quien_lo_vio):
    """Avisa por push al dueño del reporte. Si falla, el avistamiento ya quedó guardado."""
    if not owner_uid:
        return
    tokens = tokens_push.listar(owner_uid)
    if not tokens:
        return
    try:
        invalidos = enviar_push(
            tokens,
            "¡Posible avistamiento de tu mascota!",
            f"{quien_lo_vio} reportó que vio a tu mascota. Revisá los detalles en PetAlert.",
            {"report_id": report_id},
        )
    except Exception as error:
        print(f"Error enviando notificación push: {error}")
        return
    for token in invalidos:
        tokens_push.borrar_token(token)

@app.get("/")
def health_check():
    return {"status": "ok"}

@app.post("/api/reports")
def create_report(report: PetReportInput, background_tasks: BackgroundTasks, usuario: dict = Depends(usuario_actual)):
    map_link = f"https://www.google.com/maps?q={report.location_lat},{report.location_lng}"
    
    if report.report_type == 'lost':
        new_report = PetReportComplete(
            id=str(uuid.uuid4()),
            reporter_name=report.reporter_name,
            reporter_email=report.reporter_email,
            pet_type=report.pet_type,
            description=report.description,
            location_lat=report.location_lat,
            location_lng=report.location_lng,
            image_url=report.image_url,
            status="Perdida",
            updates=[],
            embedding=report.embedding,
            owner_uid=usuario["uid"],
        )
        repo.add(new_report)
        
        # Correo Confirmación Original
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h2 style="color: #4f46e5;">Registro de Mascota Perdida Confirmado</h2>
            <p>Hola <b>{report.reporter_name}</b>, hemos guardado tu reporte en PetAlert.</p>
            <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px;">
                <p><b>Descripción:</b> {report.description}</p>
                <p><b>Ubicación:</b> <a href="{map_link}" style="color: #4f46e5;">Ver en Google Maps</a></p>
            </div>
            <img src="{report.image_url}" alt="Mascota Perdida" style="max-width: 100%; border-radius: 8px; margin-top: 10px;" />
            <p>Te notificaremos si alguien reporta un posible hallazgo.</p>
        </div>
        """
        background_tasks.add_task(send_email, report.reporter_email, "Confirmación: Reporte de Mascota Perdida", html_content)
        return {"status": "success", "message": "Mascota registrada correctamente."}

    elif report.report_type == 'found' and report.linked_report_id:
        lost_report = repo.get(report.linked_report_id)
        if not lost_report:
            raise HTTPException(status_code=404, detail="El reporte original no existe.")
            
        # Añadir al histórico (updates) y cambiar el estado
        new_update = PetUpdate(
            reporter_name=report.reporter_name,
            reporter_email=report.reporter_email,
            description=report.description,
            location_lat=report.location_lat,
            location_lng=report.location_lng,
            image_url=report.image_url,
            timestamp=datetime.now().strftime("%d/%m/%Y %H:%M")
        )
        lost_report.updates.append(new_update)
        lost_report.status = "En Evaluación"
        repo.save(lost_report)
        
        # Correo Actualización al dueño
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h2 style="color: #f59e0b;">¡Hay un posible avistamiento de tu mascota!</h2>
            <p>Hola <b>{lost_report.reporter_name}</b>, alguien ha reportado información nueva que podría coincidir con tu mascota perdida.</p>
            
            <div style="background-color: #fffbeb; padding: 15px; border-radius: 8px; border: 1px solid #fde68a;">
                <h3 style="margin-top: 0; color: #b45309;">Datos del Avistamiento:</h3>
                <p><b>Reportado por:</b> {report.reporter_name}</p>
                <p><b>Correo de Contacto:</b> <a href="mailto:{report.reporter_email}">{report.reporter_email}</a></p>
                <p><b>Observaciones:</b> {report.description}</p>
                <p><b>Ubicación del avistamiento:</b> <a href="{map_link}" style="color: #f59e0b;">Ver en Google Maps</a></p>
            </div>
            
            <p>Fotografía tomada durante el avistamiento:</p>
            <img src="{report.image_url}" alt="Posible Mascota" style="max-width: 100%; border-radius: 8px; margin-top: 10px;" />
            <p>Tu reporte ha cambiado a estado "En Evaluación" en el sistema.</p>
        </div>
        """
        background_tasks.add_task(send_email, lost_report.reporter_email, "¡Posible avistamiento de tu mascota!", html_content)
        background_tasks.add_task(notificar_avistamiento, lost_report.owner_uid, lost_report.id, report.reporter_name)
        return {"status": "success", "message": "Avistamiento registrado. El dueño ha sido notificado."}

    return {"status": "error", "message": "Datos inválidos"}

@app.get("/api/reports", response_model=List[PetReportPublic])
def get_reports(
    response: Response,
    pet_type: Optional[str] = None,
    status: Optional[str] = None,
    days: Optional[int] = Query(None, ge=1),
    limit: Optional[int] = Query(None, ge=1, le=100),
    offset: int = Query(0, ge=0),
    near_lat: Optional[float] = Query(None, ge=-90, le=90),
    near_lng: Optional[float] = Query(None, ge=-180, le=180),
    radius_km: float = Query(5, gt=0, le=50),
):
    if (near_lat is None) != (near_lng is None):
        raise HTTPException(status_code=422, detail="Para buscar por cercanía hay que enviar near_lat y near_lng.")
    near = (near_lat, near_lng, radius_km) if near_lat is not None else None

    pagina, total = filtrar_y_paginar(
        repo.list_newest_first(),
        pet_type=pet_type, status=status, days=days, limit=limit, offset=offset, near=near,
    )
    response.headers["X-Total-Count"] = str(total)
    return [a_publico(r) for r in pagina]


@app.post("/api/matches", response_model=List[MatchCandidate])
def find_matches(pedido: MatchRequest):
    """Reportes de mascotas perdidas que más se parecen a la foto, con su porcentaje."""
    if (pedido.near_lat is None) != (pedido.near_lng is None):
        raise HTTPException(status_code=422, detail="Para buscar por cercanía hay que enviar near_lat y near_lng.")
    near = (pedido.near_lat, pedido.near_lng, pedido.radius_km) if pedido.near_lat is not None else None

    try:
        candidatos = buscar_parecidos(
            pedido.embedding, repo.list_newest_first(),
            limit=pedido.limit, pet_type=pedido.pet_type, near=near,
        )
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))

    return [MatchCandidate(report=a_publico(r), similarity=s) for r, s in candidatos]


@app.get("/api/my-reports", response_model=List[PetReportPublic])
def my_reports(usuario: dict = Depends(usuario_actual)):
    """Reportes creados por el usuario que inició sesión, del más reciente al más antiguo."""
    return [a_publico(r) for r in repo.list_newest_first() if r.owner_uid == usuario["uid"]]


@app.patch("/api/reports/{report_id}/status", response_model=PetReportPublic)
def update_report_status(report_id: str, cambio: StatusUpdate, usuario: dict = Depends(usuario_actual)):
    """El dueño del reporte lo marca como Resuelta cuando encuentra a su mascota."""
    reporte = repo.get(report_id)
    if reporte is None:
        raise HTTPException(status_code=404, detail="El reporte no existe.")
    if reporte.owner_uid != usuario["uid"]:
        raise HTTPException(status_code=403, detail="Solo quien creó el reporte puede cambiar su estado.")

    reporte.status = cambio.status
    repo.save(reporte)
    return a_publico(reporte)


@app.post("/api/notifications/token", status_code=204)
def register_push_token(datos: PushToken, usuario: dict = Depends(usuario_actual)):
    """Registra este dispositivo para recibir avisos de avistamientos."""
    tokens_push.guardar(usuario["uid"], datos.token)


@app.post("/api/notifications/unregister", status_code=204)
def unregister_push_token(datos: PushToken, usuario: dict = Depends(usuario_actual)):
    """Deja de enviar avisos a este dispositivo (por ejemplo, al cerrar sesión)."""
    tokens_push.borrar(usuario["uid"], datos.token)
