// ============ BUSINESS LOGIC - PRODUCTOS Y EMPLEADOS ============
// Funciones relacionadas con la gestión de productos, empleados y lógica de negocio

// Variables globales
let products = [];
let employees = [];
let partners = [];

// ============ PRODUCTOS ============

async function loadProducts(){
  try {
    products = await getProducts();
    window.products = products; // Hacer disponible globalmente
    rebuildSelects();
    renderProductsTable();
  } catch(e) {
    console.error('Error loading products:', e);
    alert('Error cargando catálogo');
  }
}

function rebuildSelects(){
  const pos = document.getElementById('ventaPOS').value;
  document.getElementById('ventaProd').innerHTML = products.filter(p=>p.pos===pos && p.type==='producto').map(p=>`<option value="${p.id}">${p.name} (${p.sku})</option>`).join('');
  document.getElementById('compraProd').innerHTML = products.map(p=>`<option value="${p.id}">${p.name} (${p.sku})</option>`).join('');
}

function renderProductsTable() {
  const tbody = document.querySelector('#tblProducts tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  
  products.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${p.sku}</td>
      <td>${p.name}</td>
      <td>${money(p.price)}</td>
      <td><span class="pos-pill pos-${p.pos}">${p.pos}</span></td>
      <td>${p.vasos_per_unit || 0}</td>
      <td><span class="badge bg-info">Ver stock</span></td>
      <td>
        <button class="btn btn-sm btn-outline-primary" onclick="editProduct('${p.id}')">Editar</button>
        <button class="btn btn-sm btn-outline-danger" onclick="removeProduct('${p.id}')">Borrar</button>
      </td>`;
    tbody.appendChild(tr);
  });
  
  console.log(`Products rendered: ${products.length}`);
}

// Funciones globales para editar/borrar productos
window.editProduct = async (id) => {
  const product = products.find(p => p.id === id);
  if (!product) return;
  
  const newName = prompt('Nuevo nombre:', product.name);
  const newPrice = prompt('Nuevo precio:', product.price);
  
  if (newName && newPrice && +newPrice > 0) {
    try {
      await updateProduct(id, { name: newName.trim(), price: +newPrice });
      alert('Producto actualizado');
      await loadProducts();
    } catch(e) {
      alert('Error actualizando: ' + e.message);
    }
  }
};

window.removeProduct = async (id) => {
  if (!confirm('¿Desactivar este producto?')) return;
  try {
    await deleteProduct(id);
    alert('Producto desactivado');
    await loadProducts();
  } catch(e) {
    alert('Error desactivando: ' + e.message);
  }
};

// ============ EMPLEADOS ============

async function loadEmployees(){
  try {
    employees = await getEmployees();
    window.employees = employees; // Hacer disponible globalmente
    renderEmployeesTable();
  } catch(e) {
    console.error('Error loading employees:', e);
  }
}

function renderEmployeesTable() {
  const tbody = document.querySelector('#tblEmployees tbody');
  if (!tbody) return;
  
  tbody.innerHTML = '';
  employees.forEach(e => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${e.name}</td>
      <td>${e.role}</td>
      <td>${money(e.daily_salary)}</td>
      <td><span class="badge bg-${e.active ? 'success' : 'secondary'}">${e.active ? 'Activo' : 'Inactivo'}</span></td>`;
    tbody.appendChild(tr);
  });
  
  console.log(`Employees rendered: ${employees.length}`);
}

// ============ SOCIOS ============

async function loadPartners() {
  try {
    partners = await getPartners();
    renderPartnersTable();
    updateGastoSociosSelect(); // Actualizar select de gastos
  } catch(e) {
    console.error('Error loading partners:', e);
  }
}

function updateGastoSociosSelect() {
  const select = document.getElementById('gastoSocioSelect');
  if (!select) return;
  
  select.innerHTML = '<option value="">Seleccionar socio...</option>';
  partners.forEach(partner => {
    const option = document.createElement('option');
    option.value = partner.name;
    option.textContent = partner.name;
    select.appendChild(option);
  });
}

function renderPartnersTable() {
  const container = document.getElementById('partnersContainer');
  if (!container) return;
  
  const totalShare = partners.reduce((sum, p) => sum + parseFloat(p.share_pct), 0);
  
  let html = '';
  
  partners.forEach(partner => {
    html += `
      <div class="partner-item">
        <div class="flex-grow-1">
          <strong>${partner.name}</strong>
          <div class="small text-muted">${partner.share_pct}% de participación</div>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-primary" onclick="editPartner('${partner.id}')">Editar</button>
          <button class="btn btn-sm btn-outline-danger" onclick="deletePartnerConfirm('${partner.id}')">Eliminar</button>
        </div>
      </div>
    `;
  });
  
  html += `
    <div class="mt-2 p-2 ${totalShare === 100 ? 'bg-success' : 'bg-warning'} text-white rounded">
      <strong>Total: ${totalShare.toFixed(1)}%</strong>
      ${totalShare === 100 ? ' ✓ Correcto' : ' ⚠️ Debe sumar 100%'}
    </div>
  `;
  
  container.innerHTML = html;
  console.log(`Partners rendered: ${partners.length}, Total: ${totalShare.toFixed(1)}%`);
}

// Funciones globales para socios
window.editPartner = async function(id) {
  const partner = partners.find(p => p.id === id);
  if (!partner) return;
  
  const newName = prompt('Nuevo nombre:', partner.name);
  const newShare = prompt('Nuevo porcentaje:', partner.share_pct);
  
  if (newName && newShare && parseFloat(newShare) >= 0) {
    try {
      await updatePartner(id, { name: newName.trim(), share_pct: parseFloat(newShare) });
      await loadPartners(); // Recargar lista
      await updateDashboard(); // Actualizar dashboard
      alert('Socio actualizado exitosamente');
    } catch(e) {
      alert('Error actualizando socio: ' + e.message);
    }
  }
};

window.deletePartnerConfirm = async function(id) {
  const partner = partners.find(p => p.id === id);
  if (!partner) return;
  
  if (confirm(`¿Eliminar socio "${partner.name}"?`)) {
    try {
      await deletePartner(id);
      await loadPartners(); // Recargar lista
      await updateDashboard(); // Actualizar dashboard
      alert('Socio eliminado exitosamente');
    } catch(e) {
      alert('Error eliminando socio: ' + e.message);
    }
  }
};

// ============ UTILIDADES ============

// Función para formatear dinero
function money(amount) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount || 0);
}

// Hacer las funciones principales disponibles globalmente
window.loadProducts = loadProducts;
window.loadEmployees = loadEmployees;
window.loadPartners = loadPartners;
window.rebuildSelects = rebuildSelects;
window.renderProductsTable = renderProductsTable;
window.renderEmployeesTable = renderEmployeesTable;
window.renderPartnersTable = renderPartnersTable;
window.updateGastoSociosSelect = updateGastoSociosSelect;