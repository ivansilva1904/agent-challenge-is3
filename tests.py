"""
tests.py

Suite de pruebas end-to-end para el Sistema Local de Reservas de Laboratorio.
Implementado con pytest y Playwright.

Verifica:
1. Creación de reserva válida.
2. Rechazo por superposición de horarios (misma unidad).
3. Aceptación de límites consecutivos.
4. Reservas simultáneas en horario idéntico para unidades distintas.
5. Rechazo por validación de fechas invertidas.
6. Cancelación con confirmación dialog y liberación inmediata del horario.
7. Persistencia y recuperación de datos en localStorage tras recarga (page.reload).
"""

import os
import re
import sys
from pathlib import Path
import pytest
from playwright.sync_api import Page, expect

# Ruta absoluta al archivo index.html como URL file:///
HTML_PATH = Path(__file__).parent / "index.html"
APP_URI = HTML_PATH.resolve().as_uri()


@pytest.fixture(autouse=True)
def setup_and_teardown(page: Page):
    """
    Navega a la aplicación y garantiza aislamiento limpiando localStorage
    tanto antes como después de cada prueba.
    """
    page.goto(APP_URI)
    # Limpieza previa
    page.evaluate("localStorage.clear()")
    page.reload()

    yield page

    # Limpieza posterior para garantizar aislamiento estricto
    try:
        page.evaluate("localStorage.clear()")
    except Exception:
        pass


def fill_reservation_form(page: Page, unit_id: str, requester: str, start_time: str, end_time: str):
    """
    Función auxiliar para completar y enviar el formulario de reserva.
    """
    page.select_option("#unit-select", unit_id)
    page.fill("#requester-input", requester)
    page.fill("#start-time", start_time)
    page.fill("#end-time", end_time)
    page.click("#submit-btn")


def test_creacion_reserva_valida(page: Page):
    """
    Creación de reserva válida: Llena el formulario con datos correctos para 'MIC-01'
    y verifica que aparezca el mensaje de éxito en #form-feedback y una nueva fila en #reservations-tbody.
    """
    fill_reservation_form(
        page,
        unit_id="MIC-01",
        requester="Dr. Alan Turing",
        start_time="2026-11-10T10:00",
        end_time="2026-11-10T11:00"
    )

    # Verificar mensaje de éxito
    feedback = page.locator("#form-feedback")
    expect(feedback).to_be_visible()
    expect(feedback).to_have_class(re.compile(r"alert-success"))
    expect(feedback).to_contain_text("Reserva creada exitosamente")
    expect(feedback).to_contain_text("MIC-01")

    # Verificar nueva fila en la tabla de historial
    rows = page.locator("#reservations-tbody tr.res-row")
    expect(rows).to_have_count(1)
    expect(rows.first).to_contain_text("MIC-01")
    expect(rows.first).to_contain_text("Dr. Alan Turing")
    expect(rows.first.locator(".badge-active")).to_contain_text("Activa")


def test_rechazo_por_superposicion(page: Page):
    """
    Rechazo por superposición: Crea una reserva para 'MIC-01' de 10:00 a 11:00.
    Intenta crear otra reserva para 'MIC-01' de 10:30 a 11:30.
    Verifica que el sistema la rechace mostrando un mensaje de error en #form-feedback.
    """
    # 1. Primera reserva válida (10:00 a 11:00)
    fill_reservation_form(
        page,
        unit_id="MIC-01",
        requester="Dra. Ada Lovelace",
        start_time="2026-11-10T10:00",
        end_time="2026-11-10T11:00"
    )
    expect(page.locator("#form-feedback")).to_have_class(re.compile(r"alert-success"))
    expect(page.locator("#reservations-tbody tr.res-row")).to_have_count(1)

    # 2. Intento de reserva superpuesta para la misma unidad (10:30 a 11:30)
    fill_reservation_form(
        page,
        unit_id="MIC-01",
        requester="Dr. Charles Babbage",
        start_time="2026-11-10T10:30",
        end_time="2026-11-10T11:30"
    )

    # Verificar rechazo con mensaje de error descriptivo
    feedback = page.locator("#form-feedback")
    expect(feedback).to_be_visible()
    expect(feedback).to_have_class(re.compile(r"alert-error"))
    expect(feedback).to_contain_text("Conflicto de horario")
    expect(feedback).to_contain_text("MIC-01")

    # La tabla debe continuar teniendo únicamente la reserva inicial
    expect(page.locator("#reservations-tbody tr.res-row")).to_have_count(1)


def test_limites_consecutivos_permitidos(page: Page):
    """
    Límites consecutivos permitidos: Crea una reserva para 'MIC-01' de 10:00 a 11:00.
    Crea una segunda reserva para 'MIC-01' de 11:00 a 12:00.
    Verifica que la segunda reserva sea aceptada con éxito.
    """
    # 1. Primera reserva (10:00 a 11:00)
    fill_reservation_form(
        page,
        unit_id="MIC-01",
        requester="Investigador 1",
        start_time="2026-11-10T10:00",
        end_time="2026-11-10T11:00"
    )
    expect(page.locator("#form-feedback")).to_have_class(re.compile(r"alert-success"))

    # 2. Segunda reserva consecutiva en el límite exacto (11:00 a 12:00)
    fill_reservation_form(
        page,
        unit_id="MIC-01",
        requester="Investigador 2",
        start_time="2026-11-10T11:00",
        end_time="2026-11-10T12:00"
    )

    # Verificar que la segunda reserva sea aceptada con éxito
    feedback = page.locator("#form-feedback")
    expect(feedback).to_be_visible()
    expect(feedback).to_have_class(re.compile(r"alert-success"))
    expect(feedback).to_contain_text("Reserva creada exitosamente")

    # Ambas reservas deben figurar en la tabla
    expect(page.locator("#reservations-tbody tr.res-row")).to_have_count(2)


def test_reservas_simultaneas_unidades_distintas(page: Page):
    """
    Reservas simultáneas (unidades distintas): Crea una reserva para 'MIC-01' de 10:00 a 11:00.
    Crea una reserva para 'OSC-01' en el mismo horario exacto (10:00 a 11:00).
    Verifica que ambas sean aceptadas.
    """
    # 1. Reserva para MIC-01
    fill_reservation_form(
        page,
        unit_id="MIC-01",
        requester="Equipo Óptica",
        start_time="2026-11-10T10:00",
        end_time="2026-11-10T11:00"
    )
    expect(page.locator("#form-feedback")).to_have_class(re.compile(r"alert-success"))

    # 2. Reserva simultánea para OSC-01 (mismo horario exacto)
    fill_reservation_form(
        page,
        unit_id="OSC-01",
        requester="Equipo Electrónica",
        start_time="2026-11-10T10:00",
        end_time="2026-11-10T11:00"
    )

    # Verificar aceptación de la segunda reserva
    feedback = page.locator("#form-feedback")
    expect(feedback).to_be_visible()
    expect(feedback).to_have_class(re.compile(r"alert-success"))
    expect(feedback).to_contain_text("Reserva creada exitosamente")

    # Ambas reservas deben figurar en la tabla
    tbody = page.locator("#reservations-tbody")
    expect(tbody.locator("tr.res-row")).to_have_count(2)
    expect(tbody).to_contain_text("MIC-01")
    expect(tbody).to_contain_text("OSC-01")


def test_rechazo_fechas_invertidas(page: Page):
    """
    Rechazo por validación de fechas invertidas: Intenta crear una reserva donde
    la fecha de inicio sea posterior a la fecha de fin.
    Verifica que el envío falle y muestre el error correspondiente.
    """
    # Inicio 15:00, Fin 14:00 (fecha invertida)
    fill_reservation_form(
        page,
        unit_id="MUL-01",
        requester="Alumno Práctica",
        start_time="2026-11-10T15:00",
        end_time="2026-11-10T14:00"
    )

    # Verificar que falle y muestre el error de validación
    feedback = page.locator("#form-feedback")
    expect(feedback).to_be_visible()
    expect(feedback).to_have_class(re.compile(r"alert-error"))
    expect(feedback).to_contain_text("estrictamente anterior")

    # No se debió crear ninguna reserva en la tabla
    expect(page.locator("#reservations-tbody tr.res-row")).to_have_count(0)


def test_cancelacion_y_liberacion_horario(page: Page):
    """
    Cancelación y liberación de horario: Crea una reserva para 'MIC-01' de 10:00 a 11:00.
    Usa Playwright para interceptar y aceptar el diálogo confirm.
    Haz clic en el botón 'Cancelar' de la tabla.
    Verifica que el estado cambie a cancelado.
    Luego, intenta crear una nueva reserva para 'MIC-01' de 10:00 a 11:00
    y verifica que ahora sí sea aceptada (el horario se liberó).
    """
    # 1. Crear reserva original
    fill_reservation_form(
        page,
        unit_id="MIC-01",
        requester="Dra. Marie Curie",
        start_time="2026-11-10T10:00",
        end_time="2026-11-10T11:00"
    )
    expect(page.locator("#form-feedback")).to_have_class(re.compile(r"alert-success"))
    expect(page.locator("#reservations-tbody tr.res-row")).to_have_count(1)

    # 2. Interceptar el diálogo confirm y aceptarlo automáticamente
    page.on("dialog", lambda dialog: dialog.accept())

    # 3. Hacer clic en el botón Cancelar de la fila
    cancel_btn = page.locator("#reservations-tbody .btn-cancel-action").first
    cancel_btn.click()

    # 4. Verificar que el estado cambie a "Cancelada" y se conserve en la tabla
    row = page.locator("#reservations-tbody tr.res-row").first
    expect(row.locator(".badge-cancelled")).to_be_visible()
    expect(row.locator(".badge-cancelled")).to_contain_text("Cancelada")
    expect(page.locator("#reservations-tbody tr.res-row")).to_have_count(1)

    # 5. Intentar crear nuevamente una reserva para MIC-01 en el horario antes ocupado (10:00 a 11:00)
    fill_reservation_form(
        page,
        unit_id="MIC-01",
        requester="Dr. Niels Bohr",
        start_time="2026-11-10T10:00",
        end_time="2026-11-10T11:00"
    )

    # Verificar que ahora sí es aceptada porque el horario fue liberado
    feedback = page.locator("#form-feedback")
    expect(feedback).to_be_visible()
    expect(feedback).to_have_class(re.compile(r"alert-success"))
    expect(feedback).to_contain_text("Reserva creada exitosamente")

    # Ambas reservas existen en el historial: la cancelada y la nueva activa
    expect(page.locator("#reservations-tbody tr.res-row")).to_have_count(2)


def test_persistencia_datos(page: Page):
    """
    Persistencia de datos: Crea una reserva.
    Ejecuta page.reload() para recargar la página.
    Verifica que la reserva siga visible en el DOM,
    comprobando que el localStorage recupera los datos correctamente tras un reinicio.
    """
    # 1. Crear una reserva
    fill_reservation_form(
        page,
        unit_id="FUE-01",
        requester="Dra. Rosalind Franklin",
        start_time="2026-11-10T14:00",
        end_time="2026-11-10T16:00"
    )
    expect(page.locator("#form-feedback")).to_have_class(re.compile(r"alert-success"))
    expect(page.locator("#reservations-tbody tr.res-row")).to_have_count(1)

    # 2. Recargar la página (simulación de reinicio/cierre de pestaña)
    page.reload()

    # 3. Verificar que la reserva continúa visible con sus datos intactos
    rows = page.locator("#reservations-tbody tr.res-row")
    expect(rows).to_have_count(1)
    expect(rows.first).to_contain_text("FUE-01")
    expect(rows.first).to_contain_text("Dra. Rosalind Franklin")
    expect(rows.first.locator(".badge-active")).to_contain_text("Activa")


if __name__ == "__main__":
    # Permite ejecutar directamente con: python tests.py
    sys.exit(pytest.main(["-v", __file__]))
