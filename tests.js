/**
 * tests.js
 * 
 * Suite de pruebas automáticas para el Sistema de Reservas del Laboratorio.
 * Valida de forma rigurosa las 6 reglas críticas solicitadas:
 * 
 * 1. Creación de una reserva válida.
 * 2. Rechazo por superposición de horarios (misma unidad).
 * 3. Aceptación de límites consecutivos (ej. 10:00-11:00 y 11:00-12:00).
 * 4. Aceptación de unidades distintas en el mismo horario simultáneo.
 * 5. Rechazo por entradas inválidas (fechas invertidas, nombre vacío, unidad inexistente).
 * 6. Cancelación de reserva: el registro se conserva en el historial con estado "CANCELADA",
 *    pero el horario queda liberado para una nueva reserva.
 * 
 * Es ejecutable tanto en Node.js como en el navegador (consola y DOM).
 */

// Si se ejecuta en Node.js, requerir el módulo
let ReservationSystemClass;
if (typeof require !== 'undefined') {
  ReservationSystemClass = require('./reservations.js').ReservationSystem;
} else if (typeof window !== 'undefined' && window.ReservationSystem) {
  ReservationSystemClass = window.ReservationSystem;
}

/**
 * Mock simple de Storage en memoria para pruebas aisladas
 */
class MemoryStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

/**
 * Ejecutor principal de pruebas
 * @param {Object} [options]
 * @param {boolean} [options.renderToDOM] - Si es true y existe el DOM, renderiza resultados.
 * @returns {Array<{name: string, passed: boolean, details: string}>}
 */
function runReservationTests(options = {}) {
  const results = [];

  function record(name, condition, details = '') {
    const passed = Boolean(condition);
    results.push({ name, passed, details });
    if (!passed) {
      console.error(`❌ [FAIL] ${name}: ${details}`);
    } else {
      console.log(`✅ [PASS] ${name}${details ? ` -> ${details}` : ''}`);
    }
    console.assert(passed, `${name}: ${details}`);
  }

  console.group ? console.group('🧪 Ejecutando Suite de Pruebas de Reservas...') : console.log('--- Iniciando Pruebas ---');

  // Instanciar un sistema limpio con almacenamiento aislado para no corromper datos reales
  const testStorage = new MemoryStorage();
  const system = new ReservationSystemClass({ storage: testStorage });

  // -------------------------------------------------------------
  // TEST 1: Creación de una reserva válida
  // -------------------------------------------------------------
  const t1Res = system.createReservation({
    unitId: 'MIC-01',
    requester: 'Dra. María González',
    startTime: '2026-11-01T09:00:00',
    endTime: '2026-11-01T10:30:00'
  });

  record(
    '1. Creación de una reserva válida',
    t1Res.success === true &&
    t1Res.reservation &&
    t1Res.reservation.unitId === 'MIC-01' &&
    t1Res.reservation.status === 'ACTIVA',
    t1Res.success ? `Reserva ID: ${t1Res.reservation.id}` : t1Res.error
  );

  // -------------------------------------------------------------
  // TEST 2: Rechazo por superposición de horarios (misma unidad)
  // -------------------------------------------------------------
  // Intentar reservar MIC-01 en 10:00 a 11:00 (se solapa con 09:00 - 10:30)
  const t2Overlap = system.createReservation({
    unitId: 'MIC-01',
    requester: 'Dr. Roberto Gómez',
    startTime: '2026-11-01T10:00:00',
    endTime: '2026-11-01T11:00:00'
  });

  record(
    '2. Rechazo por superposición de horarios (misma unidad)',
    t2Overlap.success === false && Boolean(t2Overlap.conflict),
    t2Overlap.success ? 'Error: Debería haber sido rechazada' : `Rechazada correctamente: "${t2Overlap.error}"`
  );

  // -------------------------------------------------------------
  // TEST 3: Aceptación de límites consecutivos
  // -------------------------------------------------------------
  // La reserva existente de MIC-01 termina exactamente a las 10:30:00.
  // Una nueva reserva de 10:30:00 a 12:00:00 DEBE ser aceptada (consecutiva estricta).
  const t3Consecutive = system.createReservation({
    unitId: 'MIC-01',
    requester: 'Lic. Andrés Silva',
    startTime: '2026-11-01T10:30:00',
    endTime: '2026-11-01T12:00:00'
  });

  record(
    '3. Aceptación de límites consecutivos en la misma unidad',
    t3Consecutive.success === true && t3Consecutive.reservation.status === 'ACTIVA',
    t3Consecutive.success ? 'Aceptada correctamente sin solapamiento en el límite' : t3Consecutive.error
  );

  // -------------------------------------------------------------
  // TEST 4: Aceptación de unidades distintas en horario simultáneo
  // -------------------------------------------------------------
  // MIC-01 está ocupado de 09:00 a 10:30 y de 10:30 a 12:00.
  // Reservar MIC-02 en el horario 09:00 a 11:00 DEBE ser aceptado sin interferencias.
  const t4DifferentUnit = system.createReservation({
    unitId: 'MIC-02',
    requester: 'Ing. Carlos Mendoza',
    startTime: '2026-11-01T09:00:00',
    endTime: '2026-11-01T11:00:00'
  });

  record(
    '4. Aceptación de unidades distintas en horario simultáneo',
    t4DifferentUnit.success === true && t4DifferentUnit.reservation.unitId === 'MIC-02',
    t4DifferentUnit.success ? 'Reserva paralela creada exitosamente para MIC-02' : t4DifferentUnit.error
  );

  // -------------------------------------------------------------
  // TEST 5: Rechazo por entradas inválidas
  // -------------------------------------------------------------
  // 5a. Solicitante vacío
  const t5aEmpty = system.createReservation({
    unitId: 'OSC-01',
    requester: '   ',
    startTime: '2026-11-01T14:00:00',
    endTime: '2026-11-01T15:00:00'
  });

  // 5b. Fechas invertidas (inicio posterior al fin)
  const t5bInverted = system.createReservation({
    unitId: 'OSC-01',
    requester: 'Estudiante Laura',
    startTime: '2026-11-01T16:00:00',
    endTime: '2026-11-01T15:00:00'
  });

  // 5c. Fechas iguales
  const t5cEqual = system.createReservation({
    unitId: 'OSC-01',
    requester: 'Estudiante Laura',
    startTime: '2026-11-01T15:00:00',
    endTime: '2026-11-01T15:00:00'
  });

  // 5d. Unidad inexistente
  const t5dUnit = system.createReservation({
    unitId: 'INVENTO-99',
    requester: 'Estudiante Laura',
    startTime: '2026-11-01T15:00:00',
    endTime: '2026-11-01T16:00:00'
  });

  const test5Passed = (
    t5aEmpty.success === false &&
    t5bInverted.success === false &&
    t5cEqual.success === false &&
    t5dUnit.success === false
  );

  record(
    '5. Rechazo por entradas inválidas (nombre vacío, fechas invertidas/iguales, unidad inexistente)',
    test5Passed,
    test5Passed ? 'Todos los casos inválidos fueron bloqueados con éxito' : 'Falló alguna validación de entrada'
  );

  // -------------------------------------------------------------
  // TEST 6: Cancelación y liberación inmediata del horario
  // -------------------------------------------------------------
  // Crearemos una reserva para MUL-01 de 16:00 a 17:00
  const t6Setup = system.createReservation({
    unitId: 'MUL-01',
    requester: 'Téc. Fernando Ríos',
    startTime: '2026-11-01T16:00:00',
    endTime: '2026-11-01T17:00:00'
  });
  const resToCancelId = t6Setup.reservation.id;

  // Verificar que mientras está activa, un intento solapado se rechaza
  const t6PreOverlap = system.createReservation({
    unitId: 'MUL-01',
    requester: 'Téc. Reemplazo',
    startTime: '2026-11-01T16:15:00',
    endTime: '2026-11-01T16:45:00'
  });
  const preOverlapBlocked = t6PreOverlap.success === false;

  // Cancelar la reserva original
  const cancelResult = system.cancelReservation(resToCancelId);

  // Verificar que en el historial sigue existiendo y su estado es CANCELADA
  const historyRecord = system.getReservationById(resToCancelId);
  const stillInHistory = historyRecord !== null && historyRecord.status === 'CANCELADA';

  // Ahora, intentar nuevamente reservar exactamente el horario liberado
  const t6PostReservation = system.createReservation({
    unitId: 'MUL-01',
    requester: 'Téc. Reemplazo',
    startTime: '2026-11-01T16:15:00',
    endTime: '2026-11-01T16:45:00'
  });
  const slotNowAvailable = t6PostReservation.success === true;

  const test6Passed = (
    cancelResult.success === true &&
    preOverlapBlocked &&
    stillInHistory &&
    slotNowAvailable
  );

  record(
    '6. Cancelación: Registro permanece en historial ("CANCELADA") y horario queda libre para nueva reserva',
    test6Passed,
    test6Passed
      ? `Cancelada correctamente (ID: ${resToCancelId}), historial preservado, y nuevo turno concedido`
      : 'Falló la lógica de cancelación o liberación de horario'
  );

  // -------------------------------------------------------------
  // TEST 7: Persistencia y Simulación de Reinicio (Recarga de Página)
  // -------------------------------------------------------------
  // Simular cierre de pestaña y nueva instancia cargando desde el mismo storage
  const systemAfterReload = new ReservationSystemClass({ storage: testStorage });
  const reloadedAll = systemAfterReload.getAllReservations();
  const reloadedActive = systemAfterReload.getActiveReservations();
  
  const hasActive = reloadedActive.some(r => r.status === 'ACTIVA');
  const hasCancelled = reloadedAll.some(r => r.status === 'CANCELADA');
  
  const test7Passed = (
    reloadedAll.length > 0 &&
    hasActive &&
    hasCancelled &&
    reloadedAll.length === system.getAllReservations().length
  );

  record(
    '7. Persistencia: Recarga de página (nuevo ciclo de vida) conserva íntegros estados activos y cancelados',
    test7Passed,
    test7Passed
      ? `Se recuperaron ${reloadedAll.length} reservas intactas (${reloadedActive.length} activas)`
      : 'Falló la recuperación tras reinicio'
  );

  console.groupEnd ? console.groupEnd() : console.log('--- Fin de Pruebas ---');

  // Renderizar al DOM si se solicita y existe el contenedor
  if (options.renderToDOM && typeof document !== 'undefined') {
    renderTestResultsToDOM(results);
  }

  return results;
}

/**
 * Función auxiliar para pintar resultados de pruebas en la interfaz si se desea ver visualmente
 */
function renderTestResultsToDOM(results) {
  const container = document.getElementById('tests-output');
  if (!container) return;

  const allPassed = results.every(r => r.passed);
  const passedCount = results.filter(r => r.passed).length;
  let html = `
    <div class="test-suite-summary ${allPassed ? 'all-passed' : 'some-failed'}">
      <strong>Resultado de la Suite:</strong> ${allPassed ? `✅ ${passedCount}/${results.length} Pruebas Superadas` : `⚠️ ${passedCount}/${results.length} Pruebas Superadas (Ver detalles abajo)`}
    </div>
    <ul class="test-list">
  `;

  results.forEach((res, idx) => {
    html += `
      <li class="test-item ${res.passed ? 'pass' : 'fail'}">
        <span class="test-badge">${res.passed ? 'PASÓ' : 'FALLÓ'}</span>
        <div class="test-content">
          <strong>${res.name}</strong>
          <small>${res.details || ''}</small>
        </div>
      </li>
    `;
  });

  html += '</ul>';
  container.innerHTML = html;
}

// Exportación modular o global
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    MemoryStorage,
    runReservationTests,
    renderTestResultsToDOM
  };

  // Si se ejecuta directamente desde la CLI: node tests.js
  if (require.main === module) {
    runReservationTests();
  }
}

if (typeof window !== 'undefined') {
  window.MemoryStorage = MemoryStorage;
  window.runReservationTests = runReservationTests;
  window.renderTestResultsToDOM = renderTestResultsToDOM;
}
