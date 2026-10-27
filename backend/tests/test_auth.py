"""Tests de cuentas (S1): crear reportes con sesión, "Mis reportes" y marcar como Resuelta."""
import pytest
from fastapi.testclient import TestClient

import main
from main import PetReportComplete, app
from services import auth
from services.auth import usuario_actual
from services.reports_repository import InMemoryReportRepository

ANA = {"uid": "ana", "email": "ana@example.com"}
LUIS = {"uid": "luis", "email": "luis@example.com"}


def reporte(id, owner_uid=None, status="Perdida", embedding=None):
    return PetReportComplete(
        id=id, reporter_name="Ana", reporter_email="ana@example.com", pet_type="dog",
        description="d", location_lat=2.4448, location_lng=-76.6147, image_url="x",
        status=status, owner_uid=owner_uid, embedding=embedding,
    )


def datos_reporte(**cambios):
    datos = {
        "reporter_name": "Ana", "reporter_email": "ana@example.com", "pet_type": "dog",
        "description": "d", "location_lat": 2.4448, "location_lng": -76.6147,
        "image_url": "x", "report_type": "lost",
    }
    datos.update(cambios)
    return datos


@pytest.fixture
def repositorio(monkeypatch):
    repo = InMemoryReportRepository()
    monkeypatch.setattr(main, "repo", repo)
    monkeypatch.setattr(main, "send_email", lambda *a, **k: None)
    return repo


@pytest.fixture
def client(repositorio):
    return TestClient(app)


@pytest.fixture
def sin_sesion():
    """Quita el usuario de prueba: la petición pasa por la verificación real del token."""
    app.dependency_overrides.pop(usuario_actual, None)


@pytest.fixture
def tokens(monkeypatch, sin_sesion):
    """Reemplaza la verificación de Firebase con tokens conocidos."""
    validos = {"token-ana": ANA, "token-luis": LUIS}

    def verificar(token):
        if token not in validos:
            raise ValueError("token inválido")
        return validos[token]

    monkeypatch.setattr(auth, "verificar_token_firebase", verificar)


def como(usuario):
    app.dependency_overrides[usuario_actual] = lambda: usuario


def con_token(token):
    return {"Authorization": f"Bearer {token}"}


# --- Verificación del token ---

def test_crear_reporte_sin_sesion_responde_401(client, sin_sesion):
    respuesta = client.post("/api/reports", json=datos_reporte())

    assert respuesta.status_code == 401
    assert respuesta.json()["detail"] == "Iniciá sesión para continuar."


def test_header_sin_formato_bearer_responde_401(client, tokens):
    respuesta = client.post("/api/reports", json=datos_reporte(), headers={"Authorization": "token-ana"})

    assert respuesta.status_code == 401


def test_token_invalido_responde_401(client, tokens):
    respuesta = client.post("/api/reports", json=datos_reporte(), headers=con_token("falso"))

    assert respuesta.status_code == 401
    assert respuesta.json()["detail"] == "La sesión no es válida o expiró. Iniciá sesión de nuevo."


def test_token_valido_guarda_el_duenio_del_reporte(client, tokens, repositorio):
    respuesta = client.post("/api/reports", json=datos_reporte(), headers=con_token("token-ana"))

    assert respuesta.status_code == 200
    assert repositorio.reports[0].owner_uid == "ana"


def test_avistamiento_de_otro_usuario_esta_permitido(client, tokens, repositorio):
    repositorio.reports.append(reporte("de-ana", owner_uid="ana"))

    respuesta = client.post(
        "/api/reports",
        json=datos_reporte(report_type="found", linked_report_id="de-ana"),
        headers=con_token("token-luis"),
    )

    assert respuesta.status_code == 200
    assert repositorio.reports[0].status == "En Evaluación"


def test_listado_publico_no_requiere_sesion_ni_muestra_el_duenio(client, sin_sesion, repositorio):
    repositorio.reports.append(reporte("de-ana", owner_uid="ana"))

    respuesta = client.get("/api/reports")

    assert respuesta.status_code == 200
    assert "owner_uid" not in respuesta.json()[0]


# --- Mis reportes ---

def test_mis_reportes_requiere_sesion(client, sin_sesion):
    assert client.get("/api/my-reports").status_code == 401


def test_mis_reportes_devuelve_solo_los_del_usuario_mas_recientes_primero(client, repositorio):
    repositorio.reports.extend([
        reporte("ana-1", owner_uid="ana"),
        reporte("luis-1", owner_uid="luis"),
        reporte("ana-2", owner_uid="ana"),
        reporte("sin-duenio"),
    ])
    como(ANA)

    respuesta = client.get("/api/my-reports")

    assert [r["id"] for r in respuesta.json()] == ["ana-2", "ana-1"]
    assert "owner_uid" not in respuesta.json()[0]


# --- Marcar como Resuelta ---

def test_el_duenio_marca_su_reporte_como_resuelta(client, repositorio):
    repositorio.reports.append(reporte("de-ana", owner_uid="ana"))
    como(ANA)

    respuesta = client.patch("/api/reports/de-ana/status", json={"status": "Resuelta"})

    assert respuesta.status_code == 200
    assert respuesta.json()["status"] == "Resuelta"
    assert repositorio.reports[0].status == "Resuelta"


def test_otro_usuario_no_puede_cambiar_el_estado(client, repositorio):
    repositorio.reports.append(reporte("de-ana", owner_uid="ana"))
    como(LUIS)

    respuesta = client.patch("/api/reports/de-ana/status", json={"status": "Resuelta"})

    assert respuesta.status_code == 403
    assert respuesta.json()["detail"] == "Solo quien creó el reporte puede cambiar su estado."
    assert repositorio.reports[0].status == "Perdida"


def test_cambiar_estado_de_un_reporte_inexistente_responde_404(client, repositorio):
    assert client.patch("/api/reports/no-existe/status", json={"status": "Resuelta"}).status_code == 404


@pytest.mark.parametrize("estado", ["Perdida", "En Evaluación", "otro", ""])
def test_solo_se_permite_marcar_como_resuelta(client, repositorio, estado):
    repositorio.reports.append(reporte("de-prueba", owner_uid="usuario-prueba"))

    respuesta = client.patch("/api/reports/de-prueba/status", json={"status": estado})

    assert respuesta.status_code == 422


def test_cambiar_estado_sin_sesion_responde_401(client, sin_sesion, repositorio):
    repositorio.reports.append(reporte("de-ana", owner_uid="ana"))

    assert client.patch("/api/reports/de-ana/status", json={"status": "Resuelta"}).status_code == 401


def test_reporte_resuelto_deja_de_aparecer_en_el_match(client, repositorio):
    vector = [1.0] + [0.0] * 15
    repositorio.reports.append(reporte("de-ana", owner_uid="ana", embedding=vector))
    como(ANA)

    antes = client.post("/api/matches", json={"embedding": vector}).json()
    client.patch("/api/reports/de-ana/status", json={"status": "Resuelta"})
    despues = client.post("/api/matches", json={"embedding": vector}).json()

    assert [c["report"]["id"] for c in antes] == ["de-ana"]
    assert despues == []
