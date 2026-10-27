"""Notificaciones push con Firebase Cloud Messaging (FCM).

Cada dispositivo del usuario registra su token de FCM. Cuando alguien reporta
un avistamiento, se avisa al dueño del reporte en todos sus dispositivos.
"""
import hashlib
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import exceptions as firebase_exceptions
from firebase_admin import firestore, messaging
from google.cloud.firestore_v1.base_query import FieldFilter

from services import reports_repository
from services.reports_repository import construir_credenciales

COLECCION = "push_tokens"

# Respuestas de FCM que indican que el token ya no sirve (app desinstalada o token mal formado).
ERRORES_DE_TOKEN_INVALIDO = (messaging.UnregisteredError, firebase_exceptions.InvalidArgumentError)


def _app_firebase():
    if not firebase_admin._apps:
        firebase_admin.initialize_app(construir_credenciales())


class InMemoryTokenStore:
    def __init__(self):
        # Un token pertenece a un solo usuario: el último que lo registró.
        self.tokens = {}

    def guardar(self, uid, token):
        self.tokens[token] = uid

    def listar(self, uid):
        return [token for token, duenio in self.tokens.items() if duenio == uid]

    def borrar(self, uid, token):
        if self.tokens.get(token) == uid:
            del self.tokens[token]

    def borrar_token(self, token):
        self.tokens.pop(token, None)


class FirestoreTokenStore:
    def __init__(self, db=None):
        if db is None:
            _app_firebase()
            db = firestore.client()
        self.coleccion = db.collection(COLECCION)

    @staticmethod
    def _id(token):
        # Los tokens son largos; el hash da un ID de documento corto y estable.
        return hashlib.sha256(token.encode()).hexdigest()

    def guardar(self, uid, token):
        self.coleccion.document(self._id(token)).set({
            "uid": uid,
            "token": token,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

    def listar(self, uid):
        consulta = self.coleccion.where(filter=FieldFilter("uid", "==", uid))
        return [doc.to_dict()["token"] for doc in consulta.stream()]

    def borrar(self, uid, token):
        referencia = self.coleccion.document(self._id(token))
        snapshot = referencia.get()
        if snapshot.exists and snapshot.to_dict().get("uid") == uid:
            referencia.delete()

    def borrar_token(self, token):
        self.coleccion.document(self._id(token)).delete()


def build_token_store():
    if reports_repository.usa_firestore():
        return FirestoreTokenStore()
    return InMemoryTokenStore()


def enviar_push(tokens, titulo, cuerpo, datos):
    """Envía la notificación a varios dispositivos. Devuelve los tokens que FCM rechazó."""
    _app_firebase()
    # firebase-admin 7.x marca `tokens` como obsoleto y sugiere `fids`, pero los fids
    # son Firebase Installation IDs: el SDK web (getToken) entrega tokens de registro.
    # Cambiarlo haría que los avisos no lleguen. Se mantiene `tokens`.
    mensaje = messaging.MulticastMessage(
        tokens=list(tokens),
        notification=messaging.Notification(title=titulo, body=cuerpo),
        data={clave: str(valor) for clave, valor in datos.items()},
    )
    respuesta = messaging.send_each_for_multicast(mensaje)
    return [
        token
        for token, resultado in zip(tokens, respuesta.responses)
        if not resultado.success and isinstance(resultado.exception, ERRORES_DE_TOKEN_INVALIDO)
    ]
