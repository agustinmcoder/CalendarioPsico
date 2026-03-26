let allPatients = [];
let importData  = [];

(async () => {
  if (!await requireAuth()) return;
  document.getElementById('logout-btn').addEventListener('click', (e) => { e.preventDefault(); logout(); });
  await loadPatients();
  setupListeners();
})();

// ===== Cargar pacientes =====
async function loadPatients() {
  const [{ data: patients, error }, { data: pendingPayments }] = await Promise.all([
    db.from('patients').select('*').order('name'),
    db.from('payments').select('patient_id, amount').eq('status', 'pending'),
  ]);
  if (error) { showToast('Error al cargar pacientes', 'error'); return; }
  const pendingMap = {};
  (pendingPayments || []).forEach(p => {
    pendingMap[p.patient_id] = (pendingMap[p.patient_id] || 0) + Number(p.amount);
  });
  allPatients = (patients || []).map(p => ({ ...p, pending_amount: pendingMap[p.id] || 0 }));
  renderPatients(allPatients);
}

// ===== Render cards =====
function renderPatients(list) {
  const grid  = document.getElementById('patients-grid');
  const empty = document.getElementById('empty-state');
  document.getElementById('patient-count').textContent = list.length === 1 ? '1 paciente' : `${list.length} pacientes`;

  if (!list.length) { grid.innerHTML = ''; empty.style.display = ''; return; }
  empty.style.display = 'none';

  grid.innerHTML = list.map(p => {
    const initials  = p.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    const freqLabel = p.frequency === 'weekly' ? 'Semanal' : p.frequency === 'biweekly' ? 'Quincenal' : p.frequency === 'on_demand' ? 'A demanda' : '—';
    const pending   = Number(p.pending_amount || 0);

    return `
      <div class="patient-card" onclick="window.location.href='patient.html?id=${p.id}'">
        <button class="btn-edit-card" onclick="event.stopPropagation(); openEditModal(${p.id})" title="Editar">✏️</button>
        <div class="patient-card-header">
          <div class="patient-avatar">${initials}</div>
          <div style="flex:1;padding-right:24px;">
            <div class="patient-name">${escapeHtml(p.name)}</div>
            <div class="patient-meta" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:3px;">
              <span>${p.start_date ? `Desde ${formatDate(p.start_date)}` : ''}</span>
              <span>${freqLabel !== '—' ? `· ${freqLabel}` : ''}</span>
              ${p.pyc ? '<span class="badge badge-pyc" style="font-size:0.72rem;padding:2px 7px;">PyC</span>' : ''}
            </div>
          </div>
          ${pending > 0 ? `<span class="badge badge-danger" style="white-space:nowrap;">Debe ${formatMoney(pending)}</span>` : ''}
        </div>
        <div class="patient-stats">
          <div class="patient-stat">
            <div class="stat-value">${formatMoney(p.session_price)}</div>
            <div class="stat-label">Arancel</div>
          </div>
          <div class="patient-stat ${pending > 0 ? 'pending' : ''}">
            <div class="stat-value">${formatMoney(pending)}</div>
            <div class="stat-label">Pendiente</div>
          </div>
        </div>
      </div>`;
  }).join('');
}

// ===== Búsqueda y filtros =====
let activeFilter = 'all';

function applyFilters() {
  const q = document.getElementById('search-input').value.toLowerCase().trim();
  let list = allPatients;
  if (activeFilter === 'pyc')   list = list.filter(p => p.pyc);
  if (activeFilter === 'nopyc') list = list.filter(p => !p.pyc);
  if (q) list = list.filter(p => p.name.toLowerCase().includes(q));
  renderPatients(list);
}

document.getElementById('search-input').addEventListener('input', applyFilters);

document.querySelectorAll('[data-filter]').forEach(btn => {
  btn.addEventListener('click', () => {
    activeFilter = btn.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active-filter'));
    btn.classList.add('active-filter');
    applyFilters();
  });
});

// ===== Modal nuevo/editar =====
function showPatientModal(patient = null) {
  document.getElementById('patient-form').reset();
  document.getElementById('p-edit-id').value = '';
  document.getElementById('btn-delete-patient').style.display = 'none';
  document.getElementById('p-pyc').checked = false;

  if (patient) {
    document.getElementById('patient-modal-title').textContent = 'Editar paciente';
    document.getElementById('p-edit-id').value    = patient.id;
    document.getElementById('p-name').value       = patient.name || '';
    document.getElementById('p-start-date').value = patient.start_date?.slice(0, 10) || '';
    document.getElementById('p-frequency').value  = patient.frequency || '';
    document.getElementById('p-price').value      = patient.session_price || '';
    document.getElementById('p-phone').value      = patient.phone || '';
    document.getElementById('p-email').value      = patient.email || '';
    document.getElementById('p-notes').value      = patient.notes || '';
    document.getElementById('p-pyc').checked      = !!patient.pyc;
    document.getElementById('btn-delete-patient').style.display = 'inline-flex';
  } else {
    document.getElementById('patient-modal-title').textContent = 'Nuevo paciente';
  }

  const b = document.getElementById('patient-modal');
  b.style.display = 'flex';
  setTimeout(() => b.classList.add('visible'), 10);
  document.getElementById('p-name').focus();
}

function openEditModal(patientId) {
  const p = allPatients.find(p => p.id === patientId);
  if (p) showPatientModal(p);
}

function hidePatientModal() {
  const b = document.getElementById('patient-modal');
  b.classList.remove('visible');
  setTimeout(() => { b.style.display = 'none'; }, 200);
}

// ===== Guardar paciente =====
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
    pyc:           document.getElementById('p-pyc').checked,
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
  if (!id || !confirm('¿Eliminar este paciente? Se eliminarán también todas sus sesiones y pagos.')) return;
  const { error } = await db.from('patients').delete().eq('id', id);
  if (error) { showToast('Error al eliminar', 'error'); return; }
  showToast('Paciente eliminado', 'success');
  hidePatientModal();
  loadPatients();
}

// ===== Import Excel =====
function showImportModal() {
  importData = [];
  document.getElementById('excel-file-input').value = '';
  document.getElementById('import-preview-wrap').style.display = 'none';
  document.getElementById('btn-confirm-import').disabled = true;
  const b = document.getElementById('import-modal');
  b.style.display = 'flex';
  setTimeout(() => b.classList.add('visible'), 10);
}

function hideImportModal() {
  const b = document.getElementById('import-modal');
  b.classList.remove('visible');
  setTimeout(() => { b.style.display = 'none'; }, 200);
}

document.getElementById('excel-file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const buffer = await file.arrayBuffer();
  const wb     = XLSX.read(buffer, { type: 'array', cellDates: true });
  const ws     = wb.Sheets[wb.SheetNames[0]];
  const rows   = XLSX.utils.sheet_to_json(ws, { defval: '' });

  importData = rows.map(row => {
    // Normalizar claves (ignorar mayúsculas/minúsculas y espacios)
    const get = (...keys) => {
      for (const k of keys) {
        const found = Object.keys(row).find(rk => rk.trim().toLowerCase() === k.toLowerCase());
        if (found !== undefined) return String(row[found]).trim();
      }
      return '';
    };

    const nombre   = get('nombre');
    const apellido = get('apellido');
    const name     = [nombre, apellido].filter(Boolean).join(' ');
    const freq     = get('frecuencia').toLowerCase();
    const frequency = freq.includes('semanal') ? 'weekly' : freq.includes('quincenal') ? 'biweekly' : freq.includes('demanda') ? 'on_demand' : null;
    const price    = parseFloat(get('arancel').replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
    const pyc      = get('pyc', 'p y c', 'pyc').toLowerCase() === 'si';
    const rawDate  = get('fecha de inicio', 'fecha inicio', 'inicio');
    let start_date = null;
    if (rawDate) {
      // Intentar parsear DD/MM/AAAA o AAAA-MM-DD
      const parts = rawDate.split(/[\/\-]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) start_date = rawDate; // AAAA-MM-DD
        else start_date = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`; // DD/MM/AAAA
      }
    }

    return { name, frequency, session_price: price, pyc, start_date };
  }).filter(r => r.name.length > 1);

  // Preview
  const tbody = document.getElementById('import-preview-body');
  tbody.innerHTML = importData.map(r => `
    <tr>
      <td>${escapeHtml(r.name)}</td>
      <td>${r.frequency === 'weekly' ? 'Semanal' : r.frequency === 'biweekly' ? 'Quincenal' : r.frequency === 'on_demand' ? 'A demanda' : '—'}</td>
      <td>${formatMoney(r.session_price)}</td>
      <td>${r.pyc ? '<span class="badge badge-pyc">Sí</span>' : '—'}</td>
      <td>${r.start_date ? formatDate(r.start_date) : '—'}</td>
    </tr>`).join('');

  document.getElementById('import-count').textContent = `${importData.length} paciente${importData.length !== 1 ? 's' : ''} encontrado${importData.length !== 1 ? 's' : ''}`;
  document.getElementById('import-preview-wrap').style.display = '';
  document.getElementById('btn-confirm-import').disabled = importData.length === 0;
});

async function confirmImport() {
  if (!importData.length) return;
  const btn = document.getElementById('btn-confirm-import');
  btn.disabled = true;
  btn.textContent = 'Importando...';

  try {
    // Obtener nombres existentes para evitar duplicados
    const { data: existing } = await db.from('patients').select('name');
    const existingNames = new Set((existing || []).map(p => p.name.toLowerCase()));
    const toInsert = importData.filter(p => !existingNames.has(p.name.toLowerCase()));

    if (!toInsert.length) { showToast('Todos los pacientes ya existen', 'info'); hideImportModal(); return; }

    const { data: inserted, error } = await db.from('patients').insert(toInsert).select('id');
    if (error) throw error;

    // Crear historias clínicas vacías
    if (inserted?.length) {
      await db.from('clinical_history').insert(inserted.map(p => ({ patient_id: p.id, content: '' })));
    }

    const skipped = importData.length - toInsert.length;
    showToast(`${toInsert.length} paciente${toInsert.length !== 1 ? 's' : ''} importado${toInsert.length !== 1 ? 's' : ''}${skipped ? ` (${skipped} omitido${skipped !== 1 ? 's' : ''} por duplicado)` : ''}`, 'success');
    hideImportModal();
    loadPatients();
  } catch (err) {
    showToast(err.message || 'Error al importar', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Importar';
  }
}

// ===== Listeners =====
function setupListeners() {
  document.getElementById('btn-new-patient').addEventListener('click', () => showPatientModal());
  document.getElementById('close-patient-modal').addEventListener('click', hidePatientModal);
  document.getElementById('btn-cancel-patient').addEventListener('click', hidePatientModal);
  document.getElementById('btn-save-patient').addEventListener('click', savePatient);
  document.getElementById('btn-delete-patient').addEventListener('click', deletePatient);
  document.getElementById('patient-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) hidePatientModal(); });

  document.getElementById('btn-import-excel').addEventListener('click', showImportModal);
  document.getElementById('close-import-modal').addEventListener('click', hideImportModal);
  document.getElementById('btn-cancel-import').addEventListener('click', hideImportModal);
  document.getElementById('btn-confirm-import').addEventListener('click', confirmImport);
  document.getElementById('import-modal').addEventListener('click', (e) => { if (e.target === e.currentTarget) hideImportModal(); });
}
