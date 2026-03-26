let calendar;
let patients = [];
let currentEditId = null;
let currentIsRecurring = false;

(async () => {
  if (!await requireAuth()) return;

  document.getElementById('logout-btn').addEventListener('click', (e) => { e.preventDefault(); logout(); });

  await loadPatients();
  initCalendar();
  setupListeners();
})();

// ===== Pacientes para el select =====
async function loadPatients() {
  const { data, error } = await db.from('patients').select('id, name').order('name');
  if (error) { showToast('Error al cargar pacientes', 'error'); return; }
  patients = data || [];
  const select = document.getElementById('patient-select');
  select.innerHTML = '<option value="">— Seleccionar paciente —</option>';
  patients.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.name;
    select.appendChild(opt);
  });
}

// ===== FullCalendar =====
function initCalendar() {
  const el = document.getElementById('calendar');
  calendar = new FullCalendar.Calendar(el, {
    locale: 'es',
    initialView: 'dayGridMonth',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: 'dayGridMonth,timeGridWeek,timeGridDay',
    },
    buttonText: { today: 'Hoy', month: 'Mes', week: 'Semana', day: 'Día' },
    firstDay: 1,
    slotMinTime: '07:00:00',
    slotMaxTime: '22:00:00',
    allDaySlot: false,
    height: 'auto',
    events: fetchEvents,
    eventClick: (info) => openEditModal(info.event),
    dateClick: (info) => openNewModal(info.dateStr),
    eventDidMount: (info) => {
      const p = info.event.extendedProps;
      info.el.title = [
        info.event.title,
        p.patient_name ? `Paciente: ${p.patient_name}` : '',
        p.notes ? `Notas: ${p.notes}` : '',
      ].filter(Boolean).join('\n');
    },
  });
  calendar.render();
}

async function fetchEvents(info, successCallback, failureCallback) {
  const { data, error } = await db
    .from('sessions')
    .select('*, patients(name)')
    .gte('start_datetime', info.startStr)
    .lte('start_datetime', info.endStr);

  if (error) { failureCallback(error); showToast('Error al cargar eventos', 'error'); return; }

  const events = (data || []).map(s => ({
    id: String(s.id),
    title: s.is_personal ? (s.title || 'Evento personal') : (s.patients?.name || s.title || 'Sesión'),
    start: s.start_datetime,
    end: s.end_datetime,
    className: getEventClass(s),
    extendedProps: {
      patient_id: s.patient_id,
      patient_name: s.patients?.name,
      is_personal: s.is_personal,
      is_recurring: s.is_recurring,
      recurrence_type: s.recurrence_type,
      parent_session_id: s.parent_session_id,
      status: s.status,
      notes: s.notes,
      title: s.title,
    },
  }));
  successCallback(events);
}

function getEventClass(s) {
  if (s.status === 'cancelled') return 'event-cancelled';
  if (s.status === 'completed') return 'event-completed';
  if (s.is_personal) return 'event-personal';
  return 'event-session';
}

// ===== Modales =====
function openNewModal(dateStr) {
  resetModal();
  document.getElementById('modal-title').textContent = 'Nueva sesión / Evento';
  document.getElementById('event-date').value = dateStr || '';
  document.getElementById('recurrence-wrap').style.display = '';
  document.getElementById('status-group').style.display = 'none';
  document.getElementById('btn-delete-event').style.display = 'none';
  showModal();
}

function openEditModal(event) {
  resetModal();
  const p = event.extendedProps;
  currentEditId = event.id;
  currentIsRecurring = p.is_recurring || p.parent_session_id;

  document.getElementById('modal-title').textContent = 'Editar sesión';
  document.getElementById('edit-session-id').value = event.id;

  if (p.is_personal) { document.getElementById('type-personal').checked = true; toggleEventType('personal'); }
  else               { document.getElementById('type-session').checked = true;  toggleEventType('session');  }

  if (p.patient_id) document.getElementById('patient-select').value = p.patient_id;
  document.getElementById('event-title').value = p.title || '';

  const start = new Date(event.start);
  const end   = new Date(event.end || event.start);
  document.getElementById('event-date').value  = start.toISOString().slice(0, 10);
  document.getElementById('event-start').value = start.toTimeString().slice(0, 5);
  document.getElementById('event-end').value   = end.toTimeString().slice(0, 5);

  document.getElementById('status-group').style.display = '';
  document.getElementById('event-status').value = p.status || 'scheduled';
  document.getElementById('recurrence-wrap').style.display = 'none';
  document.getElementById('event-notes').value = p.notes || '';
  document.getElementById('btn-delete-event').style.display = 'inline-flex';

  if (currentIsRecurring) document.getElementById('delete-options').classList.add('visible');
  showModal();
}

function resetModal() {
  currentEditId = null; currentIsRecurring = false;
  document.getElementById('event-form').reset();
  document.getElementById('edit-session-id').value = '';
  document.getElementById('recurrence-options').classList.remove('visible');
  document.getElementById('delete-options').classList.remove('visible');
  document.getElementById('btn-delete-event').style.display = 'none';
  toggleEventType('session');
}
function showModal() {
  const b = document.getElementById('event-modal');
  b.style.display = 'flex';
  setTimeout(() => b.classList.add('visible'), 10);
}
function hideModal() {
  const b = document.getElementById('event-modal');
  b.classList.remove('visible');
  setTimeout(() => { b.style.display = 'none'; }, 200);
}
function toggleEventType(type) {
  document.getElementById('patient-group').style.display = type === 'session' ? '' : 'none';
  document.getElementById('title-group').style.display   = type === 'personal' ? '' : 'none';
  const rw = document.getElementById('recurrence-wrap');
  if (rw) rw.style.display = type === 'session' ? '' : 'none';
}

// ===== Guardar =====
async function saveEvent() {
  const sessionId  = document.getElementById('edit-session-id').value;
  const isPersonal = document.querySelector('input[name="event_type"]:checked').value === 'personal';
  const patientId  = document.getElementById('patient-select').value || null;
  const title      = document.getElementById('event-title').value.trim() || null;
  const date       = document.getElementById('event-date').value;
  const startTime  = document.getElementById('event-start').value;
  const endTime    = document.getElementById('event-end').value;
  const status     = document.getElementById('event-status').value || 'scheduled';
  const isRecurring    = document.getElementById('is-recurring').checked;
  const recurrenceType = document.getElementById('recurrence-type').value;
  const recurrenceEnd  = document.getElementById('recurrence-end').value;
  const notes = document.getElementById('event-notes').value.trim() || null;

  if (!date || !startTime || !endTime) { showToast('Completá fecha y horario', 'error'); return; }
  if (!isPersonal && !patientId)       { showToast('Seleccioná un paciente', 'error'); return; }
  if (isPersonal && !title)            { showToast('Agregá un título', 'error'); return; }

  const startDatetime = `${date}T${startTime}:00`;
  const endDatetime   = `${date}T${endTime}:00`;

  const btn = document.getElementById('btn-save-event');
  btn.disabled = true;

  try {
    if (sessionId) {
      // Editar sesión existente
      const { error } = await db.from('sessions').update({
        patient_id: isPersonal ? null : patientId,
        title, start_datetime: startDatetime, end_datetime: endDatetime,
        is_personal: isPersonal, status, notes,
      }).eq('id', sessionId);
      if (error) throw error;
      showToast('Sesión actualizada', 'success');
    } else {
      // Crear nueva sesión (y recurrentes si aplica)
      await createSessions({
        patient_id: isPersonal ? null : patientId,
        title, start_datetime: startDatetime, end_datetime: endDatetime,
        is_personal: isPersonal, is_recurring: isRecurring,
        recurrence_type: isRecurring ? recurrenceType : null,
        recurrence_end_date: (isRecurring && recurrenceEnd) ? recurrenceEnd : null,
        status: 'scheduled', notes,
      });
    }
    hideModal();
    calendar.refetchEvents();
  } catch (err) {
    showToast(err.message || 'Error al guardar', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function createSessions(data) {
  // Obtener precio del paciente para los pagos
  let sessionPrice = 0;
  if (data.patient_id) {
    const { data: p } = await db.from('patients').select('session_price').eq('id', data.patient_id).single();
    if (p) sessionPrice = p.session_price;
  }

  // Construir array de sesiones
  const sessions = [];
  const baseSession = {
    patient_id: data.patient_id, title: data.title,
    start_datetime: data.start_datetime, end_datetime: data.end_datetime,
    is_personal: data.is_personal, is_recurring: data.is_recurring,
    recurrence_type: data.recurrence_type,
    recurrence_end_date: data.recurrence_end_date,
    status: data.status, notes: data.notes,
  };
  sessions.push(baseSession);

  if (data.is_recurring && data.recurrence_type && !data.is_personal) {
    const intervalDays = data.recurrence_type === 'weekly' ? 7 : 14;
    const endDate = data.recurrence_end_date
      ? new Date(data.recurrence_end_date)
      : new Date(new Date(data.start_datetime).getTime() + 365 * 24 * 60 * 60 * 1000);

    let curStart = new Date(data.start_datetime);
    let curEnd   = new Date(data.end_datetime);
    curStart.setDate(curStart.getDate() + intervalDays);
    curEnd.setDate(curEnd.getDate() + intervalDays);

    while (curStart <= endDate) {
      sessions.push({ ...baseSession, start_datetime: curStart.toISOString(), end_datetime: curEnd.toISOString() });
      curStart.setDate(curStart.getDate() + intervalDays);
      curEnd.setDate(curEnd.getDate() + intervalDays);
    }
  }

  // Insertar todas las sesiones
  const { data: created, error } = await db.from('sessions').insert(sessions).select('id');
  if (error) throw error;

  // Crear pagos pendientes si tiene paciente
  if (data.patient_id && !data.is_personal && sessionPrice > 0) {
    const payments = created.map(s => ({
      patient_id: data.patient_id, session_id: s.id,
      amount: sessionPrice, status: 'pending',
    }));
    await db.from('payments').insert(payments);
  }

  showToast(
    sessions.length > 1 ? `Se crearon ${sessions.length} sesiones` : 'Sesión creada',
    'success'
  );
}

// ===== Eliminar =====
async function deleteEvent() {
  const sessionId = document.getElementById('edit-session-id').value;
  if (!sessionId) return;

  const scope = document.querySelector('input[name="delete_scope"]:checked')?.value || 'single';
  if (!confirm(scope === 'following' ? '¿Eliminar esta sesión y todas las siguientes?' : '¿Eliminar esta sesión?')) return;

  try {
    if (scope === 'following') {
      const { data: s } = await db.from('sessions').select('start_datetime, parent_session_id').eq('id', sessionId).single();
      const parentId = s.parent_session_id || sessionId;
      await db.from('sessions').delete().or(`id.eq.${parentId},parent_session_id.eq.${parentId}`).gte('start_datetime', s.start_datetime);
    } else {
      await db.from('sessions').delete().eq('id', sessionId);
    }
    showToast('Sesión eliminada', 'success');
    hideModal();
    calendar.refetchEvents();
  } catch (err) {
    showToast('Error al eliminar', 'error');
  }
}

// ===== Listeners =====
function setupListeners() {
  document.getElementById('btn-new-event').addEventListener('click', () => openNewModal(''));
  document.getElementById('close-modal').addEventListener('click', hideModal);
  document.getElementById('btn-cancel-modal').addEventListener('click', hideModal);
  document.getElementById('btn-save-event').addEventListener('click', saveEvent);
  document.getElementById('btn-delete-event').addEventListener('click', deleteEvent);
  document.getElementById('event-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) hideModal(); });

  document.querySelectorAll('input[name="event_type"]').forEach(r =>
    r.addEventListener('change', (e) => toggleEventType(e.target.value))
  );
  document.getElementById('is-recurring').addEventListener('change', (e) => {
    document.getElementById('recurrence-options').classList.toggle('visible', e.target.checked);
  });

  // ICS import listeners
  document.getElementById('btn-import-ics').addEventListener('click', showIcsModal);
  document.getElementById('close-ics-modal').addEventListener('click', hideIcsModal);
  document.getElementById('btn-cancel-ics').addEventListener('click', hideIcsModal);
  document.getElementById('ics-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) hideIcsModal(); });
  document.getElementById('ics-file-input').addEventListener('change', handleIcsFile);
  document.getElementById('ics-skip-past').addEventListener('change', renderIcsPreview);
  document.getElementById('btn-confirm-ics').addEventListener('click', confirmIcsImport);
}

// ===== ICS Import =====
let parsedIcsEvents = [];

function showIcsModal() {
  parsedIcsEvents = [];
  document.getElementById('ics-file-input').value = '';
  document.getElementById('ics-preview-wrap').style.display = 'none';
  document.getElementById('btn-confirm-ics').disabled = true;
  const b = document.getElementById('ics-modal');
  b.style.display = 'flex';
  setTimeout(() => b.classList.add('visible'), 10);
}

function hideIcsModal() {
  const b = document.getElementById('ics-modal');
  b.classList.remove('visible');
  setTimeout(() => { b.style.display = 'none'; }, 200);
}

async function handleIcsFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  parsedIcsEvents = parseIcs(text);
  renderIcsPreview();
}

function parseIcs(text) {
  const events = [];
  const blocks = text.split('BEGIN:VEVENT');
  blocks.shift(); // quitar cabecera

  for (const block of blocks) {
    const get = (key) => {
      const regex = new RegExp(`${key}[^:]*:(.+)`, 'i');
      const match = block.match(regex);
      return match ? match[1].replace(/\r/g, '').trim() : '';
    };

    const title   = get('SUMMARY') || 'Sin título';
    const dtStart = get('DTSTART');
    const dtEnd   = get('DTEND') || get('DTSTART');
    const status  = get('STATUS');

    if (!dtStart || status === 'CANCELLED') continue;

    const start = parseIcsDate(dtStart);
    const end   = parseIcsDate(dtEnd);
    if (!start || !end) continue;

    // Si el fin es igual al inicio, agregar 1 hora
    if (end.getTime() === start.getTime()) end.setHours(end.getHours() + 1);

    events.push({ title, start, end });
  }

  // Ordenar por fecha
  return events.sort((a, b) => a.start - b.start);
}

function parseIcsDate(str) {
  if (!str) return null;
  // Formato: 20240115T100000Z o 20240115T100000 o 20240115 (all-day)
  const clean = str.replace(/[^0-9T]/g, '');
  try {
    if (clean.length === 8) {
      // All-day: YYYYMMDD → usar mediodía local
      return new Date(`${clean.slice(0,4)}-${clean.slice(4,6)}-${clean.slice(6,8)}T12:00:00`);
    }
    // Con hora: YYYYMMDDTHHMMSS
    const d = clean.replace(/T/, '');
    return new Date(
      `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T${d.slice(8,10)}:${d.slice(10,12)}:${d.slice(12,14)}${str.endsWith('Z') ? 'Z' : ''}`
    );
  } catch { return null; }
}

function renderIcsPreview() {
  const skipPast = document.getElementById('ics-skip-past').checked;
  const now      = new Date();
  const filtered = skipPast ? parsedIcsEvents.filter(e => e.start >= now) : parsedIcsEvents;

  const tbody = document.getElementById('ics-preview-body');
  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">No se encontraron eventos${skipPast ? ' futuros' : ''}.</td></tr>`;
    document.getElementById('ics-count').textContent = '0 eventos';
    document.getElementById('btn-confirm-ics').disabled = true;
    document.getElementById('ics-preview-wrap').style.display = '';
    return;
  }

  const durMin = (s, e) => {
    const m = Math.round((e - s) / 60000);
    return m < 60 ? `${m}min` : `${Math.floor(m/60)}h${m%60 ? ` ${m%60}min` : ''}`;
  };

  tbody.innerHTML = filtered.map(ev => `
    <tr>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(ev.title)}</td>
      <td>${formatDate(ev.start)}</td>
      <td>${formatTime(ev.start)} – ${formatTime(ev.end)}</td>
      <td>${durMin(ev.start, ev.end)}</td>
    </tr>`).join('');

  document.getElementById('ics-count').textContent = `${filtered.length} evento${filtered.length !== 1 ? 's' : ''} encontrado${filtered.length !== 1 ? 's' : ''}`;
  document.getElementById('btn-confirm-ics').disabled = false;
  document.getElementById('ics-preview-wrap').style.display = '';
}

async function confirmIcsImport() {
  const skipPast = document.getElementById('ics-skip-past').checked;
  const now      = new Date();
  const toImport = skipPast ? parsedIcsEvents.filter(e => e.start >= now) : parsedIcsEvents;
  if (!toImport.length) return;

  const btn = document.getElementById('btn-confirm-ics');
  btn.disabled = true;
  btn.textContent = 'Importando...';

  try {
    const sessions = toImport.map(ev => ({
      title:          ev.title,
      start_datetime: ev.start.toISOString(),
      end_datetime:   ev.end.toISOString(),
      is_personal:    true,
      is_recurring:   false,
      status:         'scheduled',
    }));

    const { error } = await db.from('sessions').insert(sessions);
    if (error) throw error;

    showToast(`${sessions.length} evento${sessions.length !== 1 ? 's' : ''} importado${sessions.length !== 1 ? 's' : ''}`, 'success');
    hideIcsModal();
    calendar.refetchEvents();
  } catch (err) {
    showToast(err.message || 'Error al importar', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Importar';
  }
}
