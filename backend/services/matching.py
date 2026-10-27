"""Match por similitud entre la foto de una mascota y los reportes guardados.

El navegador calcula el vector de características de cada foto (MobileNet con
TensorFlow.js). Aquí solo se comparan vectores con similitud coseno.
"""
import math

from services.reports_filters import filtrar_y_paginar

# Los reportes cerrados ya no buscan a su mascota: no son candidatos.
ESTADOS_CERRADOS = {"resuelta"}


def similitud_coseno(a, b) -> float:
    norma_a = math.sqrt(sum(x * x for x in a))
    norma_b = math.sqrt(sum(x * x for x in b))
    if norma_a == 0 or norma_b == 0:
        raise ValueError("No se puede comparar un vector en ceros.")
    return sum(x * y for x, y in zip(a, b)) / (norma_a * norma_b)


def buscar_parecidos(embedding, reports, limit=5, pet_type=None, near=None):
    """Devuelve [(reporte, similitud_en_porcentaje)], del más parecido al menos parecido."""
    if not any(embedding):
        raise ValueError("No se puede comparar un vector en ceros.")

    base, _ = filtrar_y_paginar(reports, pet_type=pet_type, near=near)

    candidatos = []
    for reporte in base:
        if not reporte.embedding or len(reporte.embedding) != len(embedding):
            continue
        if reporte.status.casefold() in ESTADOS_CERRADOS:
            continue
        try:
            similitud = similitud_coseno(embedding, reporte.embedding)
        except ValueError:
            continue
        candidatos.append((reporte, round(max(similitud, 0.0) * 100, 1)))

    candidatos.sort(key=lambda par: par[1], reverse=True)
    return candidatos[:limit]
