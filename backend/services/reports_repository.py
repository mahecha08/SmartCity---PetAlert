"""Acceso a los reportes de mascotas.

main.py solo habla con esta interfaz. Hay dos implementaciones:
- InMemoryReportRepository: para tests y desarrollo sin base de datos.
- FirestoreReportRepository: para uso real, guarda en Cloud Firestore.

Se elige con la variable de entorno REPORTS_STORE ("memory" o "firestore").
"""
import json
import os
from datetime import datetime, timezone
from typing import List, Optional

import firebase_admin
from firebase_admin import credentials, firestore

COLLECTION = "reports"
# Campos que se calculan al responder y no deben guardarse en Firestore.
CAMPOS_CALCULADOS = {"distance_km"}


def construir_credenciales(entorno=None):
    """Credenciales de Firebase.

    Si FIREBASE_CREDENTIALS_JSON trae el contenido del .json de la cuenta de
    servicio (caso de Vercel, donde no hay archivos), se usa ese. Si no, se usa
    GOOGLE_APPLICATION_CREDENTIALS, que apunta a un archivo (caso local).
    """
    entorno = os.environ if entorno is None else entorno
    contenido = entorno.get("FIREBASE_CREDENTIALS_JSON")
    if contenido:
        try:
            return credentials.Certificate(json.loads(contenido))
        except json.JSONDecodeError as error:
            raise ValueError("FIREBASE_CREDENTIALS_JSON no contiene un JSON válido.") from error
    return credentials.ApplicationDefault()


class InMemoryReportRepository:
    def __init__(self):
        self.reports = []

    def add(self, report):
        report.created_at = datetime.now(timezone.utc).isoformat()
        self.reports.append(report)

    def get(self, report_id: str):
        return next((r for r in self.reports if r.id == report_id), None)

    def save(self, report):
        # En memoria el objeto ya es la misma referencia; no hace falta guardar.
        return None

    def list_newest_first(self) -> List:
        return list(reversed(self.reports))


class FirestoreReportRepository:
    def __init__(self, db=None):
        if db is None:
            if not firebase_admin._apps:
                firebase_admin.initialize_app(construir_credenciales())
            db = firestore.client()
        self.db = db
        self.collection = db.collection(COLLECTION)

    def add(self, report):
        report.created_at = datetime.now(timezone.utc).isoformat()
        self.collection.document(report.id).set(report.model_dump(exclude=CAMPOS_CALCULADOS))

    def get(self, report_id: str):
        snapshot = self.collection.document(report_id).get()
        if not snapshot.exists:
            return None
        return self._desde_documento(snapshot.to_dict())

    def save(self, report):
        self.collection.document(report.id).set(report.model_dump(exclude=CAMPOS_CALCULADOS), merge=True)

    def list_newest_first(self) -> List:
        consulta = self.collection.order_by("created_at", direction=firestore.Query.DESCENDING)
        return [self._desde_documento(doc.to_dict()) for doc in consulta.stream()]

    @staticmethod
    def _desde_documento(datos: dict):
        # Import local para no depender del modelo desde este módulo al cargar.
        from main import PetReportComplete

        return PetReportComplete(**datos)


def usa_firestore() -> bool:
    """REPORTS_STORE decide. Sin valor, se usa Firestore solo en Vercel."""
    tipo = os.environ.get("REPORTS_STORE")
    if tipo is None and os.environ.get("VERCEL"):
        # En serverless la memoria se pierde entre ejecuciones: allí se usa Firestore por defecto.
        tipo = "firestore"
    return (tipo or "memory").lower() == "firestore"


def build_repository():
    if usa_firestore():
        return FirestoreReportRepository()
    print("REPORTS_STORE no es 'firestore': los reportes se guardan solo en memoria.")
    return InMemoryReportRepository()
