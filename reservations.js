/**
 * reservations.js
 * 
 * Lógica de negocio para el Sistema de Reservas del Laboratorio.
 * Contiene:
 * - Inventario precargado de equipos (inmutable).
 * - Validaciones de formato y coherencia temporal.
 * - Algoritmo de detección de solapamiento de intervalos [inicio, fin).
 * - Gestión de persistencia desacoplada con soporte para localStorage y memoria fallback.
 */

// 1. Inventario Precargado (Inmutable)
const INVENTORY = Object.freeze([
  { id: 'MIC-01', name: 'Microscopio digital', category: 'Óptica' },
  { id: 'MIC-02', name: 'Microscopio digital', category: 'Óptica' },
  { id: 'OSC-01', name: 'Osciloscopio', category: 'Electrónica' },
  { id: 'MUL-01', name: 'Multímetro', category: 'Electrónica' },
  { id: 'FUE-01', name: 'Fuente de alimentación', category: 'Electrónica' }
]);

const RESERVATION_STATUS = Object.freeze({
  ACTIVE: 'ACTIVA',
  CANCELLED: 'CANCELADA'
});

const STORAGE_KEY = 'lab_reservations_data_v1';

class ReservationSystem {
  /**
   * @param {Object} [options]
   * @param {Storage} [options.storage] - Interfaz compatible con localStorage.
   */
  constructor(options = {}) {
    this._memoryFallback = [];
    this.storage = options.storage || (typeof localStorage !== 'undefined' ? localStorage : null);
  }

  /**
   * Obtiene la lista completa del inventario precargado.
   * @returns {Array<{id: string, name: string, category: string}>}
   */
  getInventory() {
    return INVENTORY.map(item => ({ ...item }));
  }

  /**
   * Busca un equipo en el inventario por su ID.
   * @param {string} unitId 
   * @returns {Object|null}
   */
  getUnitById(unitId) {
    if (!unitId || typeof unitId !== 'string') return null;
    const unit = INVENTORY.find(item => item.id.toUpperCase() === unitId.trim().toUpperCase());
    return unit ? { ...unit } : null;
  }

  /**
   * Carga todas las reservas almacenadas (activas y canceladas).
   * @returns {Array<Object>}
   */
  getAllReservations() {
    if (this.storage) {
      try {
        const raw = this.storage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        console.error('Error al leer de storage, usando memoria fallback:', err);
        return [...this._memoryFallback];
      }
    }
    return [...this._memoryFallback];
  }

  /**
   * Persiste la lista completa de reservas.
   * @param {Array<Object>} reservations 
   */
  _saveReservations(reservations) {
    if (this.storage) {
      try {
        this.storage.setItem(STORAGE_KEY, JSON.stringify(reservations));
        return;
      } catch (err) {
        console.error('Error al guardar en storage, persistiendo en memoria:', err);
      }
    }
    this._memoryFallback = [...reservations];
  }

  /**
   * Obtiene una reserva por su ID único.
   * @param {string} id 
   * @returns {Object|null}
   */
  getReservationById(id) {
    const list = this.getAllReservations();
    return list.find(res => res.id === id) || null;
  }

  /**
   * Obtiene todas las reservas activas (opcionalmente filtradas por unidad).
   * @param {string} [unitId]
   * @returns {Array<Object>}
   */
  getActiveReservations(unitId = null) {
    const all = this.getAllReservations();
    return all.filter(res => {
      const isActive = res.status === RESERVATION_STATUS.ACTIVE;
      if (!unitId) return isActive;
      return isActive && res.unitId.toUpperCase() === unitId.trim().toUpperCase();
    });
  }

  /**
   * Valida exhaustivamente los datos de entrada para una reserva.
   * Reglas:
   * 1. Unidad debe existir en el inventario.
   * 2. Solicitante no puede estar vacío ni contener solo espacios.
   * 3. Fechas deben ser válidas y el inicio estrictamente anterior al fin.
   * 
   * @param {Object} data
   * @param {string} data.unitId
   * @param {string} data.requester
   * @param {string|Date} data.startTime
   * @param {string|Date} data.endTime
   * @returns {{ valid: boolean, error?: string, parsed?: { unit: Object, requester: string, startDate: Date, endDate: Date } }}
   */
  validateReservationInput(data) {
    if (!data || typeof data !== 'object') {
      return { valid: false, error: 'Los datos de la reserva son requeridos.' };
    }

    const { unitId, requester, startTime, endTime } = data;

    // Validación del solicitante
    if (typeof requester !== 'string' || requester.trim().length === 0) {
      return {
        valid: false,
        error: 'El nombre del solicitante no puede estar vacío ni contener solo espacios en blanco.'
      };
    }

    // Validación de la unidad en inventario
    const unit = this.getUnitById(unitId);
    if (!unit) {
      return {
        valid: false,
        error: `La unidad "${unitId}" no existe en el inventario del laboratorio.`
      };
    }

    // Validación de existencia de fechas
    if (!startTime || !endTime) {
      return {
        valid: false,
        error: 'Debe especificar tanto la fecha/hora de inicio como la de fin.'
      };
    }

    const startDate = new Date(startTime);
    const endDate = new Date(endTime);

    // Validación de formato de fechas
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return {
        valid: false,
        error: 'Las fechas u horas proporcionadas no tienen un formato válido.'
      };
    }

    // Validación de estricta precedencia: inicio < fin
    if (startDate.getTime() >= endDate.getTime()) {
      return {
        valid: false,
        error: 'La fecha y hora de inicio debe ser estrictamente anterior a la de fin.'
      };
    }

    return {
      valid: true,
      parsed: {
        unit,
        requester: requester.trim(),
        startDate,
        endDate
      }
    };
  }

  /**
   * Comprueba si el intervalo [newStart, newEnd) se superpone con reservas activas de la misma unidad.
   * 
   * REGLA MATEMÁTICA DE INTERVALOS SEMIABIERTOS [A, B) y [C, D):
   * Dos intervalos se solapan si y solo si: A < D && C < B
   * 
   * Consecuencias de esta regla:
   * - Si newEnd === existingStart: A < D es falso -> NO hay solapamiento (consecutivos permitidos).
   * - Si newStart === existingEnd: C < B es falso -> NO hay solapamiento (consecutivos permitidos).
   * - Si hay intersección interior: A < D && C < B es verdadero -> Solapamiento detectado.
   * - Solo se evalúan reservas con estado ACTIVA y de la MISMA unidad.
   * 
   * @param {string} unitId 
   * @param {Date} newStart 
   * @param {Date} newEnd 
   * @param {string|null} [excludeReservationId] - Para omitir una reserva específica (ej: edición o reevaluación)
   * @returns {{ hasOverlap: boolean, conflictingReservation: Object|null }}
   */
  checkOverlap(unitId, newStart, newEnd, excludeReservationId = null) {
    const activeForUnit = this.getActiveReservations(unitId);
    const startMs = newStart.getTime();
    const endMs = newEnd.getTime();

    for (const res of activeForUnit) {
      if (excludeReservationId && res.id === excludeReservationId) {
        continue;
      }

      const existingStart = new Date(res.startTime).getTime();
      const existingEnd = new Date(res.endTime).getTime();

      // Condición estricta de solapamiento en intervalos [start, end)
      const overlaps = (startMs < existingEnd) && (existingStart < endMs);

      if (overlaps) {
        return {
          hasOverlap: true,
          conflictingReservation: res
        };
      }
    }

    return {
      hasOverlap: false,
      conflictingReservation: null
    };
  }

  /**
   * Registra una nueva reserva si cumple todas las reglas de negocio y disponibilidad.
   * 
   * @param {Object} input
   * @param {string} input.unitId
   * @param {string} input.requester
   * @param {string|Date} input.startTime
   * @param {string|Date} input.endTime
   * @returns {{ success: boolean, reservation?: Object, error?: string, conflict?: Object }}
   */
  createReservation(input) {
    // 1. Validar reglas de formato y coherencia
    const validation = this.validateReservationInput(input);
    if (!validation.valid) {
      return {
        success: false,
        error: validation.error
      };
    }

    const { unit, requester, startDate, endDate } = validation.parsed;

    // 2. Comprobar solapamiento con reservas activas de la misma unidad
    const overlapCheck = this.checkOverlap(unit.id, startDate, endDate);
    if (overlapCheck.hasOverlap) {
      const conflict = overlapCheck.conflictingReservation;
      const conflictStart = new Date(conflict.startTime).toLocaleString();
      const conflictEnd = new Date(conflict.endTime).toLocaleString();
      return {
        success: false,
        error: `Conflicto de horario: El equipo "${unit.name} (${unit.id})" ya está reservado por "${conflict.requester}" desde ${conflictStart} hasta ${conflictEnd}.`,
        conflict
      };
    }

    // 3. Crear el nuevo registro de reserva
    const newReservation = {
      id: `RES-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
      unitId: unit.id,
      unitName: unit.name,
      requester,
      startTime: startDate.toISOString(),
      endTime: endDate.toISOString(),
      status: RESERVATION_STATUS.ACTIVE,
      createdAt: new Date().toISOString(),
      cancelledAt: null
    };

    // 4. Persistir agregando al listado existente
    const all = this.getAllReservations();
    all.push(newReservation);
    this._saveReservations(all);

    return {
      success: true,
      reservation: newReservation
    };
  }

  /**
   * Cancela una reserva activa sin eliminarla del historial.
   * Libera el horario para futuras reservas.
   * 
   * @param {string} reservationId 
   * @returns {{ success: boolean, reservation?: Object, error?: string }}
   */
  cancelReservation(reservationId) {
    if (!reservationId || typeof reservationId !== 'string') {
      return {
        success: false,
        error: 'Identificador de reserva inválido.'
      };
    }

    const all = this.getAllReservations();
    const index = all.findIndex(res => res.id === reservationId);

    if (index === -1) {
      return {
        success: false,
        error: `No se encontró la reserva con ID "${reservationId}".`
      };
    }

    const reservation = all[index];

    if (reservation.status === RESERVATION_STATUS.CANCELLED) {
      return {
        success: false,
        error: `La reserva "${reservationId}" ya se encontraba cancelada.`
      };
    }

    // Actualizar estado conservando los datos originales e ID
    reservation.status = RESERVATION_STATUS.CANCELLED;
    reservation.cancelledAt = new Date().toISOString();

    all[index] = reservation;
    this._saveReservations(all);

    return {
      success: true,
      reservation
    };
  }

  /**
   * Elimina permanentemente del historial todas las reservas canceladas.
   * @returns {{ success: boolean, count: number }}
   */
  clearCancelledReservations() {
    const all = this.getAllReservations();
    const remaining = all.filter(res => res.status !== RESERVATION_STATUS.CANCELLED);
    const removedCount = all.length - remaining.length;

    if (removedCount > 0) {
      this._saveReservations(remaining);
    }

    return {
      success: true,
      count: removedCount
    };
  }
}

// Exposición en el entorno global del navegador
if (typeof window !== 'undefined') {
  window.INVENTORY = INVENTORY;
  window.RESERVATION_STATUS = RESERVATION_STATUS;
  window.ReservationSystem = ReservationSystem;
}
