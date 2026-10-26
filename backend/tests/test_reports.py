"""Tests de caracterización de la API de reportes.

Fijan el comportamiento ACTUAL de los endpoints. Usan un repositorio en
memoria, así que nunca tocan Firestore. Si cambia el comportamiento a
propósito, actualizá el test junto con el cambio.
"""
import pytest
from fastapi.testclient import TestClient

import main
from main import app
from services.reports_repository import InMemoryReportRepository


@pytest.fixture(autouse=True)
def repositorio_en_memoria(monkeypatch):
    repo = InMemoryReportRepository()
    monkeypatch.setattr(main, "repo", repo)
    return repo


@pytest.fixture
def correos(monkeypatch):
    """Captura los correos en lugar de enviarlos por SMTP."""
    enviados = []

    def falso_envio(to_email, subject, html_content):
        enviados.append({"to": to_email, "subject": subject})

    monkeypatch.setattr(main, "send_email", falso_envio)
    return enviados


@pytest.fixture
def client():
    return TestClient(app)


def reporte_perdido(**cambios):
    datos = {
        "reporter_name": "Ana",
        "reporter_email": "ana@example.com",
        "pet_type": "Perro",
        "description": "Labrador café, collar rojo",
        "location_lat": 4.711,
        "location_lng": -74.072,
        "image_url": "data:image/jpeg;base64,AAAA",
        "report_type": "lost",
    }
    datos.update(cambios)
    return datos


def reporte_avistamiento(id_perdido, **cambios):
    datos = reporte_perdido(
        reporter_name="Luis",
        reporter_email="luis@example.com",
        description="Lo vi cerca del parque",
        report_type="found",
        linked_report_id=id_perdido,
    )
    datos.update(cambios)
    return datos


def test_health_check_responde_ok(client):
    respuesta = client.get("/")

    assert respuesta.status_code == 200
    assert respuesta.json() == {"status": "ok"}


def test_reporte_perdido_se_guarda_con_estado_perdida(client, correos, repositorio_en_memoria):
    respuesta = client.post("/api/reports", json=reporte_perdido())

    assert respuesta.status_code == 200
    assert respuesta.json() == {"status": "success", "message": "Mascota registrada correctamente."}
    guardados = repositorio_en_memoria.reports
    assert len(guardados) == 1
    assert guardados[0].status == "Perdida"
    assert guardados[0].updates == []
    assert guardados[0].pet_type == "Perro"


def test_reporte_perdido_envia_correo_de_confirmacion_al_dueno(client, correos):
    client.post("/api/reports", json=reporte_perdido())

    assert len(correos) == 1
    assert correos[0]["to"] == "ana@example.com"
    assert correos[0]["subject"] == "Confirmación: Reporte de Mascota Perdida"


def test_avistamiento_de_reporte_existente_cambia_estado_a_en_evaluacion(client, correos, repositorio_en_memoria):
    client.post("/api/reports", json=reporte_perdido())
    id_perdido = repositorio_en_memoria.reports[0].id

    respuesta = client.post("/api/reports", json=reporte_avistamiento(id_perdido))

    assert respuesta.status_code == 200
    assert respuesta.json()["message"] == "Avistamiento registrado. El dueño ha sido notificado."
    original = repositorio_en_memoria.reports[0]
    assert original.status == "En Evaluación"
    assert len(original.updates) == 1
    assert original.updates[0].reporter_name == "Luis"
    assert original.updates[0].description == "Lo vi cerca del parque"


def test_avistamiento_notifica_al_dueno_original(client, correos, repositorio_en_memoria):
    client.post("/api/reports", json=reporte_perdido())
    id_perdido = repositorio_en_memoria.reports[0].id
    correos.clear()

    client.post("/api/reports", json=reporte_avistamiento(id_perdido))

    assert len(correos) == 1
    assert correos[0]["to"] == "ana@example.com"
    assert correos[0]["subject"] == "¡Posible avistamiento de tu mascota!"


def test_avistamiento_con_id_inexistente_responde_404(client, correos):
    respuesta = client.post("/api/reports", json=reporte_avistamiento("no-existe"))

    assert respuesta.status_code == 404
    assert respuesta.json() == {"detail": "El reporte original no existe."}


def test_tipo_de_reporte_invalido_responde_200_con_error(client, correos, repositorio_en_memoria):
    # Deuda conocida: debería ser un 4xx. Se fija el comportamiento actual.
    respuesta = client.post("/api/reports", json=reporte_perdido(report_type="otro"))

    assert respuesta.status_code == 200
    assert respuesta.json() == {"status": "error", "message": "Datos inválidos"}
    assert repositorio_en_memoria.reports == []


def test_hallazgo_sin_id_vinculado_responde_datos_invalidos(client, correos):
    datos = reporte_avistamiento(None)
    respuesta = client.post("/api/reports", json=datos)

    assert respuesta.json() == {"status": "error", "message": "Datos inválidos"}


def test_campo_obligatorio_faltante_responde_422(client, correos):
    datos = reporte_perdido()
    del datos["pet_type"]

    respuesta = client.post("/api/reports", json=datos)

    assert respuesta.status_code == 422


def test_coordenada_no_numerica_responde_422(client, correos):
    respuesta = client.post("/api/reports", json=reporte_perdido(location_lat="cerca"))

    assert respuesta.status_code == 422


def test_listado_devuelve_los_reportes_mas_recientes_primero(client, correos):
    client.post("/api/reports", json=reporte_perdido(reporter_name="Primero"))
    client.post("/api/reports", json=reporte_perdido(reporter_name="Segundo"))

    respuesta = client.get("/api/reports")

    nombres = [r["reporter_name"] for r in respuesta.json()]
    assert nombres == ["Segundo", "Primero"]


def test_listado_incluye_el_historial_de_avistamientos(client, correos, repositorio_en_memoria):
    client.post("/api/reports", json=reporte_perdido())
    id_perdido = repositorio_en_memoria.reports[0].id
    client.post("/api/reports", json=reporte_avistamiento(id_perdido))

    reporte = client.get("/api/reports").json()[0]

    assert reporte["status"] == "En Evaluación"
    assert len(reporte["updates"]) == 1
    assert reporte["updates"][0]["reporter_name"] == "Luis"


def test_listado_vacio_devuelve_lista_vacia(client):
    assert client.get("/api/reports").json() == []
