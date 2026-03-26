(async () => {
  if (!await requireAuth()) return;
  document.getElementById('logout-btn').addEventListener('click', (e) => { e.preventDefault(); logout(); });
  buildMonthSelector();
  document.getElementById('month-select').addEventListener('change', loadReport);
  await loadReport();
})();

// ===== Selector de mes =====
function buildMonthSelector() {
  const select = document.getElementById('month-select');
  const now    = new Date();
  for (let i = 0; i < 12; i++) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const opt = document.createElement('option');
    opt.value = val;
    opt.textContent = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    if (i === 0) opt.selected = true;
    select.appendChild(opt);
  }
}

// ===== Cargar reporte =====
async function loadReport() {
  const monthVal  = document.getElementById('month-select').value; // "YYYY-MM"
  const [year, month] = monthVal.split('-').map(Number);

  const start     = new Date(year, month - 1, 1);
  const end       = new Date(year, month, 0, 23, 59, 59); // último día del mes
  const prevStart = new Date(year, month - 2, 1);
  const prevEnd   = new Date(year, month - 1, 0, 23, 59, 59);

  const fmt = d => d.toISOString();

  // Traer todo en paralelo
  const [
    { data: sessions },
    { data: prevSessions },
    { data: payments },
    { data: prevPayments },
    { data: patients },
    { data: chartPayments },
  ] = await Promise.all([
    db.from('sessions').select('*, patients(name, pyc)').gte('start_datetime', fmt(start)).lte('start_datetime', fmt(end)).neq('is_personal', true),
    db.from('sessions').select('id, status, patient_id').gte('start_datetime', fmt(prevStart)).lte('start_datetime', fmt(prevEnd)).neq('is_personal', true),
    db.from('payments').select('*, sessions(start_datetime)').gte('sessions.start_datetime', fmt(start)).lte('sessions.start_datetime', fmt(end)),
    db.from('payments').select('amount, status').gte('created_at', fmt(prevStart)).lte('created_at', fmt(prevEnd)),
    db.from('patients').select('id, name, pyc, created_at'),
    db.from('payments').select('amount, status, created_at').eq('status', 'paid').gte('created_at', new Date(year, month - 7, 1).toISOString()),
  ]);

  // Pagos del mes actual: filtrar los que tienen sesión en ese mes
  const monthPayments = (payments || []).filter(p => {
    if (!p.sessions?.start_datetime) return false;
    const d = new Date(p.sessions.start_datetime);
    return d >= start && d <= end;
  });

  renderReport({ sessions, prevSessions, monthPayments, prevPayments, patients, chartPayments, start, end, prevStart, prevEnd, monthVal });
}

// ===== Render =====
function renderReport({ sessions, prevSessions, monthPayments, prevPayments, patients, chartPayments, start, end, prevStart, prevEnd, monthVal }) {
  const s  = sessions     || [];
  const ps = prevSessions || [];
  const p  = monthPayments || [];
  const pp = prevPayments  || [];
  const al = patients      || [];

  // ── Sesiones ──
  const totalSessions    = s.filter(x => x.status !== 'cancelled').length;
  const cancelledSessions = s.filter(x => x.status === 'cancelled').length;
  const prevTotal        = ps.filter(x => x.status !== 'cancelled').length;

  // ── Cobros ──
  const totalCobrado     = p.filter(x => x.status === 'paid').reduce((acc, x) => acc + Number(x.amount), 0);
  const totalPendiente   = p.filter(x => x.status === 'pending').reduce((acc, x) => acc + Number(x.amount), 0);
  const prevCobrado      = pp.filter(x => x.status === 'paid').reduce((acc, x) => acc + Number(x.amount), 0);

  // ── PyC ──
  const pycSessions = s.filter(x => x.status !== 'cancelled' && x.patients?.pyc);
  const pycBruto    = p.filter(x => x.status === 'paid' && x.sessions).reduce((acc, x) => {
    const sess = s.find(ss => ss.id === x.session_id);
    return acc + (sess?.patients?.pyc ? Number(x.amount) : 0);
  }, 0);
  const pycPago     = pycBruto * 0.30;
  const pycNeto     = pycBruto * 0.70;

  // ── Pacientes activos ese mes ──
  const activePatientIds = new Set(s.filter(x => x.status !== 'cancelled').map(x => x.patient_id).filter(Boolean));
  const activeCount      = activePatientIds.size;
  const prevActiveIds    = new Set(ps.filter(x => x.status !== 'cancelled').map(x => x.patient_id).filter(Boolean));
  const prevActiveCount  = prevActiveIds.size;

  // ── Pacientes nuevos ──
  const newPatients = al.filter(pt => {
    const d = new Date(pt.created_at);
    return d >= start && d <= end;
  });

  // ── Pacientes sin sesión ese mes (de los activos en el sistema) ──
  const noSessionPatients = al.filter(pt => !activePatientIds.has(pt.id));

  // ── Gráfico últimos 6 meses ──
  const [selYear, selMonth] = monthVal.split('-').map(Number);
  const chartMonths = [];
  for (let i = 5; i >= 0; i--) {
    const d   = new Date(selYear, selMonth - 1 - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    chartMonths.push({ key, label: d.toLocaleDateString('es-AR', { month: 'short' }), value: 0, isCurrent: i === 0 });
  }
  (chartPayments || []).forEach(cp => {
    const d   = new Date(cp.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const entry = chartMonths.find(m => m.key === key);
    if (entry) entry.value += Number(cp.amount);
  });
  const maxVal = Math.max(...chartMonths.map(m => m.value), 1);

  // ── Render HTML ──
  document.getElementById('report-body').innerHTML = `

    <!-- KPIs principales -->
    <div class="kpi-grid">
      ${kpi('Sesiones realizadas', totalSessions, totalSessions - prevTotal, false)}
      ${kpi('Sesiones canceladas', cancelledSessions, null, false)}
      ${kpi('Total cobrado', formatMoney(totalCobrado), totalCobrado - prevCobrado, true)}
      ${kpi('Pendiente de cobro', formatMoney(totalPendiente), null, false)}
      ${kpi('Pacientes activos', activeCount, activeCount - prevActiveCount, false)}
      ${kpi('Pacientes nuevos', newPatients.length, null, false)}
    </div>

    <!-- Gráfico -->
    <div class="chart-wrap">
      <div class="chart-title">Ingresos cobrados — últimos 6 meses</div>
      <div class="bar-chart">
        ${chartMonths.map(m => `
          <div class="bar-col">
            <div class="bar-amount">${m.value > 0 ? formatMoney(m.value) : ''}</div>
            <div class="bar-fill ${m.isCurrent ? 'current' : ''}" style="height:${Math.round((m.value / maxVal) * 120) + 4}px;"></div>
            <div class="bar-label">${m.label}</div>
          </div>`).join('')}
      </div>
    </div>

    <!-- PyC -->
    ${pycSessions.length > 0 ? `
    <div class="pyc-section">
      <h3>🔵 Detalle PyC</h3>
      <div class="pyc-grid">
        <div class="pyc-stat"><div class="stat-label">Sesiones PyC</div><div class="stat-value">${pycSessions.length}</div></div>
        <div class="pyc-stat"><div class="stat-label">Cobrado bruto</div><div class="stat-value">${formatMoney(pycBruto)}</div></div>
        <div class="pyc-stat"><div class="stat-label">Pago al grupo (30%)</div><div class="stat-value">- ${formatMoney(pycPago)}</div></div>
        <div class="pyc-stat"><div class="stat-label">Neto real</div><div class="stat-value">${formatMoney(pycNeto)}</div></div>
      </div>
    </div>` : ''}

    <!-- Pacientes nuevos + sin sesión -->
    <div class="section-grid">
      <div class="card">
        <div class="card-header">
          <span class="card-title">Pacientes nuevos este mes</span>
          <span class="badge badge-success">${newPatients.length}</span>
        </div>
        ${newPatients.length ? `
        <ul class="patient-list-report">
          ${newPatients.map(pt => `
            <li>
              <a href="patient.html?id=${pt.id}" style="font-weight:500;">${escapeHtml(pt.name)}</a>
              ${pt.pyc ? '<span class="badge" style="background:#EAF0FB;color:#3B62B0;border:1px solid #C5D5F5;font-size:0.7rem;">PyC</span>' : ''}
            </li>`).join('')}
        </ul>` : '<p class="empty-list">Ningún paciente nuevo este mes.</p>'}
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Sin sesión este mes</span>
          <span class="badge badge-neutral">${noSessionPatients.length}</span>
        </div>
        ${noSessionPatients.length ? `
        <ul class="patient-list-report">
          ${noSessionPatients.slice(0, 10).map(pt => `
            <li>
              <a href="patient.html?id=${pt.id}" style="font-weight:500;">${escapeHtml(pt.name)}</a>
              <span style="font-size:0.78rem;color:var(--text-muted);">${pt.frequency === 'on_demand' ? 'A demanda' : ''}</span>
            </li>`).join('')}
          ${noSessionPatients.length > 10 ? `<li style="color:var(--text-muted);font-size:0.82rem;">...y ${noSessionPatients.length - 10} más</li>` : ''}
        </ul>` : '<p class="empty-list">Todos los pacientes tuvieron sesión.</p>'}
      </div>
    </div>
  `;
}

// ── Helper KPI ──
function kpi(label, value, delta, isMoney) {
  let deltaHtml = '';
  if (delta !== null && delta !== undefined) {
    const abs   = Math.abs(delta);
    const sign  = delta > 0 ? '+' : delta < 0 ? '−' : '';
    const cls   = delta > 0 ? 'up' : delta < 0 ? 'down' : 'same';
    const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '→';
    const shown = isMoney ? formatMoney(abs) : abs;
    deltaHtml = delta !== 0
      ? `<div class="kpi-delta ${cls}">${arrow} ${sign}${shown} vs mes anterior</div>`
      : `<div class="kpi-delta same">→ igual que el mes anterior</div>`;
  }
  return `
    <div class="kpi-card">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
      ${deltaHtml}
    </div>`;
}
