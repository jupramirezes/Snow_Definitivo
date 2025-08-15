// ============ FUNCIONES DE SINCRONIZACIÓN Y UI ============
// Funciones para mantener la interfaz sincronizada con la base de datos

// Función para limpiar cache de inventarios
function clearInventoryCache() {
  const date = getSelectedDate();
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('inventory_') && !key.includes(date)) {
      localStorage.removeItem(key);
    }
  });
}

// Función universal de refresh
async function refreshAllUI() {
  console.log('🔄 Refrescando toda la interfaz...');
  try {
    await Promise.all([
      renderVentas(),
      updateDashboard(),
      loadComprasDelDia(),
      loadGastosDelDia()
    ]);
    console.log('✅ Interfaz actualizada completamente');
  } catch (error) {
    console.error('❌ Error actualizando interfaz:', error);
  }
}

// Funciones para cargar listas específicas
async function loadComprasDelDia() {
  const date = getSelectedDate();
  const data = await getDashboardData(date);
  
  const comprasHTML = data.purchases.map(p => `
    <div class="d-flex justify-content-between align-items-center p-2 border-bottom">
      <div>
        <strong>${p.products?.name || 'Producto'}</strong> x${p.qty}
        <br><small class="text-muted">${p.notes || ''}</small>
      </div>
      <div class="text-end">
        <div>${money(p.qty * p.unit_cost)}</div>
        <div class="small">
          <span class="text-danger" style="cursor:pointer" onclick="deletePurchase('${p.id}')">Borrar</span>
        </div>
      </div>
    </div>
  `).join('');
  
  const container = document.getElementById('comprasDelDia');
  if (container) {
    container.innerHTML = comprasHTML || '<div class="text-muted">Sin compras registradas</div>';
  }
}

async function loadGastosDelDia() {
  const date = getSelectedDate();
  const data = await getDashboardData(date);
  
  const gastosHTML = data.expenses.map(e => `
    <div class="d-flex justify-content-between align-items-center p-2 border-bottom">
      <div>
        <strong>${e.concept}</strong> (${e.type})
        <br><small class="text-muted">${e.attributed_to || ''}</small>
      </div>
      <div class="text-end">
        <div>${money(e.amount)}</div>
        <div class="small">
          <span class="text-danger" style="cursor:pointer" onclick="deleteExpense('${e.id}')">Borrar</span>
        </div>
      </div>
    </div>
  `).join('');
  
  const container = document.getElementById('gastosDelDia');
  if (container) {
    container.innerHTML = gastosHTML || '<div class="text-muted">Sin gastos registrados</div>';
  }
}

// Función para actualizar vista de cierres activa
function refreshActiveClosureView() {
  const activeContainer = document.querySelector('.cierre-container.active');
  if (!activeContainer) return;
  
  const containerId = activeContainer.id;
  
  switch(containerId) {
    case 'cierre-diario-container':
      if (typeof actualizarEfectivoEsperado === 'function') {
        actualizarEfectivoEsperado();
      }
      break;
    case 'cierre-semanal-container':
      if (typeof recalcularCierreSemanal === 'function') {
        recalcularCierreSemanal();
      }
      break;
  }
}

// Funciones de navegación
const goto = (id) => ['home','mesero','pos','socios','admin'].forEach(s=>document.getElementById(s).hidden=(s!==id));

// Funciones para manejo de cierres
function mostrarCierre(tipo) {
  // Ocultar todos los containers
  document.querySelectorAll('.cierre-container').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.nav-cierre-btn').forEach(btn => btn.classList.remove('active'));
  
  // Mostrar el seleccionado
  document.getElementById(`${tipo}-container`).classList.add('active');
  document.querySelector(`[onclick="mostrarCierre('${tipo}')"]`).classList.add('active');
  
  // Cargar vista correspondiente
  setTimeout(() => {
    if (tipo === 'diario') {
      cargarCierreDiario();
    } else if (tipo === 'semanal') {
      cargarCierreSemanal();
    } else if (tipo === 'administracion') {
      cargarVistaAdministracion();
    }
  }, 100);
}

// Hacer funciones disponibles globalmente
window.refreshAllUI = refreshAllUI;
window.clearInventoryCache = clearInventoryCache;
window.refreshActiveClosureView = refreshActiveClosureView;
window.goto = goto;
window.mostrarCierre = mostrarCierre;
window.loadComprasDelDia = loadComprasDelDia;
window.loadGastosDelDia = loadGastosDelDia;