"""Tests de la búsqueda por cercanía (S2): reportes dentro de un radio en km."""
import pytest
from fastapi.testclient import TestClient

import main
from main import PetReportComplete, app
from services.reports_filters import distancia_km, filtrar_y_paginar
from services.reports_repository import InMemoryReportRepository

# Punto de referencia: Popayán (centro del mapa por defecto del frontend).
CENTRO = (2.4448, -76.6147)


def reporte_en(id, lat, lng, pet_type="dog"):
    return PetReportComplete(
        id=id, reporter_name="Ana", reporter_email="ana@example.com", pet_type=pet_type,
        description="d", location_lat=lat, location_lng=lng, image_url="x",
    )


# Desplazamientos hacia el norte: 0.009 grados de latitud son ~1 km.
CERCA = reporte_en("cerca", CENTRO[0] + 0.009, CENTRO[1])       # ~1 km
BORDE = reporte_en("borde", CENTRO[0] + 0.0441, CENTRO[1])      # ~4.9 km
LEJOS = reporte_en("lejos", CENTRO[0] + 0.09, CENTRO[1])        # ~10 km


def ids(reportes):
    return [r.id for r in reportes]


# --- distancia_km ---

def test_distancia_entre_el_mismo_punto_es_cero():
    assert distancia_km(*CENTRO, *CENTRO) == 0


def test_distancia_de_un_kilometro_aproximado():
    assert distancia_km(*CENTRO, CENTRO[0] + 0.009, CENTRO[1]) == pytest.approx(1.0, abs=0.01)


def test_distancia_entre_bogota_y_medellin():
    # Referencia conocida: ~240 km en línea recta.
    assert distancia_km(4.7110, -74.0721, 6.2442, -75.5812) == pytest.approx(240, abs=5)


# --- filtrar_y_paginar con cercanía ---

def test_cercania_deja_solo_los_reportes_dentro_del_radio():
    pagina, total = filtrar_y_paginar([CERCA, BORDE, LEJOS], near=(*CENTRO, 5))

    assert ids(pagina) == ["cerca", "borde"]
    assert total == 2


def test_cercania_agrega_la_distancia_redondeada_a_cada_reporte():
    pagina, _ = filtrar_y_paginar([CERCA], near=(*CENTRO, 5))

    assert pagina[0].distance_km == pytest.approx(1.0, abs=0.01)


def test_cercania_no_modifica_los_reportes_guardados():
    filtrar_y_paginar([CERCA], near=(*CENTRO, 5))

    assert CERCA.distance_km is None


def test_cercania_mantiene_el_orden_recibido():
    pagina, _ = filtrar_y_paginar([BORDE, CERCA], near=(*CENTRO, 5))

    assert ids(pagina) == ["borde", "cerca"]


def test_cercania_se_combina_con_otros_filtros_y_la_paginacion():
    gato_cerca = reporte_en("gato", CENTRO[0] + 0.001, CENTRO[1], pet_type="cat")

    pagina, total = filtrar_y_paginar([CERCA, gato_cerca, LEJOS], pet_type="dog", near=(*CENTRO, 5), limit=1)

    assert ids(pagina) == ["cerca"]
    assert total == 1


def test_sin_cercania_la_distancia_queda_vacia():
    pagina, _ = filtrar_y_paginar([CERCA])

    assert pagina[0].distance_km is None


# --- Endpoint ---

@pytest.fixture
def client(monkeypatch):
    repo = InMemoryReportRepository()
    repo.reports.extend([LEJOS, BORDE, CERCA])
    monkeypatch.setattr(main, "repo", repo)
    return TestClient(app)


def test_endpoint_filtra_por_cercania_con_radio_por_defecto_de_5_km(client):
    respuesta = client.get("/api/reports", params={"near_lat": CENTRO[0], "near_lng": CENTRO[1]})

    assert respuesta.status_code == 200
    assert [r["id"] for r in respuesta.json()] == ["cerca", "borde"]
    assert respuesta.headers["X-Total-Count"] == "2"
    assert respuesta.json()[0]["distance_km"] == pytest.approx(1.0, abs=0.01)


def test_endpoint_acepta_un_radio_mayor(client):
    params = {"near_lat": CENTRO[0], "near_lng": CENTRO[1], "radius_km": 20}

    assert client.get("/api/reports", params=params).headers["X-Total-Count"] == "3"


@pytest.mark.parametrize("params", [
    {"near_lat": 2.44},
    {"near_lng": -76.61},
    {"near_lat": 91, "near_lng": 0},
    {"near_lat": 0, "near_lng": 181},
    {"near_lat": 0, "near_lng": 0, "radius_km": 0},
    {"near_lat": 0, "near_lng": 0, "radius_km": 51},
])
def test_endpoint_rechaza_cercania_invalida_con_422(client, params):
    assert client.get("/api/reports", params=params).status_code == 422
