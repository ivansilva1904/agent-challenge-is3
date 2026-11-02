/**
 * app.js
 * 
 * Controlador de la interfaz de usuario (DOM) y puente con la capa de negocio.
 * Se encarga de:
 * - Inicializar el sistema de reservas con persistencia en localStorage.
 * - Poblar el inventario y sus selectores.
 * - Manejar el envío del formulario con validación interactiva y retroalimentación clara.
 * - Renderizar la tabla de historial con estados visuales y acciones de cancelación.
 * - Configurar valores iniciales convenientes en los inputs de fecha/hora.
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Inicializar el motor de negocio
  const reservationSystem = new window.ReservationSystem();

  // 2. Elementos del DOM
  const form = document.getElementById('reservation-form');
  const unitSelect = document.getElementById('unit-select');
  const requesterInput = document.getElementById('requester-input');
  const startTimeInput = document.getElementById('start-time');
  const endTimeInput = document.getElementById('end-time');
  const feedbackContainer = document.getElementById('form-feedback');
  const inventoryContainer = document.getElementById('inventory-grid');
  const reservationsTbody = document.getElementById('reservations-tbody');
  const emptyState = document.getElementById('reservations-empty');
  const statusFilter = document.getElementById('status-filter');
  const unitFilter = document.getElementById('unit-filter');

  // 3. Inicialización de la vista
  initDateTimeInputs();
  populateInventoryDropdown();
  populateUnitFilterDropdown();
  renderInventoryOverview();
  renderReservationsTable();

  // 4. Configurar valores por defecto inteligentes para las fechas (ahora + 1 hora)
  function initDateTimeInputs() {
    const now = new Date();
    // Redondear a los siguientes 15 o 30 minutos
    now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15, 0, 0);

    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

    // Formato local YYYY-MM-DDTHH:mm para input type="datetime-local"
    const formatToLocalISO = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    if (startTimeInput && endTimeInput) {
      startTimeInput.value = formatToLocalISO(now);
      endTimeInput.value = formatToLocalISO(oneHourLater);
      startTimeInput.min = formatToLocalISO(new Date(now.getTime() - 24 * 3600 * 1000));
    }
  }

  // Mensaje informativo en consola
  console.log('%c🔬 Sistema de Reservas de Laboratorio inicializado.', 'color: #1e3a8a; font-weight: bold; font-size: 13px;');

  // 5. Poblar el selector de unidades del formulario
  function populateInventoryDropdown() {
    if (!unitSelect) return;
    const inventory = reservationSystem.getInventory();
    unitSelect.innerHTML = '<option value="" disabled selected>Seleccione un equipo...</option>';

    inventory.forEach(item => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.id} - ${item.name} (${item.category})`;
      unitSelect.appendChild(option);
    });
  }

  // 6. Poblar filtro por unidad
  function populateUnitFilterDropdown() {
    if (!unitFilter) return;
    const inventory = reservationSystem.getInventory();
    unitFilter.innerHTML = '<option value="ALL">Todas las unidades</option>';

    inventory.forEach(item => {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = `${item.id} - ${item.name}`;
      unitFilter.appendChild(option);
    });
  }

  // 7. Renderizar tarjetas de inventario con resumen de ocupación
  function renderInventoryOverview() {
    if (!inventoryContainer) return;
    const inventory = reservationSystem.getInventory();
    const activeReservations = reservationSystem.getActiveReservations();
    const now = new Date();

    inventoryContainer.innerHTML = '';

    inventory.forEach(item => {
      // Verificar si está ocupado justo en este instante
      const currentActive = activeReservations.find(res => {
        if (res.unitId !== item.id) return false;
        const start = new Date(res.startTime);
        const end = new Date(res.endTime);
        return now >= start && now < end;
      });

      // Total de reservas activas programadas
      const unitActiveCount = activeReservations.filter(res => res.unitId === item.id).length;

      const card = document.createElement('div');
      card.className = `inventory-card ${currentActive ? 'status-in-use' : 'status-free'}`;
      card.innerHTML = `
        <div class="card-header">
          <span class="unit-code">${escapeHtml(item.id)}</span>
          <span class="badge ${currentActive ? 'badge-busy' : 'badge-free'}">
            ${currentActive ? 'En uso ahora' : 'Disponible ahora'}
          </span>
        </div>
        <h4 class="unit-title">${escapeHtml(item.name)}</h4>
        <div class="card-meta">
          <span class="category-tag">${escapeHtml(item.category)}</span>
          <span class="reservations-count">📅 ${unitActiveCount} reserva(s) activa(s)</span>
        </div>
        ${currentActive ? `
          <div class="in-use-detail">
            <small>Ocupado por: <strong>${escapeHtml(currentActive.requester)}</strong></small><br>
            <small>Hasta: ${new Date(currentActive.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small>
          </div>
        ` : ''}
      `;
      inventoryContainer.appendChild(card);
    });
  }

  // 8. Renderizar tabla de historial de reservas
  function renderReservationsTable() {
    if (!reservationsTbody) return;

    let reservations = reservationSystem.getAllReservations();

    // Filtros
    const selectedStatus = statusFilter ? statusFilter.value : 'ALL';
    const selectedUnit = unitFilter ? unitFilter.value : 'ALL';

    if (selectedStatus !== 'ALL') {
      reservations = reservations.filter(r => r.status === selectedStatus);
    }
    if (selectedUnit !== 'ALL') {
      reservations = reservations.filter(r => r.unitId === selectedUnit);
    }

    // Ordenar de más reciente a más antigua por fecha de creación
    reservations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (reservations.length === 0) {
      reservationsTbody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    reservationsTbody.innerHTML = reservations.map(res => {
      const isCancelled = res.status === 'CANCELADA';
      const startDate = formatDateTime(res.startTime);
      const endDate = formatDateTime(res.endTime);

      return `
        <tr class="res-row ${isCancelled ? 'row-cancelled' : 'row-active'}">
          <td class="col-id">
            <code>${escapeHtml(res.id)}</code>
          </td>
          <td class="col-unit">
            <strong>${escapeHtml(res.unitId)}</strong>
            <small class="d-block text-muted">${escapeHtml(res.unitName)}</small>
          </td>
          <td class="col-requester">
            ${escapeHtml(res.requester)}
          </td>
          <td class="col-dates">
            <div class="date-interval">
              <span><strong>Inicio:</strong> ${startDate}</span>
              <span><strong>Fin:</strong> ${endDate}</span>
            </div>
          </td>
          <td class="col-status">
            <span class="badge ${isCancelled ? 'badge-cancelled' : 'badge-active'}">
              ${isCancelled ? '✖ Cancelada' : '✔ Activa'}
            </span>
          </td>
          <td class="col-actions">
            ${!isCancelled ? `
              <button class="btn btn-sm btn-danger btn-cancel-action" data-id="${escapeHtml(res.id)}">
                Cancelar
              </button>
            ` : `
              <span class="text-muted text-small">
                ${res.cancelledAt ? `Cancelada el ${formatDateTime(res.cancelledAt)}` : 'Inactiva'}
              </span>
            `}
          </td>
        </tr>
      `;
    }).join('');

    // Adjuntar escuchadores a los botones de cancelación
    attachCancellationHandlers();
  }

  // 9. Manejar clics de cancelación
  function attachCancellationHandlers() {
    const cancelBtns = reservationsTbody.querySelectorAll('.btn-cancel-action');
    cancelBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.target.getAttribute('data-id');
        if (!id) return;

        const confirmCancel = confirm(`¿Estás seguro de que deseas cancelar la reserva ${id}?\nEl intervalo de tiempo quedará liberado inmediatamente.`);
        if (!confirmCancel) return;

        const result = reservationSystem.cancelReservation(id);
        if (result.success) {
          showFeedback('success', `Reserva ${id} cancelada exitosamente. El horario ha sido liberado.`);
          renderReservationsTable();
          renderInventoryOverview();
        } else {
          showFeedback('error', result.error);
        }
      });
    });
  }

  // 10. Manejar envío del formulario de reserva
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      clearFeedback();

      const unitId = unitSelect.value;
      const requester = requesterInput.value;
      const startTime = startTimeInput.value;
      const endTime = endTimeInput.value;

      const result = reservationSystem.createReservation({
        unitId,
        requester,
        startTime,
        endTime
      });

      if (!result.success) {
        showFeedback('error', result.error);
        return;
      }

      // Éxito: notificar al usuario y actualizar vistas
      showFeedback('success', `¡Reserva creada exitosamente! ID: ${result.reservation.id} para ${result.reservation.unitId}.`);
      
      // Limpiar solicitante pero mantener fechas o incrementarlas
      requesterInput.value = '';
      
      renderReservationsTable();
      renderInventoryOverview();
    });
  }

  // 11. Escuchadores de filtros
  if (statusFilter) {
    statusFilter.addEventListener('change', renderReservationsTable);
  }
  if (unitFilter) {
    unitFilter.addEventListener('change', renderReservationsTable);
  }

  // Utilidades auxiliares
  function showFeedback(type, message) {
    if (!feedbackContainer) return;
    feedbackContainer.className = `alert alert-${type}`;
    feedbackContainer.textContent = message;
    feedbackContainer.style.display = 'block';

    // Auto-scroll suave hacia el mensaje de feedback si no está visible
    feedbackContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function clearFeedback() {
    if (!feedbackContainer) return;
    feedbackContainer.textContent = '';
    feedbackContainer.style.display = 'none';
  }

  function formatDateTime(isoString) {
    if (!isoString) return '-';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
});
