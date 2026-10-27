"""Tests de la configuración del repositorio y de las credenciales de Firebase."""
import json

import pytest

from services import reports_repository
from services.reports_repository import (
    InMemoryReportRepository,
    build_repository,
    construir_credenciales,
)


class FirestoreFalso:
    """Reemplaza a FirestoreReportRepository para no conectarse a Firebase."""

    def __init__(self):
        pass


@pytest.fixture
def sin_firestore_real(monkeypatch):
    monkeypatch.setattr(reports_repository, "FirestoreReportRepository", FirestoreFalso)
    monkeypatch.delenv("REPORTS_STORE", raising=False)
    monkeypatch.delenv("VERCEL", raising=False)


# --- build_repository ---

def test_por_defecto_usa_memoria(sin_firestore_real):
    assert isinstance(build_repository(), InMemoryReportRepository)


def test_reports_store_firestore_usa_firestore(sin_firestore_real, monkeypatch):
    monkeypatch.setenv("REPORTS_STORE", "firestore")

    assert isinstance(build_repository(), FirestoreFalso)


def test_en_vercel_sin_reports_store_usa_firestore(sin_firestore_real, monkeypatch):
    # En serverless la memoria se pierde entre ejecuciones: nunca debe ser el valor por defecto.
    monkeypatch.setenv("VERCEL", "1")

    assert isinstance(build_repository(), FirestoreFalso)


def test_reports_store_explicito_gana_sobre_vercel(sin_firestore_real, monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("REPORTS_STORE", "memory")

    assert isinstance(build_repository(), InMemoryReportRepository)


# --- construir_credenciales ---

@pytest.fixture
def firebase_falso(monkeypatch):
    llamadas = {}

    def certificado_falso(datos):
        llamadas["certificado"] = datos
        return "CERTIFICADO"

    def por_defecto_falso():
        llamadas["por_defecto"] = True
        return "POR_DEFECTO"

    monkeypatch.setattr(reports_repository.credentials, "Certificate", certificado_falso)
    monkeypatch.setattr(reports_repository.credentials, "ApplicationDefault", por_defecto_falso)
    return llamadas


def test_con_json_en_variable_usa_certificado_con_ese_contenido(firebase_falso):
    contenido = {"type": "service_account", "project_id": "demo"}

    resultado = construir_credenciales({"FIREBASE_CREDENTIALS_JSON": json.dumps(contenido)})

    assert resultado == "CERTIFICADO"
    assert firebase_falso["certificado"] == contenido


def test_sin_variable_usa_las_credenciales_por_defecto(firebase_falso):
    resultado = construir_credenciales({})

    assert resultado == "POR_DEFECTO"
    assert "certificado" not in firebase_falso


def test_json_invalido_da_un_error_claro(firebase_falso):
    with pytest.raises(ValueError, match="FIREBASE_CREDENTIALS_JSON"):
        construir_credenciales({"FIREBASE_CREDENTIALS_JSON": "esto no es json"})
