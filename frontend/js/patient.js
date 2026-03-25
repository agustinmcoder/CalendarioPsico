const params    = new URLSearchParams(window.location.search);
const patientId = params.get('id');
if (!patientId) { window.location.href = 'patients.html'; }

let patient  = null;
let quill    = null;
let saveTimeout = null;
let sessionsData = [];

(async () => {
  if (!await requireAuth()) return;
  document.getElementById('logout-btn').addEventListener('click', (e) => { e.preventDefault(); logout(); });
  initQuill();
  await loadPatient();
  setupListeners();
})();

// ===== Quill =====
function initQuill() {
  quill = new Quill('#quill-editor', {
    theme: 'snow',
    placeholder: 'Escribí o pegá la historia clínica aquí...',
    modules: {
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ['bold', 'italic', 'underline'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['blockquote'], ['clean'],
      ],
    },
  });
  quill.on('text-change', () => {
    clearTimeout(saveTimeout);
    showSavingIndicator(true);
    saveTimeout = setTimeout(saveHistory, 2000);
  });
}

// ===== Cargar datos =====
async function loadPatient() {
  const { data, error } = await db.from('patients').select('*').eq('id', patientId).single();
  if (error || !data) { showToast('Paciente no encontrado', 'error'); window.location.href = 'patients.html'; return; }
  patient = data;
  renderPatientInfo();
  document.getElementById('patient-name-header').textContent = patient.name;
  document.title = `Psico Agenda — ${patient.name}`;
  await Promise.all([loadHistory(), loadSessions(), loadMonthly()]);
}

function renderPatientInfo() {
  const freqLabel = patient.frequency === 'weekly' ? 'Semanal' : patient.frequency === 'biweekly' ? 'Quincenal' : patient.frequency === 'on_demand' ? 'A demanda' : '—';
  document.getElementById('patient-info-grid').innerHTML = `
    <div class="info-block">
      <div class="info-label">Nombre</div>
      <div class="info-value" style="display:flex;align-items:center;gap:8px;">
        ${escapeHtml(patient.name)}
        ${patient.pyc ? '<span class="badge" style="background:#EAF0FB;color:#3B62B0;border:1px solid #C5D5F5;font-size:0.72rem;">PyC</span>' : ''}
      </div>
    </div>
    <div class="info-block"><div class="info-label">Inicio tratamiento</div><div class="info-value">${patient.start_date ? formatDate(patient.start_date) : '—'}</div></div>
    <div class="info-block"><div class="info-label">Frecuencia</div><div class="info-value">${freqLabel}</div></div>
    <div class="info-block"><div class="info-label">Arancel</div><div class="info-value">${formatMoney(patient.session_price)}</div></div>
    ${patient.pyc ? `<div class="info-block"><div class="info-label">Neto (70%)</div><div class="info-value" style="color:#3B62B0;">${formatMoney(patient.session_price * 0.7)}</div></div>` : ''}
    ${patient.phone ? `<div class="info-block"><div class="info-label">Teléfono</div><div class="info-value">${escapeHtml(patient.phone)}</div></div>` : ''}
    ${patient.email ? `<div class="info-block"><div class="info-label">Email</div><div class="info-value">${escapeHtml(patient.email)}</div></div>` : ''}
    ${patient.notes ? `<div class="info-block" style="grid-column:1/-1;"><div class="info-label">Notas</div><div class="info-value" style="font-weight:400;font-size:.88rem;">${escapeHtml(patient.notes)}</div></div>` : ''}
  `;
}

// ===== Historia clínica =====
async function loadHistory() {
  const { data } = await db.from('clinical_history').select('content').eq('patient_id', patientId).single();
  if (data?.content) { quill.clipboard.dangerouslyPasteHTML(data.content); quill.history.clear(); }
}

async function saveHistory() {
  const content = quill.root.innerHTML;
  const { error } = await db.from('clinical_history')
    .upsert({ patient_id: patientId, content, updated_at: new Date().toISOString() }, { onConflict: 'patient_id' });
  showSavingIndicator(!error);
  if (error) showToast('Error al guardar historia', 'error');
}

function showSavingIndicator(saved) {
  const el = document.getElementById('saving-indicator');
  if (!saved) {
    el.innerHTML = '<span class="spinner" style="width:14px;height:14px;"></span> Guardando...';
    el.style.color = '';
    el.classList.add('visible');
  } else {
    el.innerHTML = '✓ Guardado';
    el.style.color = 'var(--success)';
    el.classList.add('visible');
    setTimeout(() => {
      el.classList.remove('visible');
      setTimeout(() => { el.innerHTML = '<span class="spinner" style="width:14px;height:14px;"></span> Guardando...'; el.style.color = ''; }, 300);
    }, 2000);
  }
}

// ===== Importar/Exportar .docx =====
document.getElementById('btn-import-docx').addEventListener('click', () => document.getElementById('docx-file-input').click());

document.getElementById('docx-file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    if (confirm('¿Reemplazar el contenido actual con el archivo importado?')) {
      quill.clipboard.dangerouslyPasteHTML(result.value);
      showToast('Archivo importado', 'success');
    }
  } catch { showToast('Error al importar el archivo', 'error'); }
  e.target.value = '';
});

document.getElementById('btn-export-docx').addEventListener('click', () => {
  try {
    const html  = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${quill.root.innerHTML}</body></html>`;
    const blob  = typeof htmlDocx !== 'undefined' ? htmlDocx.asBlob(html) : new Blob([html], { type: 'text/html;charset=utf-8' });
    const ext   = typeof htmlDocx !== 'undefined' ? '.docx' : '.html';
    const name  = `historia_${patient?.name?.replace(/\s+/g, '_') || patientId}_${new Date().toISOString().slice(0, 10)}${ext}`;
    const url   = URL.createObjectURL(blob);
    const a     = Object.assign(document.createElement('a'), { href: url, download: name });
    a.click();
    URL.revokeObjectURL(url);
    showToast('Archivo exportado', 'success');
  } catch { showToast('Error al exportar', 'error'); }
});

// ===== Sesiones =====
async function loadSessions() {
  const [{ data: sessions }, { data: payments }] = await Promise.all([
    db.from('sessions').select('*').eq('patient_id', patientId).order('start_datetime', { ascending: false }),
    db.from('payments').select('*').eq('patient_id', patientId),
  ]);

  // Merge: agregar info de pago a cada sesión
  const payBySession = {};
  (payments || []).forEach(p => { if (p.session_id) payBySession[p.session_id] = p; });

  sessionsData = (sessions || []).map(s => ({ ...s, payment: payBySession[s.id] || null }));
  renderSessions();
}

function renderSessions() {
  const tbody = document.getElementById('sessions-tbody');
  if (!sessionsData.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px;">No hay sesiones registradas.</td></tr>`;
    return;
  }

  tbody.innerHTML = sessionsData.map(s => {
    const statusBadge = { scheduled: '<span class="badge badge-neutral">Programada</span>', completed: '<span class="badge badge-success">Realizada</span>', cancelled: '<span class="badge badge-danger">Cancelada</span>' }[s.status] || '';
    const pay = s.payment;
    const payBadge = pay?.status === 'paid' ? '<span class="badge badge-success">Pagado</span>' : '<span class="badge badge-warning">Pendiente</span>';
    const rowClass = pay?.status === 'paid' ? 'payment-row-paid' : '';

    return `<tr class="${rowClass}">
      <td>${formatDate(s.start_datetime)}</td>
      <td>${formatTime(s.start_datetime)} – ${formatTime(s.end_datetime)}</td>
      <td>${statusBadge}</td>
      <td>${formatMoney(pay?.amount ?? patient?.session_price ?? 0)}</td>
      <td>${pay ? payBadge : '<span class="badge badge-neutral">Sin registro</span>'}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="openPaymentModal('${s.id}')">
        ${pay ? 'Editar pago' : 'Registrar pago'}
      </button></td>
    </tr>`;
  }).join('');
}

// ===== Pago modal =====
function openPaymentModal(sessionId) {
  const session = sessionsData.find(s => String(s.id) === String(sessionId));
  if (!session) return;

  document.getElementById('payment-form').reset();
  document.getElementById('pay-id').value = session.payment?.id || '';
  document.getElementById('payment-session-info').textContent = formatDateTime(session.start_datetime);
  document.getElementById('pay-amount').value = session.payment?.amount ?? patient?.session_price ?? 0;
  document.getElementById('pay-status').value = session.payment?.status || 'paid';
  if (!session.payment) document.getElementById('pay-date').value = new Date().toISOString().slice(0, 10);
  document.getElementById('btn-save-payment').dataset.sessionId = sessionId;

  const b = document.getElementById('payment-modal');
  b.style.display = 'flex';
  setTimeout(() => b.classList.add('visible'), 10);
}

function hidePaymentModal() {
  const b = document.getElementById('payment-modal');
  b.classList.remove('visible');
  setTimeout(() => { b.style.display = 'none'; }, 200);
}

async function savePayment() {
  const paymentId = document.getElementById('pay-id').value;
  const sessionId = document.getElementById('btn-save-payment').dataset.sessionId;
  const amount    = parseFloat(document.getElementById('pay-amount').value) || 0;
  const status    = document.getElementById('pay-status').value;
  const payDate   = document.getElementById('pay-date').value || null;
  const notes     = document.getElementById('pay-notes').value.trim() || null;

  const btn = document.getElementById('btn-save-payment');
  btn.disabled = true;

  try {
    if (paymentId) {
      const { error } = await db.from('payments').update({ amount, status, payment_date: payDate, notes }).eq('id', paymentId);
      if (error) throw error;
    } else {
      const { error } = await db.from('payments').insert({ patient_id: patientId, session_id: sessionId, amount, status, payment_date: payDate, notes });
      if (error) throw error;
    }
    showToast('Pago guardado', 'success');
    hidePaymentModal();
    await Promise.all([loadSessions(), loadMonthly()]);
  } catch (err) {
    showToast(err.message || 'Error al guardar pago', 'error');
  } finally {
    btn.disabled = false;
  }
}

// ===== Resumen mensual =====
async function loadMonthly() {
  const { data, error } = await db.rpc('get_monthly_summary', { p_patient_id: patientId });
  if (error) { showToast('Error al cargar resumen mensual', 'error'); return; }
  renderMonthly(data || []);
}

function renderMonthly(data) {
  const container = document.getElementById('monthly-summary');
  const empty     = document.getElementById('monthly-empty');
  if (!data.length) { container.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';
  container.innerHTML = data.map(m => `
    <div class="month-card">
      <h4>${formatMonthYear(m.month)}</h4>
      <div class="month-stat"><span>Sesiones</span><strong>${m.session_count}</strong></div>
      <div class="month-stat"><span>Facturado</span><strong>${formatMoney(m.total_billed)}</strong></div>
      <div class="month-stat paid"><span>Cobrado</span><strong>${formatMoney(m.total_paid)}</strong></div>
      <div class="month-stat pending"><span>Pendiente</span><strong>${formatMoney(m.total_pending)}</strong></div>
      ${patient?.pyc ? `
      <div style="border-top:1px solid var(--border);margin-top:8px;padding-top:8px;">
        <div class="month-stat" style="color:#3B62B0;"><span>Pago al grupo (30%)</span><strong style="color:#3B62B0;">- ${formatMoney(m.total_paid * 0.3)}</strong></div>
        <div class="month-stat" style="font-weight:600;"><span>Neto final</span><strong>${formatMoney(m.total_paid * 0.7)}</strong></div>
      </div>` : ''}
    </div>`).join('');
}

// ===== Editar paciente =====
function openEditModal() {
  if (!patient) return;
  document.getElementById('p-name').value       = patient.name || '';
  document.getElementById('p-start-date').value  = patient.start_date?.slice(0, 10) || '';
  document.getElementById('p-frequency').value   = patient.frequency || '';
  document.getElementById('p-price').value       = patient.session_price || '';
  document.getElementById('p-phone').value       = patient.phone || '';
  document.getElementById('p-email').value       = patient.email || '';
  document.getElementById('p-notes').value       = patient.notes || '';
  document.getElementById('p-pyc').checked       = !!patient.pyc;
  const b = document.getElementById('patient-modal');
  b.style.display = 'flex';
  setTimeout(() => b.classList.add('visible'), 10);
}
function hidePatientModal() {
  const b = document.getElementById('patient-modal');
  b.classList.remove('visible');
  setTimeout(() => { b.style.display = 'none'; }, 200);
}
async function savePatient() {
  const name = document.getElementById('p-name').value.trim();
  if (!name) { showToast('El nombre es requerido', 'error'); return; }
  const body = {
    name,
    start_date:    document.getElementById('p-start-date').value || null,
    frequency:     document.getElementById('p-frequency').value || null,
    session_price: parseFloat(document.getElementById('p-price').value) || 0,
    phone:         document.getElementById('p-phone').value.trim() || null,
    email:         document.getElementById('p-email').value.trim() || null,
    notes:         document.getElementById('p-notes').value.trim() || null,
    pyc:           document.getElementById('p-pyc').checked,
  };
  const btn = document.getElementById('btn-save-patient');
  btn.disabled = true;
  try {
    const { data, error } = await db.from('patients').update(body).eq('id', patientId).select().single();
    if (error) throw error;
    patient = data;
    renderPatientInfo();
    document.getElementById('patient-name-header').textContent = patient.name;
    document.title = `Psico Agenda — ${patient.name}`;
    showToast('Datos actualizados', 'success');
    hidePatientModal();
  } catch (err) {
    showToast(err.message || 'Error al guardar', 'error');
  } finally {
    btn.disabled = false;
  }
}

// ===== Tabs =====
function setupListeners() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
  document.getElementById('btn-edit-patient').addEventListener('click', openEditModal);
  document.getElementById('close-patient-modal').addEventListener('click', hidePatientModal);
  document.getElementById('btn-cancel-patient').addEventListener('click', hidePatientModal);
  document.getElementById('btn-save-patient').addEventListener('click', savePatient);
  document.getElementById('patient-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) hidePatientModal(); });
  document.getElementById('close-payment-modal').addEventListener('click', hidePaymentModal);
  document.getElementById('btn-cancel-payment').addEventListener('click', hidePaymentModal);
  document.getElementById('btn-save-payment').addEventListener('click', savePayment);
  document.getElementById('payment-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) hidePaymentModal(); });
}
