"""Tests de filtros y paginación del listado de reportes."""
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import main
from main import PetReportComplete, app
from services.reports_filters import filtrar_y_paginar
from services.reports_repository import InMemoryReportRepository

AHORA = datetime(2026, 10, 27, 12, 0, tzinfo=timezone.utc)


def crear_reporte(id, pet_type="dog", status="Perdida", dias_atras=0):
    fecha = None if dias_atras is None else (AHORA - timedelta(days=dias_atras)).isoformat()
    return PetReportComplete(
        id=id,
        reporter_name="Ana",
        reporter_email="ana@example.com",
        pet_type=pet_type,
        description="descripcion",
        location_lat=4.7,
        location_lng=-74.0,
        image_url="x",
        status=status,
        created_at=fecha,
    )


def ids(reportes):
    return [r.id for r in reportes]


# --- filtrar_y_paginar (lógica pura) ---

def test_sin_filtros_devuelve_todos_y_el_total():
    reportes = [crear_reporte("a"), crear_reporte("b")]

    pagina, total = filtrar_y_paginar(reportes)

    assert ids(pagina) == ["a", "b"]
    assert total == 2


def test_filtra_por_tipo_de_mascota_ignorando_mayusculas():
    reportes = [crear_reporte("a", pet_type="dog"), crear_reporte("b", pet_type="cat")]

    pagina, total = filtrar_y_paginar(reportes, pet_type="DOG")

    assert ids(pagina) == ["a"]
    assert total == 1


def test_filtra_por_estado():
    reportes = [crear_reporte("a", status="Perdida"), crear_reporte("b", status="En Evaluación")]

    pagina, _ = filtrar_y_paginar(reportes, status="en evaluación")

    assert ids(pagina) == ["b"]


def test_filtra_por_ultimos_dias_y_excluye_los_que_no_tienen_fecha():
    reportes = [
        crear_reporte("reciente", dias_atras=2),
        crear_reporte("viejo", dias_atras=30),
        crear_reporte("sin_fecha", dias_atras=None),
    ]

    pagina, total = filtrar_y_paginar(reportes, days=7, ahora=AHORA)

    assert ids(pagina) == ["reciente"]
    assert total == 1


def test_combina_varios_filtros():
    reportes = [
        crear_reporte("a", pet_type="dog", status="Perdida"),
        crear_reporte("b", pet_type="dog", status="En Evaluación"),
        crear_reporte("c", pet_type="cat", status="En Evaluación"),
    ]

    pagina, _ = filtrar_y_paginar(reportes, pet_type="dog", status="En Evaluación")

    assert ids(pagina) == ["b"]


def test_paginacion_corta_la_lista_pero_el_total_es_el_del_conjunto_filtrado():
    reportes = [crear_reporte(str(n)) for n in range(5)]

    pagina, total = filtrar_y_paginar(reportes, limit=2, offset=2)

    assert ids(pagina) == ["2", "3"]
    assert total == 5


def test_offset_mayor_al_total_devuelve_pagina_vacia():
    pagina, total = filtrar_y_paginar([crear_reporte("a")], limit=10, offset=5)

    assert pagina == []
    assert total == 1


# --- Endpoint GET /api/reports ---

@pytest.fixture
def repositorio(monkeypatch):
    repo = InMemoryReportRepository()
    monkeypatch.setattr(main, "repo", repo)
    return repo


@pytest.fixture
def client():
    return TestClient(app)


def test_endpoint_filtra_por_tipo_y_devuelve_el_total_en_un_header(client, repositorio):
    repositorio.reports.extend([
        crear_reporte("a", pet_type="dog"),
        crear_reporte("b", pet_type="cat"),
        crear_reporte("c", pet_type="dog"),
    ])

    respuesta = client.get("/api/reports", params={"pet_type": "dog"})

    assert [r["id"] for r in respuesta.json()] == ["c", "a"]
    assert respuesta.headers["X-Total-Count"] == "2"


def test_endpoint_pagina_con_limit_y_offset(client, repositorio):
    repositorio.reports.extend([crear_reporte(n) for n in ["a", "b", "c", "d"]])

    respuesta = client.get("/api/reports", params={"limit": 2, "offset": 1})

    assert [r["id"] for r in respuesta.json()] == ["c", "b"]
    assert respuesta.headers["X-Total-Count"] == "4"


def test_endpoint_sin_parametros_devuelve_todo_como_antes(client, repositorio):
    repositorio.reports.extend([crear_reporte("a"), crear_reporte("b")])

    respuesta = client.get("/api/reports")

    assert [r["id"] for r in respuesta.json()] == ["b", "a"]


@pytest.mark.parametrize("params", [
    {"limit": 0},
    {"limit": 101},
    {"offset": -1},
    {"days": 0},
])
def test_endpoint_rechaza_parametros_fuera_de_rango_con_422(client, repositorio, params):
    assert client.get("/api/reports", params=params).status_code == 422


def test_los_reportes_nuevos_incluyen_la_fecha_de_creacion(client, repositorio, monkeypatch):
    monkeypatch.setattr(main, "send_email", lambda *a, **k: None)
    datos = {
        "reporter_name": "Ana", "reporter_email": "ana@example.com", "pet_type": "dog",
        "description": "d", "location_lat": 4.7, "location_lng": -74.0,
        "image_url": "x", "report_type": "lost",
    }
    client.post("/api/reports", json=datos)

    reporte = client.get("/api/reports").json()[0]

    assert datetime.fromisoformat(reporte["created_at"]).tzinfo is not None
