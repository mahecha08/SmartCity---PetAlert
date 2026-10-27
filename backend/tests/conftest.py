"""Configuración común de los tests.

Por defecto todos los tests corren con un usuario autenticado de prueba, para no
depender de Firebase. Los tests de autenticación quitan este reemplazo cuando
necesitan probar la verificación real del token.
"""
import pytest

from main import app
from services.auth import usuario_actual

USUARIO_PRUEBA = {"uid": "usuario-prueba", "email": "prueba@example.com"}


@pytest.fixture(autouse=True)
def usuario_autenticado():
    app.dependency_overrides[usuario_actual] = lambda: USUARIO_PRUEBA
    yield USUARIO_PRUEBA
    app.dependency_overrides.clear()
