# Sistema de Reservas de Laboratorio

Este proyecto es una solución local para la gestión de reservas de equipos físicos en un laboratorio. Permite consultar disponibilidad, registrar reservas y cancelarlas manteniendo el historial, utilizando un agente de programación para asistir en su desarrollo.

## 1. Especificación Breve

*   **Problema:** La coordinación del laboratorio necesita evitar solapamientos al reservar unidades físicas de equipos, permitiendo consultar el inventario, registrar uso y manejar cancelaciones de turnos sin perder el historial.
*   **Alcance:** Aplicación web de ejecución local con persistencia de datos en el navegador. No incluye backend, base de datos externa, ni autenticación multiusuario.
*   **Requisitos Verificables y Reglas:**
    *   Lectura de un inventario precargado de 5 unidades.
    *   Creación de reservas con unidad, solicitante no vacío y fechas de inicio/fin lógicas (inicio anterior a fin).
    *   Rechazo estricto de superposiciones para una misma unidad en estado activo.
    *   Permiso para reservas con límites consecutivos (ej: 10:00-11:00 y 11:00-12:00 en el mismo equipo).
    *   Permiso para reservas simultáneas en el mismo horario si son de unidades distintas.
    *   Cancelación de reservas liberando el horario pero conservando el registro en historial.
    *   Persistencia de estados al recargar la página.
*   **Supuestos:** El uso de la herramienta ocurre en un entorno local único (una sola PC/navegador de coordinación en el laboratorio). No se requiere validación avanzada de zonas horarias más allá de la hora local del dispositivo.

## 2. Solución

*   **Estructura y Tecnologías:**
    *   **Frontend:** HTML5, CSS3 (variables CSS, sin frameworks) y Vanilla JavaScript.
    *   **Lógica de Negocio:** Separada en `reservations.js` para desacoplarla de la interfaz visual (`app.js`).
    *   **Testing:** Pruebas E2E (End-to-End) en Python utilizando `pytest` y `Playwright` en el archivo `tests.py`.
*   **Decisiones Técnicas:** Se optó por utilizar `localStorage` del navegador para cumplir con el requisito de persistencia sin complicar la arquitectura con un backend. Se eligió Python + Playwright para el testing para lograr un aislamiento real interactuando con el DOM tal como lo haría un usuario.
*   **Requisitos Previos (para pruebas):** Python 3.x, `pytest`, `playwright`.
*   **Instalación y Carga Inicial:**
    1.  Clonar el repositorio.
    2.  Hacer doble clic en `index.html` para abrirlo en cualquier navegador web moderno. La carga del inventario inicial y los datos es automática.
    3.  Para ejecutar las pruebas: 
        *   `pip install pytest playwright`
        *   `playwright install chromium`
*   **Comandos de Pruebas:** Ejecutar `pytest tests.py -v` en la terminal, en la raíz del proyecto.
*   **Persistencia y Limitaciones:** Los datos se guardan en el navegador bajo la clave `lab_reservations_data_v1`. **Advertencia:** Borrar los datos de navegación o limpiar la caché del navegador eliminará irreversiblemente todas las reservas. Al no tener backend, no hay sincronización concurrente entre distintas computadoras.

## 3. Preparación del Agente

*   **Entorno y Modelo:** Se utilizó un agente de programación externo (Antigravity).
*   **Instrucciones y Contexto:** Se configuró al agente mediante un prompt inicial detallado ("One-shot prompt") que especificaba estrictamente el stack a usar (HTML/CSS/Vanilla JS), la estructura de archivos deseada, el inventario a hardcodear, y las reglas matemáticas precisas para evaluar las superposiciones de tiempo y persistencia local. 
*   **Adaptación:** Se le exigió al agente generar la aplicación priorizando la lógica de negocio orientada al `localStorage` antes de maquetar el HTML. Inicialmente se le pidieron pruebas en JS, pero durante el desarrollo (ver Episodio 2) se adaptó para usar Python y Playwright.

## 4. Registro de Decisiones y Delegación

A continuación se documentan tres episodios reales de interacción y corrección con el agente de IA.

### Episodio 1: Eliminación del sistema de testing inicial
*   **Objetivo:** Borrar el sistema de tests que generó el agente por defecto en JavaScript para dar paso a un entorno de pruebas más robusto.
*   **Contexto suministrado:** *"Necesito que borres el sistema de testing, esto incluye: El archivo tests.js, El boton de pruebas en el index.html, La suite en el index.html que carga los resultados de la prueba, Si existe otro codigo referido al testing, señalame donde esta y pedime autorizacion para borrarlo."*
*   **Acción del agente:** *"He completado la eliminación solicitada: tests.js: Archivo eliminado por completo del proyecto. Botón de pruebas en index.html: Eliminado del encabezado principal. Suite de resultados en index.html: Eliminado el panel `<section>` con el contenedor `#tests-output`, así como la etiqueta `<script src="tests.js"></script>`. Código adicional relacionado con testing detectado: Siguiendo tu indicación, he identificado el resto de referencias y código vinculado al testing en los demás archivos. Por favor, confírmame si autorizas su eliminación: [Múltiples líneas de código en app.js, style.css y reservations.js]. ¿Autorizas la eliminación de estos fragmentos (o prefieres conservar alguno, como clearAll() o el soporte module.exports)?"*
*   **Decisión humana:** **Aceptar.** Era necesario limpiar por completo el DOM y la lógica antigua para no generar conflictos con el nuevo framework E2E. 
*   **Evidencia (Commit):** [`2e3f68e`](https://github.com/ivansilva1904/agent-challenge-is3/commit/2e3f68e746b195cc32f6dfb3a9a22c38a30d25ed)

### Episodio 2: Creación de nuevo sistema de testing con Python
*   **Objetivo:** Implementar pruebas automáticas E2E utilizando herramientas modernas que simulen un navegador real.
*   **Contexto suministrado:** *"Ahora necesito que crees un nuevo sistema de testing utilizando python con la libreria playwright y pytest en un unico archivo tests.py. También asegúrate de limpiar localStorage luego de cada prueba para mantener el aislamiento. Este tests.py tiene que contener los siguientes casos de prueba: [Lista de los 7 casos especificados en el prompt de pruebas]."*
*   **Acción del agente:** *"He creado el nuevo sistema de pruebas automatizadas en Python utilizando Playwright y pytest en el archivo único tests.py. Características Principales de tests.py: Aislamiento Estricto mediante Fixture (localStorage). Se implementó la fixture setup_and_teardown con autouse=True: Navega a la aplicación local mediante la URI file:/// de index.html, ejecuta localStorage.clear() y recarga la página antes de cada prueba, y ejecuta nuevamente localStorage.clear() al finalizar el test para garantizar que ningún dato persista. Resultado de la Ejecución: Se ejecutó la suite completa con éxito (7 passed en 4.83s). Puedes ejecutar la suite usando `pytest tests.py -v`."*
*   **Decisión humana:** **Aceptar.** El código generado incluía la fixture correcta en Pytest y los selectores precisos para encontrar los elementos del DOM.
*   **Evidencia (Commit):** [`8422b41`](https://github.com/ivansilva1904/agent-challenge-is3/commit/8422b4131d0b9d00162f3a32c508504f7f7fadc8)

### Episodio 3: Añadir funcionalidad de limpieza visual de cancelaciones
*   **Objetivo:** Mejorar la interfaz de usuario permitiendo borrar de la lista las reservas que ya fueron canceladas y no aportan valor visual.
*   **Contexto suministrado:** *"Quiero que hagas el siguiente cambio al comportamiento del boton "Cancelar" una reserva: Actualmente luego de clickear el boton deja registrado en la interfaz la reservacion con color gris para indicar que se cancelo. Quiero que en el mismo nivel de los dropdown "Estado" y "Filtrar por equipo" añadas un boton "Limpiar reservas canceladas" que permita quitar todos los registros que fueron cancelados de la lista."*
*   **Acción del agente:** *"He implementado la funcionalidad solicitada: Cambios Realizados en Interfaz de Usuario (index.html): Se añadió el botón '🗑️ Limpiar reservas canceladas' (#btn-clear-cancelled) dentro del contenedor .table-controls. Estilos y Alineación (styles.css): Se ajustó .table-controls con align-items: flex-end. Lógica de Negocio (reservations.js): Se implementó el método clearCancelledReservations() en ReservationSystem, el cual filtra y remueve de manera persistente en localStorage todas las reservas cuyo estado sea CANCELADA. Controlador del DOM (app.js): Se conectó el botón para invocar clearCancelledReservations(). Suite de Pruebas (tests.py): Se añadió el caso de prueba test_limpiar_reservas_canceladas, ejecutado exitosamente."*
*   **Decisión humana:** **Corregir.** Si bien la lógica en JavaScript funcionaba y borraba del array las reservas canceladas, en la parte visual el botón quedaba desalineado por debajo de los dropdowns y a la derecha. Tuve que realizar una corrección humana en el archivo CSS para asegurar que `flex-wrap` y los anchos de los contenedores dejaran todo en una sola línea estética.
*   **Evidencia (Commit):** [`962df3f`](https://github.com/ivansilva1904/agent-challenge-is3/commit/962df3f49fa29c6f588c68bde0262d214482f8ed)