let allPatients = [];

(async () => {
  if (!await requireAuth()) return;
  document.getElementById('logout-btn').addEventListener('click', (e) => { e.preventDefault(); logout(); });
  await loadPatients();
  setupListeners();
})();

async function loadPatients() {
  const [{ data: patients, error }, { data: pendingPayments }] = await Promise.all([
    db.from('patients').select('*').order('name'),
    db.from('payments').select('patient_id, amount').eq('status', 'pending'),
  ]);

  if (error) { showToast('Error al cargar pacientes', 'error'); return; }

  // Calcular deuda pendiente por paciente
  const pendingMap = {};
  (pendingPayments || []).forEach(p => {
    pendingMap[p.patient_id] = (pendingMap[p.patient_id] || 0) + Number(p.amount);
  });

  allPatients = (patients || []).map(p => ({ ...p, pending_amount: pendingMap[p.id] || 0 }));
  renderPatients(allPatients);
}

function renderPatients(list) {
  const grid  = document.getElementById('patients-grid');
  const empty = document.getElementById('empty-state');
  const count = document.getElementById('patient-count');

  count.textContent = list.length === 1 ? '1 paciente' : `${list.length} pacientes`;

  if (list.length === 0) { grid.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';

  grid.innerHTML = list.map(p => {
    const initials  = p.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    const freqLabel = p.frequency === 'weekly' ? 'Semanal' : p.frequency === 'biweekly' ? 'Quincenal' : '—';
    const pending   = Number(p.pending_amount || 0);

    return `
      <div class="patient-card" onclick="window.location.href='patient.html?id=${p.id}'">
        <div class="patient-card-header">
          <div class="patient-avatar">${initials}</div>
          <div style="flex:1;">
            <div class="patient-name">${escapeHtml(p.name)}</div>
            <div class="patient-meta">${p.start_date ? `Desde ${formatDate(p.start_date)} · ` : ''}${freqLabel}</div>
          </div>
          ${pending > 0 ? `<span class="badge badge-danger">Debe ${formatMoney(pending)}</span>` : ''}
        </div>
        <div class="patient-stats">
          <div class="patient-stat">
            <div class="stat-value">${formatMoney(p.session_price)}</div>
            <div class="stat-label">Por sesión</div>
          </div>
          <div class="patient-stat ${pending > 0 ? 'pending' : ''}">
            <div class="stat-value">${formatMoney(pending)}</div>
            <div class="stat-label">Pendiente</div>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ===== Búsqueda =====
document.getElementById('search-input').addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase().trim();
  renderPatients(q ? allPatients.filter(p => p.name.toLowerCase().includes(q)) : allPatients);
});

// ===== Modal =====
function showPatientModal(patient = null) {
  document.getElementById('patient-form').reset();
  document.getElementById('p-edit-id').value = '';
  document.getElementById('btn-delete-patient').style.display = 'none';

  if (patient) {
    document.getElementById('patient-modal-title').textContent = 'Editar paciente';
    document.getElementById('p-edit-id').value      = patient.id;
    document.getElementById('p-name').value         = patient.name || '';
    document.getElementById('p-start-date').value   = patient.start_date ? patient.start_date.slice(0, 10) : '';
    document.getElementById('p-frequency').value    = patient.frequency || '';
    document.getElementById('p-price').value        = patient.session_price || '';
    document.getElementById('p-phone').value        = patient.phone || '';
    document.getElementById('p-email').value        = patient.email || '';
    document.getElementById('p-notes').value        = patient.notes || '';
    document.getElementById('btn-delete-patient').style.display = 'inline-flex';
  } else {
    document.getElementById('patient-modal-title').textContent = 'Nuevo paciente';
  }

  const b = document.getElementById('patient-modal');
  b.style.display = 'flex';
  setTimeout(() => b.classList.add('visible'), 10);
  document.getElementById('p-name').focus();
}

function hidePatientModal() {
  const b = document.getElementById('patient-modal');
  b.classList.remove('visible');
  setTimeout(() => { b.style.display = 'none'; }, 200);
}

async function savePatient() {
  const id   = document.getElementById('p-edit-id').value;
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
  };

  const btn = document.getElementById('btn-save-patient');
  btn.disabled = true;

  try {
    if (id) {
      const { error } = await db.from('patients').update(body).eq('id', id);
      if (error) throw error;
      showToast('Paciente actualizado', 'success');
    } else {
      const { data, error } = await db.from('patients').insert(body).select('id').single();
      if (error) throw error;
      // Crear historia clínica vacía
      await db.from('clinical_history').insert({ patient_id: data.id, content: '' });
      showToast('Paciente creado', 'success');
    }
    hidePatientModal();
    loadPatients();
  } catch (err) {
    showToast(err.message || 'Error al guardar', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function deletePatient() {
  const id = document.getElementById('p-edit-id').value;
  if (!id) return;
  if (!confirm('¿Eliminar este paciente? Se eliminarán también todas sus sesiones y pagos. Esta acción no se puede deshacer.')) return;

  const { error } = await db.from('patients').delete().eq('id', id);
  if (error) { showToast('Error al eliminar', 'error'); return; }
  showToast('Paciente eliminado', 'success');
  hidePatientModal();
  loadPatients();
}

function setupListeners() {
  document.getElementById('btn-new-patient').addEventListener('click', () => showPatientModal());
  document.getElementById('close-patient-modal').addEventListener('click', hidePatientModal);
  document.getElementById('btn-cancel-patient').addEventListener('click', hidePatientModal);
  document.getElementById('btn-save-patient').addEventListener('click', savePatient);
  document.getElementById('btn-delete-patient').addEventListener('click', deletePatient);
  document.getElementById('patient-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) hidePatientModal(); });
}
