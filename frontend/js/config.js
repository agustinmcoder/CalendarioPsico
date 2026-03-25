// ============================================================
// CONFIGURACIÓN DE SUPABASE
// Reemplazá estos dos valores con los de tu proyecto
// Los encontrás en: Supabase > Settings > API
// ============================================================
const SUPABASE_URL  = 'https://mxhrndugslwhrkcxtniw.supabase.co';
const SUPABASE_ANON = 'sb_publishable_mB_Xcm0yi3YTE49-Fvw3Bw_7O3hkbXt';

// Inicializar cliente de Supabase
const { createClient } = window.supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

// ===== Auth helpers =====
async function requireAuth() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    window.location.href = 'index.html';
    return false;
  }
  return true;
}

async function logout() {
  await db.auth.signOut();
  window.location.href = 'index.html';
}

// ===== Toast notifications =====
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = '0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ===== Formatters =====
function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}
function formatTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}
function formatMoney(amount) {
  if (amount === null || amount === undefined) return '$0';
  return '$' + Number(amount).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function formatMonthYear(monthStr) {
  if (!monthStr) return '—';
  const [year, month] = monthStr.split('-');
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
}
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}
