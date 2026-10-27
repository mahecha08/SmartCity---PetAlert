"""Tests de notificaciones push (S5): registro de dispositivos y aviso al dueño."""
import pytest
from fastapi.testclient import TestClient

import main
from main import PetReportComplete, app
from services.auth import usuario_actual
from services.push import InMemoryTokenStore
from services.reports_repository import InMemoryReportRepository

TOKEN_A = "token-dispositivo-a-1234567890"
TOKEN_B = "token-dispositivo-b-1234567890"


def reporte(id, owner_uid=None):
    return PetReportComplete(
        id=id, reporter_name="Ana", reporter_email="ana@example.com", pet_type="dog",
        description="d", location_lat=2.44, location_lng=-76.61, image_url="x", owner_uid=owner_uid,
    )


def avistamiento(id_perdido):
    return {
        "reporter_name": "Luis", "reporter_email": "luis@example.com", "pet_type": "N/A",
        "description": "Lo vi en el parque", "location_lat": 2.44, "location_lng": -76.61,
        "image_url": "x", "report_type": "found", "linked_report_id": id_perdido,
    }


def como(uid):
    app.dependency_overrides[usuario_actual] = lambda: {"uid": uid, "email": f"{uid}@example.com"}


@pytest.fixture
def tokens(monkeypatch):
    almacen = InMemoryTokenStore()
    monkeypatch.setattr(main, "tokens_push", almacen)
    return almacen


@pytest.fixture
def envios(monkeypatch):
    """Reemplaza el envío real a FCM. Devuelve los tokens marcados como inválidos."""
    registro = {"llamadas": [], "invalidos": []}

    def enviar_falso(tokens, titulo, cuerpo, datos):
        registro["llamadas"].append({"tokens": sorted(tokens), "titulo": titulo, "cuerpo": cuerpo, "datos": datos})
        return list(registro["invalidos"])

    monkeypatch.setattr(main, "enviar_push", enviar_falso)
    return registro


@pytest.fixture
def repositorio(monkeypatch):
    repo = InMemoryReportRepository()
    monkeypatch.setattr(main, "repo", repo)
    monkeypatch.setattr(main, "send_email", lambda *a, **k: None)
    return repo


@pytest.fixture
def client(repositorio, tokens, envios):
    return TestClient(app)


# --- InMemoryTokenStore ---

def test_el_almacen_guarda_varios_dispositivos_por_usuario_sin_duplicar():
    almacen = InMemoryTokenStore()
    almacen.guardar("ana", TOKEN_A)
    almacen.guardar("ana", TOKEN_B)
    almacen.guardar("ana", TOKEN_A)

    assert sorted(almacen.listar("ana")) == [TOKEN_A, TOKEN_B]


def test_un_token_que_cambia_de_usuario_queda_solo_con_el_nuevo():
    # El mismo celular puede usarse con otra cuenta: el aviso va al usuario actual.
    almacen = InMemoryTokenStore()
    almacen.guardar("ana", TOKEN_A)
    almacen.guardar("luis", TOKEN_A)

    assert almacen.listar("ana") == []
    assert almacen.listar("luis") == [TOKEN_A]


# --- Registro y baja de dispositivos ---

def test_registrar_token_requiere_sesion(client):
    app.dependency_overrides.pop(usuario_actual, None)

    assert client.post("/api/notifications/token", json={"token": TOKEN_A}).status_code == 401


def test_registrar_token_lo_asocia_al_usuario(client, tokens):
    como("ana")

    respuesta = client.post("/api/notifications/token", json={"token": TOKEN_A})

    assert respuesta.status_code == 204
    assert tokens.listar("ana") == [TOKEN_A]


@pytest.mark.parametrize("cuerpo", [{"token": ""}, {"token": "corto"}, {"token": "x" * 4097}, {}])
def test_registrar_token_invalido_responde_422(client, cuerpo):
    assert client.post("/api/notifications/token", json=cuerpo).status_code == 422


def test_dar_de_baja_borra_el_token_del_usuario(client, tokens):
    tokens.guardar("ana", TOKEN_A)
    como("ana")

    respuesta = client.post("/api/notifications/unregister", json={"token": TOKEN_A})

    assert respuesta.status_code == 204
    assert tokens.listar("ana") == []


def test_no_se_puede_dar_de_baja_el_token_de_otro_usuario(client, tokens):
    tokens.guardar("ana", TOKEN_A)
    como("luis")

    client.post("/api/notifications/unregister", json={"token": TOKEN_A})

    assert tokens.listar("ana") == [TOKEN_A]


# --- Aviso al dueño cuando hay un avistamiento ---

def test_avistamiento_avisa_al_duenio_en_todos_sus_dispositivos(client, repositorio, tokens, envios):
    repositorio.reports.append(reporte("de-ana", owner_uid="ana"))
    tokens.guardar("ana", TOKEN_A)
    tokens.guardar("ana", TOKEN_B)
    tokens.guardar("luis", "token-de-luis-1234567890")
    como("luis")

    respuesta = client.post("/api/reports", json=avistamiento("de-ana"))

    assert respuesta.status_code == 200
    assert envios["llamadas"] == [{
        "tokens": [TOKEN_A, TOKEN_B],
        "titulo": "¡Posible avistamiento de tu mascota!",
        "cuerpo": "Luis reportó que vio a tu mascota. Revisá los detalles en PetAlert.",
        "datos": {"report_id": "de-ana"},
    }]


def test_sin_dispositivos_registrados_no_se_envia_nada(client, repositorio, envios):
    repositorio.reports.append(reporte("de-ana", owner_uid="ana"))

    client.post("/api/reports", json=avistamiento("de-ana"))

    assert envios["llamadas"] == []


def test_reporte_sin_duenio_no_envia_nada(client, repositorio, tokens, envios):
    repositorio.reports.append(reporte("anonimo"))
    tokens.guardar("ana", TOKEN_A)

    client.post("/api/reports", json=avistamiento("anonimo"))

    assert envios["llamadas"] == []


def test_reportar_mascota_perdida_no_envia_push(client, tokens, envios):
    tokens.guardar("usuario-prueba", TOKEN_A)
    datos = avistamiento(None) | {"report_type": "lost", "linked_report_id": None, "pet_type": "dog"}

    client.post("/api/reports", json=datos)

    assert envios["llamadas"] == []


def test_los_tokens_que_fcm_rechaza_se_borran(client, repositorio, tokens, envios):
    repositorio.reports.append(reporte("de-ana", owner_uid="ana"))
    tokens.guardar("ana", TOKEN_A)
    tokens.guardar("ana", TOKEN_B)
    envios["invalidos"] = [TOKEN_B]

    client.post("/api/reports", json=avistamiento("de-ana"))

    assert tokens.listar("ana") == [TOKEN_A]


def test_si_fcm_falla_el_avistamiento_se_guarda_igual(client, repositorio, tokens, monkeypatch):
    repositorio.reports.append(reporte("de-ana", owner_uid="ana"))
    tokens.guardar("ana", TOKEN_A)

    def fcm_caido(*args):
        raise RuntimeError("FCM no responde")

    monkeypatch.setattr(main, "enviar_push", fcm_caido)

    respuesta = client.post("/api/reports", json=avistamiento("de-ana"))

    assert respuesta.status_code == 200
    assert repositorio.reports[0].status == "En Evaluación"
