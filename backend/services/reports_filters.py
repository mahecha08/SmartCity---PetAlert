"""Filtros y paginación del listado de reportes.

Funciona sobre cualquier lista de reportes, venga de memoria o de Firestore.
"""
import math
from datetime import datetime, timedelta, timezone

RADIO_TIERRA_KM = 6371.0088


def distancia_km(lat1, lng1, lat2, lng2) -> float:
    """Distancia en línea recta sobre la superficie terrestre (fórmula de haversine)."""
    fi1, fi2 = math.radians(lat1), math.radians(lat2)
    d_fi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = math.sin(d_fi / 2) ** 2 + math.cos(fi1) * math.cos(fi2) * math.sin(d_lambda / 2) ** 2
    return 2 * RADIO_TIERRA_KM * math.asin(math.sqrt(a))


def _fecha(texto: str) -> datetime:
    fecha = datetime.fromisoformat(texto)
    return fecha if fecha.tzinfo else fecha.replace(tzinfo=timezone.utc)


def filtrar_y_paginar(reports, pet_type=None, status=None, days=None, limit=None, offset=0, ahora=None, near=None):
    """Devuelve (página, total). El total cuenta los reportes ya filtrados, antes de paginar.

    near es (lat, lng, radio_km). Si se indica, solo quedan los reportes dentro del
    radio, y cada uno se devuelve como copia con distance_km calculada.
    """
    resultado = list(reports)

    if pet_type:
        resultado = [r for r in resultado if r.pet_type.casefold() == pet_type.casefold()]

    if status:
        resultado = [r for r in resultado if r.status.casefold() == status.casefold()]

    if days is not None:
        desde = (ahora or datetime.now(timezone.utc)) - timedelta(days=days)
        resultado = [r for r in resultado if r.created_at and _fecha(r.created_at) >= desde]

    if near is not None:
        lat, lng, radio_km = near
        cercanos = []
        for r in resultado:
            distancia = distancia_km(lat, lng, r.location_lat, r.location_lng)
            if distancia <= radio_km:
                # Copia: no se modifica el reporte guardado en el repositorio.
                cercanos.append(r.model_copy(update={"distance_km": round(distancia, 2)}))
        resultado = cercanos

    total = len(resultado)
    fin = None if limit is None else offset + limit
    return resultado[offset:fin], total
