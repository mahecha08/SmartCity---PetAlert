"""Tests del match por similitud (S4): comparar el vector de una foto con los reportes."""
import pytest
from fastapi.testclient import TestClient

import main
from main import PetReportComplete, app
from services.matching import buscar_parecidos, similitud_coseno
from services.reports_repository import InMemoryReportRepository

DIMENSION = 16


def vector(*inicio):
    """Vector de 16 posiciones: los valores dados al principio y ceros después."""
    return list(inicio) + [0.0] * (DIMENSION - len(inicio))


def reporte(id, embedding=None, pet_type="dog", status="Perdida", lat=2.4448, lng=-76.6147):
    return PetReportComplete(
        id=id, reporter_name="Ana", reporter_email="ana@example.com", pet_type=pet_type,
        description="d", location_lat=lat, location_lng=lng, image_url="x",
        status=status, embedding=embedding,
    )


def ids(candidatos):
    return [r.id for r, _ in candidatos]


# --- similitud_coseno ---

def test_vectores_iguales_tienen_similitud_uno():
    assert similitud_coseno(vector(1, 2, 3), vector(1, 2, 3)) == pytest.approx(1.0)


def test_vectores_proporcionales_tienen_similitud_uno():
    assert similitud_coseno(vector(1, 2), vector(2, 4)) == pytest.approx(1.0)


def test_vectores_perpendiculares_tienen_similitud_cero():
    assert similitud_coseno(vector(1, 0), vector(0, 1)) == pytest.approx(0.0)


def test_vector_en_ceros_da_error():
    with pytest.raises(ValueError):
        similitud_coseno(vector(), vector(1))


# --- buscar_parecidos ---

def test_ordena_del_mas_parecido_al_menos_parecido():
    reportes = [reporte("poco", vector(0, 1)), reporte("mucho", vector(1, 0.1)), reporte("medio", vector(1, 1))]

    candidatos = buscar_parecidos(vector(1, 0), reportes)

    assert ids(candidatos) == ["mucho", "medio", "poco"]


def test_devuelve_el_porcentaje_de_similitud():
    candidatos = buscar_parecidos(vector(1, 0), [reporte("igual", vector(3, 0)), reporte("medio", vector(1, 1))])

    assert [s for _, s in candidatos] == [100.0, pytest.approx(70.7, abs=0.1)]


def test_excluye_reportes_sin_vector_con_otra_dimension_o_resueltos():
    reportes = [
        reporte("ok", vector(1)),
        reporte("sin_vector"),
        reporte("otra_dimension", [1.0] * 8),
        reporte("resuelto", vector(1), status="Resuelta"),
    ]

    assert ids(buscar_parecidos(vector(1), reportes)) == ["ok"]


def test_respeta_el_limite():
    reportes = [reporte(str(n), vector(1, n)) for n in range(5)]

    assert len(buscar_parecidos(vector(1), reportes, limit=2)) == 2


def test_filtra_por_tipo_de_mascota():
    reportes = [reporte("perro", vector(1)), reporte("gato", vector(1), pet_type="cat")]

    assert ids(buscar_parecidos(vector(1), reportes, pet_type="CAT")) == ["gato"]


def test_filtra_por_cercania_y_agrega_la_distancia():
    reportes = [reporte("cerca", vector(1), lat=2.4538), reporte("lejos", vector(1), lat=2.5348)]

    candidatos = buscar_parecidos(vector(1), reportes, near=(2.4448, -76.6147, 5))

    assert ids(candidatos) == ["cerca"]
    assert candidatos[0][0].distance_km == pytest.approx(1.0, abs=0.01)


# --- Endpoints ---

@pytest.fixture
def repositorio(monkeypatch):
    repo = InMemoryReportRepository()
    monkeypatch.setattr(main, "repo", repo)
    monkeypatch.setattr(main, "send_email", lambda *a, **k: None)
    return repo


@pytest.fixture
def client(repositorio):
    return TestClient(app)


def datos_reporte(**cambios):
    datos = {
        "reporter_name": "Ana", "reporter_email": "ana@example.com", "pet_type": "dog",
        "description": "d", "location_lat": 2.4448, "location_lng": -76.6147,
        "image_url": "x", "report_type": "lost",
    }
    datos.update(cambios)
    return datos


def test_crear_reporte_guarda_el_vector(client, repositorio):
    client.post("/api/reports", json=datos_reporte(embedding=vector(1, 2)))

    assert repositorio.reports[0].embedding == vector(1, 2)


def test_crear_reporte_sin_vector_sigue_funcionando(client, repositorio):
    respuesta = client.post("/api/reports", json=datos_reporte())

    assert respuesta.status_code == 200
    assert repositorio.reports[0].embedding is None


def test_el_listado_no_incluye_el_vector(client):
    client.post("/api/reports", json=datos_reporte(embedding=vector(1, 2)))

    reporte_listado = client.get("/api/reports").json()[0]

    assert "embedding" not in reporte_listado


def test_endpoint_de_match_devuelve_candidatos_ordenados_sin_vector(client, repositorio):
    repositorio.reports.extend([reporte("medio", vector(1, 1)), reporte("igual", vector(2, 0))])

    respuesta = client.post("/api/matches", json={"embedding": vector(1, 0)})

    assert respuesta.status_code == 200
    cuerpo = respuesta.json()
    assert [c["report"]["id"] for c in cuerpo] == ["igual", "medio"]
    assert cuerpo[0]["similarity"] == 100.0
    assert "embedding" not in cuerpo[0]["report"]


def test_endpoint_de_match_combina_tipo_y_cercania(client, repositorio):
    repositorio.reports.extend([
        reporte("perro_cerca", vector(1), lat=2.4538),
        reporte("gato_cerca", vector(1), pet_type="cat", lat=2.4538),
        reporte("perro_lejos", vector(1), lat=2.5348),
    ])

    respuesta = client.post("/api/matches", json={
        "embedding": vector(1), "pet_type": "dog", "near_lat": 2.4448, "near_lng": -76.6147,
    })

    assert [c["report"]["id"] for c in respuesta.json()] == ["perro_cerca"]
    assert respuesta.json()[0]["report"]["distance_km"] == pytest.approx(1.0, abs=0.01)


@pytest.mark.parametrize("cuerpo", [
    {"embedding": [1.0] * 4},
    {"embedding": [0.0] * DIMENSION},
    {"embedding": vector(1), "near_lat": 2.44},
    {"embedding": vector(1), "limit": 0},
    {"embedding": vector(1), "limit": 21},
    {},
])
def test_endpoint_de_match_rechaza_pedidos_invalidos_con_422(client, cuerpo):
    assert client.post("/api/matches", json=cuerpo).status_code == 422


def test_crear_reporte_con_vector_demasiado_corto_responde_422(client):
    assert client.post("/api/reports", json=datos_reporte(embedding=[1.0] * 4)).status_code == 422
