"""Filtros y paginación del listado de reportes.

Funciona sobre cualquier lista de reportes, venga de memoria o de Firestore.
"""
from datetime import datetime, timedelta, timezone


def _fecha(texto: str) -> datetime:
    fecha = datetime.fromisoformat(texto)
    return fecha if fecha.tzinfo else fecha.replace(tzinfo=timezone.utc)


def filtrar_y_paginar(reports, pet_type=None, status=None, days=None, limit=None, offset=0, ahora=None):
    """Devuelve (página, total). El total cuenta los reportes ya filtrados, antes de paginar."""
    resultado = list(reports)

    if pet_type:
        resultado = [r for r in resultado if r.pet_type.casefold() == pet_type.casefold()]

    if status:
        resultado = [r for r in resultado if r.status.casefold() == status.casefold()]

    if days is not None:
        desde = (ahora or datetime.now(timezone.utc)) - timedelta(days=days)
        resultado = [r for r in resultado if r.created_at and _fecha(r.created_at) >= desde]

    total = len(resultado)
    fin = None if limit is None else offset + limit
    return resultado[offset:fin], total
