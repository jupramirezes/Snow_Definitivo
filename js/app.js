// ============ APP.JS - DASHBOARD Y VENTAS ============
// Funciones principales de la aplicación: dashboard, ventas e inventario

// ============ DASHBOARD ============

async function updateDashboard() {
  try {
    const date = getSelectedDate();
    const dashData = await getDashboardData(date);
    
    // KPIs principales
    const kpisContainer = document.getElementById('dashboardKPIs');
    if (!kpisContainer) return;
    
    kpisContainer.innerHTML = `
      <div class="col-6 col-md-3">
        <div class="kpi-card">
          <div class="kpi-value">${money(dashData.totalVentas)}</div>
          <div class="kpi-label">Ventas del día</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="kpi-card">
          <div class="kpi-value">${money(dashData.totalGastos)}</div>
          <div class="kpi-label">Gastos del día</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="kpi-card">
          <div class="kpi-value">${money(dashData.totalVentas - dashData.totalGastos)}</div>
          <div class="kpi-label">Ganancia bruta</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="kpi-card">
          <div class="kpi-value">${dashData.ventasCount || 0}</div>
          <div class="kpi-label">N° Ventas</div>
        </div>
      </div>
    `;

    console.log('📊 Dashboard actualizado:', dashData);
  } catch(e) {
    console.error('Error updating dashboard:', e);
  }
}

// ============ VENTAS ============

async function renderVentas(){
  try {
    const date = getSelectedDate();
    const ventas = await getSales(date);
    
    const container = document.getElementById('ventasList');
    if (!container) return;
    
    if (!ventas || ventas.length === 0) {
      container.innerHTML = '<div class="alert alert-info">No hay ventas registradas para esta fecha</div>';
      return;
    }
    
    let html = ventas.map(v => {
      const payMethodBadge = v.pay_method === 'Efectivo' ? 'bg-success' : 
                            v.pay_method === 'Transferencia' ? 'bg-primary' : 'bg-warning';
      
      return `
        <div class="venta-item" data-id="${v.id}">
          <div class="d-flex justify-content-between align-items-start">
            <div class="flex-grow-1">
              <div class="d-flex align-items-center gap-2 mb-1">
                <strong>${v.product_name}</strong>
                <span class="badge ${payMethodBadge}">${v.pay_method}</span>
                <span class="pos-pill pos-${v.pos}">${v.pos}</span>
              </div>
              <div class="text-muted small">
                ${v.time} | Cant: ${v.qty} | ${money(v.qty * v.product_price)}
                ${v.notes ? ` | ${v.notes}` : ''}
              </div>
              ${v.pay_method === 'Mixto' ? `
                <div class="text-muted small">
                  💰 Efectivo: ${money(v.cash_amount)} | 💳 Transferencia: ${money(v.transfer_amount)}
                </div>
              ` : ''}
            </div>
            <div class="d-flex gap-1">
              <button class="btn btn-sm btn-outline-danger" data-del="${v.id}">🗑️</button>
            </div>
          </div>
        </div>
      `;
    }).join('');
    
    container.innerHTML = html;
    
    // Event listeners para eliminar ventas
    container.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.target.dataset.del;
        if (confirm('¿Eliminar esta venta?')) {
          try {
            await deleteSale(id); 
            await refreshAllUI(); // ACTUALIZACIÓN COMPLETA
            alert('✅ Venta eliminada exitosamente');
          } catch(err) {
            alert('Error eliminando venta: ' + err.message);
          }
        }
      });
    });
    
    console.log(`✅ Ventas renderizadas: ${ventas.length}`);
  } catch(e) {
    console.error('Error rendering ventas:', e);
  }
}

// ============ INVENTARIO ============

async function cargarInventario() {
  const date = getSelectedDate();
  const pos = document.getElementById('invPOS').value;
  
  try {
    const products = await getProducts();
    const inventory = await getInventoryCount(date, pos);
    
    const container = document.getElementById('inventoryContainer');
    if (!container) return;
    
    // Filtrar productos por POS
    const posProducts = products.filter(p => p.pos === pos && p.active);
    
    let html = `
      <div class="alert alert-info">
        <strong>Inventario ${pos} - ${date}</strong><br>
        <small>Ingrese las cantidades iniciales al comenzar el día</small>
      </div>
    `;
    
    posProducts.forEach(product => {
      const currentInventory = inventory.find(i => i.product_id === product.id);
      const initialQty = currentInventory?.initial_qty || 0;
      
      html += `
        <div class="inventory-item">
          <div class="row align-items-center">
            <div class="col-6">
              <strong>${product.name}</strong>
              <div class="text-muted small">${product.sku}</div>
            </div>
            <div class="col-3">
              <input type="number" 
                     class="form-control form-control-sm" 
                     value="${initialQty}"
                     data-product-id="${product.id}"
                     data-product-name="${product.name}"
                     min="0"
                     step="1">
            </div>
            <div class="col-3">
              <button class="btn btn-sm btn-outline-primary w-100" 
                      onclick="saveInventoryItem('${product.id}', '${product.name}')">
                Guardar
              </button>
            </div>
          </div>
        </div>
      `;
    });
    
    container.innerHTML = html;
    console.log(`📦 Inventario cargado: ${posProducts.length} productos`);
    
  } catch(e) {
    console.error('Error cargando inventario:', e);
    alert('Error cargando inventario: ' + e.message);
  }
}

// ============ VALIDACIONES ============

function updateTotalAPagar() {
  const efectivo = parseFloat(document.getElementById('ventaEfectivo').value) || 0;
  const transferencia = parseFloat(document.getElementById('ventaTransferencia').value) || 0;
  const total = efectivo + transferencia;
  
  document.getElementById('totalAPagar').textContent = money(total);
  
  // Validar que el total coincida con el precio del producto
  const productSelect = document.getElementById('ventaProd');
  const qty = parseInt(document.getElementById('ventaCant').value) || 1;
  
  if (productSelect.selectedIndex > 0 && window.products) {
    const selectedProduct = window.products.find(p => p.id === productSelect.value);
    if (selectedProduct) {
      const expectedTotal = selectedProduct.price * qty;
      const totalElement = document.getElementById('totalAPagar');
      
      if (Math.abs(total - expectedTotal) < 0.01) {
        totalElement.style.color = 'green';
      } else {
        totalElement.style.color = 'red';
      }
    }
  }
}

function validateMixto() {
  const payMethod = document.getElementById('ventaPago').value;
  const efectivo = parseFloat(document.getElementById('ventaEfectivo').value) || 0;
  const transferencia = parseFloat(document.getElementById('ventaTransferencia').value) || 0;
  const productSelect = document.getElementById('ventaProd');
  const qty = parseInt(document.getElementById('ventaCant').value) || 1;
  
  if (payMethod !== 'Mixto') return true;
  
  if (productSelect.selectedIndex === 0) {
    alert('Seleccione un producto primero');
    return false;
  }
  
  const selectedProduct = window.products?.find(p => p.id === productSelect.value);
  if (!selectedProduct) {
    alert('Producto no encontrado');
    return false;
  }
  
  const expectedTotal = selectedProduct.price * qty;
  const actualTotal = efectivo + transferencia;
  
  if (Math.abs(actualTotal - expectedTotal) > 0.01) {
    alert(`El total debe ser ${money(expectedTotal)}. Actual: ${money(actualTotal)}`);
    return false;
  }
  
  if (efectivo <= 0 && transferencia <= 0) {
    alert('Debe especificar al menos un monto en efectivo o transferencia');
    return false;
  }
  
  return true;
}

function showValidationErrors(errors) {
  const errorContainer = document.getElementById('validationErrors');
  if (!errorContainer) return;
  
  if (errors.length === 0) {
    errorContainer.innerHTML = '';
    errorContainer.style.display = 'none';
    return;
  }
  
  errorContainer.innerHTML = `
    <div class="alert alert-danger">
      <strong>Errores de validación:</strong>
      <ul class="mb-0">
        ${errors.map(error => `<li>${error}</li>`).join('')}
      </ul>
    </div>
  `;
  errorContainer.style.display = 'block';
}

// ============ FUNCIONES GLOBALES ============

// Función para guardar item de inventario
window.saveInventoryItem = async function(productId, productName) {
  const date = getSelectedDate();
  const pos = document.getElementById('invPOS').value;
  const input = document.querySelector(`[data-product-id="${productId}"]`);
  const qty = parseInt(input.value) || 0;
  
  try {
    await setInventoryCount(date, pos, productId, qty);
    alert(`✅ ${productName}: ${qty} unidades guardadas`);
    console.log(`📦 Inventario guardado: ${productName} = ${qty}`);
  } catch(e) {
    alert('Error guardando inventario: ' + e.message);
  }
};

// Hacer funciones disponibles globalmente
window.updateDashboard = updateDashboard;
window.renderVentas = renderVentas;
window.cargarInventario = cargarInventario;
window.updateTotalAPagar = updateTotalAPagar;
window.validateMixto = validateMixto;
window.showValidationErrors = showValidationErrors;