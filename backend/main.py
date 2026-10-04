from fastapi import FastAPI, HTTPException, Body, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import uuid
import smtplib
from email.message import EmailMessage
from datetime import datetime

# --- Configuración Inicial ---
app = FastAPI(title="SmartCity Pets API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Credenciales SMTP ---
SMTP_USER = "albertreyes2812@gmail.com"
SMTP_PASS = "yrpd payd iomo auzf"

def send_email(to_email: str, subject: str, html_content: str):
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

class PetReportComplete(BaseModel):
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

# --- Base de Datos en Memoria ---
reports_db: List[PetReportComplete] = []

@app.get("/")
def health_check():
    return {"status": "ok"}

@app.post("/api/reports")
def create_report(report: PetReportInput, background_tasks: BackgroundTasks):
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
            updates=[]
        )
        reports_db.append(new_report)
        
        # Correo Confirmación Original
        html_content = f"""
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
            <h2 style="color: #4f46e5;">Registro de Mascota Perdida Confirmado</h2>
            <p>Hola <b>{report.reporter_name}</b>, hemos guardado tu reporte.</p>
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
        lost_report = next((r for r in reports_db if r.id == report.linked_report_id), None)
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
        return {"status": "success", "message": "Avistamiento registrado. El dueño ha sido notificado."}

    return {"status": "error", "message": "Datos inválidos"}

@app.get("/api/reports", response_model=List[PetReportComplete])
def get_reports():
    return list(reversed(reports_db))
