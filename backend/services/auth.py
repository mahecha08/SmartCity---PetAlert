"""Autenticación con Firebase Auth.

El frontend inicia sesión con Firebase (Google o correo y contraseña) y envía el
ID token en el header Authorization: Bearer <token>. Aquí se verifica ese token.
"""
from typing import Optional

import firebase_admin
from fastapi import Header, HTTPException
from firebase_admin import auth as firebase_auth

from services.reports_repository import construir_credenciales

# Errores que significan "token inválido, vencido o revocado". Cualquier otro error
# (por ejemplo, sin conexión para descargar los certificados de Google) es un fallo
# del servidor y no debe disfrazarse de sesión inválida.
ERRORES_DE_TOKEN = (
    ValueError,
    firebase_auth.InvalidIdTokenError,
    firebase_auth.ExpiredIdTokenError,
    firebase_auth.RevokedIdTokenError,
    firebase_auth.UserDisabledError,
)


def verificar_token_firebase(token: str) -> dict:
    if not firebase_admin._apps:
        firebase_admin.initialize_app(construir_credenciales())
    return firebase_auth.verify_id_token(token)


def usuario_actual(authorization: Optional[str] = Header(None)) -> dict:
    """Dependencia de FastAPI: devuelve {"uid", "email"} o responde 401."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Iniciá sesión para continuar.")

    token = authorization.removeprefix("Bearer ").strip()
    try:
        datos = verificar_token_firebase(token)
    except ERRORES_DE_TOKEN:
        raise HTTPException(status_code=401, detail="La sesión no es válida o expiró. Iniciá sesión de nuevo.")

    return {"uid": datos["uid"], "email": datos.get("email")}
