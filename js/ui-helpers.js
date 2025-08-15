// ============ SISTEMA DE CONTROL DE BAR - FUNCIONAL ============
// Este archivo contiene TODA la lógica necesaria para que funcione la aplicación

// ============ CONFIGURACIÓN GLOBAL ============
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cliente Supabase
const supabase = createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY,
  { auth: { persistSession: true } }
);

// Funciones helper
const money = (n) => (n || 0).toLocaleString("es-CO", {
  style: "currency", 
  currency: "COP", 
  maximumFractionDigits: 0
});

const localISODate = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0,10);
};

const getSelectedDate = () => document.getElementById('appDate').value || localISODate();

// ============ NAVEGACIÓN ============
const goto = (id) => {
  const sections = ['home', 'pos', 'socios', 'admin'];
  sections.forEach(s => {
    const element = document.getElementById(s);
    if (element) {
      element.hidden = (s !== id);
    }
  });
  console.log(`🧭 Navegando a: ${id}`);
};

// ============ PRODUCTOS ============
let products = [];

async function getProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("active", true)
    .order("pos, name");
  if (error) throw error;
  return data || [];
}

async function loadProducts() {
  try {
    products = await getProducts();
    rebuildSelects();
    console.log(`Productos cargados: ${products.length}`);
  } catch(e) {
    console.error('Error loading products:', e);
    alert('Error cargando productos');
  }
}

function rebuildSelects() {
  const pos = document.getElementById('ventaPOS').value;
  const ventaProdSelect = document.getElementById('ventaProd');
  
  if (ventaProdSelect) {
    ventaProdSelect.innerHTML = products
      .filter(p => p.pos === pos && p.type === 'producto')
      .map(p => `<option value="${p.id}">${p.name} (${money(p.price)})</option>`)
      .join('');
  }
}

// ============ MANEJO DE VENTAS ============
async function addSale(saleData) {
  // Calcular total basado en producto
  const product = products.find(p => p.id === saleData.product_id);
  if (!product) throw new Error('Producto no encontrado');
  
  const total = product.price * saleData.qty;
  
  // Configurar cash_amount y transfer_amount según método de pago
  let cash_amount = 0;
  let transfer_amount = 0;
  
  switch(saleData.pay_method) {
    case 'Efectivo':
      cash_amount = total;
      break;
    case 'Transferencia':
      transfer_amount = total;
      break;
    case 'Mixto':
      cash_amount = saleData.cash_amount || 0;
      transfer_amount = saleData.transfer_amount || 0;
      // Validar que sumen el total
      if (cash_amount + transfer_amount !== total) {
        throw new Error(`Pago mixto debe sumar ${money(total)}`);
      }
      break;
  }
  
  const { data, error } = await supabase
    .from('sales')
    .insert([{
      date: saleData.date,
      time: saleData.time,
      pos: saleData.pos,
      product_id: saleData.product_id,
      qty: saleData.qty,
      pay_method: saleData.pay_method,
      cash_amount,
      transfer_amount,
      notes: saleData.notes || ''
    }])
    .select('*')
    .single();
    
  if (error) throw error;
  return data;
}

// ============ DASHBOARD Y KPIs ============
async function updateDashboard() {
  const date = getSelectedDate();
  
  try {
    // Obtener datos del día
    const { data: salesData } = await supabase
      .from('sales')
      .select('*, products(name,price,pos)')
      .eq('date', date);
      
    const { data: expensesData } = await supabase
      .from('expenses')  
      .select('*')
      .eq('date', date);
      
    const { data: purchasesData } = await supabase
      .from('purchases')
      .select('*, products(name)')
      .eq('date', date);
    
    // Calcular KPIs
    const totalVentas = (salesData || []).reduce((sum, s) => sum + s.cash_amount + s.transfer_amount, 0);
    const totalGastos = (expensesData || []).reduce((sum, e) => sum + e.amount, 0);
    const totalCompras = (purchasesData || []).reduce((sum, p) => sum + (p.qty * p.unit_cost), 0);
    const utilidadDia = totalVentas - totalGastos - totalCompras;
    
    // Renderizar KPIs
    const kpisHTML = `
      <div class="col-6 col-md-3">
        <div class="kpi-card" style="background: linear-gradient(135deg, #28a745, #20c997);">
          <div class="kpi-value">${money(totalVentas)}</div>
          <div class="kpi-label">Ventas del día</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="kpi-card" style="background: linear-gradient(135deg, #dc3545, #fd7e14);">
          <div class="kpi-value">${money(totalGastos)}</div>
          <div class="kpi-label">Gastos del día</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="kpi-card" style="background: linear-gradient(135deg, #6f42c1, #e83e8c);">
          <div class="kpi-value">${money(totalCompras)}</div>
          <div class="kpi-label">Compras del día</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="kpi-card" style="background: linear-gradient(135deg, ${utilidadDia >= 0 ? '#28a745, #20c997' : '#dc3545, #fd7e14'});">
          <div class="kpi-value">${money(utilidadDia)}</div>
          <div class="kpi-label">Utilidad estimada</div>
        </div>
      </div>`;
    
    const dashboardElement = document.getElementById('dashboardKPIs');
    if (dashboardElement) {
      dashboardElement.innerHTML = kpisHTML;
    }
    
    // Actualizar contadores de actividad
    const ventasCountElement = document.getElementById('ventasCount');
    const comprasCountElement = document.getElementById('comprasCount');
    
    if (ventasCountElement) ventasCountElement.textContent = (salesData || []).length;
    if (comprasCountElement) comprasCountElement.textContent = (purchasesData || []).length;
    
  } catch(e) {
    console.error('Error updating dashboard:', e);
  }
}

// ============ FUNCIONALIDAD DE VENTAS ============
function updateTotalAPagar() {
  const productId = document.getElementById('ventaProd').value;
  const qty = +document.getElementById('ventaCant').value || 1;
  const product = products.find(p => p.id === productId);
  const total = product ? product.price * qty : 0;
  const totalElement = document.getElementById('totalAPagar');
  if (totalElement) {
    totalElement.textContent = money(total);
  }
  return total;
}

// ============ INICIALIZACIÓN ============
function initializeNavigation() {
  // Configurar event listeners para botones de navegación
  document.querySelectorAll('[data-goto]').forEach(button => {
    button.onclick = () => goto(button.dataset.goto);
  });
  
  // Ir al home por defecto
  goto('home');
  
  console.log('🧭 Sistema de navegación inicializado');
}

function initializeEventListeners() {
  // Fecha
  const dateInput = document.getElementById('appDate');
  if (dateInput) {
    dateInput.value = localISODate();
    dateInput.addEventListener('change', async () => {
      console.log('📅 Fecha cambiada, actualizando dashboard...');
      await updateDashboard();
    });
  }
  
  // POS selector para ventas
  const ventaPOSSelect = document.getElementById('ventaPOS');
  if (ventaPOSSelect) {
    ventaPOSSelect.addEventListener('change', rebuildSelects);
  }
  
  // Producto y cantidad para calcular total
  const ventaProdSelect = document.getElementById('ventaProd');
  const ventaCantInput = document.getElementById('ventaCant');
  if (ventaProdSelect) ventaProdSelect.addEventListener('change', updateTotalAPagar);
  if (ventaCantInput) ventaCantInput.addEventListener('input', updateTotalAPagar);
  
  // Manejo de pago mixto
  const ventaPagoSelect = document.getElementById('ventaPago');
  if (ventaPagoSelect) {
    ventaPagoSelect.addEventListener('change', function() {
      const mixtoFields = document.getElementById('mixtoFields');
      if (mixtoFields) {
        if (this.value === 'Mixto') {
          mixtoFields.classList.add('show');
          updateTotalAPagar();
        } else {
          mixtoFields.classList.remove('show');
          const efectivoInput = document.getElementById('ventaEfectivo');
          const transferenciaInput = document.getElementById('ventaTransferencia');
          if (efectivoInput) efectivoInput.value = 0;
          if (transferenciaInput) transferenciaInput.value = 0;
        }
      }
    });
  }
  
  // Validación en tiempo real para pago mixto
  const efectivoInput = document.getElementById('ventaEfectivo');
  const transferenciaInput = document.getElementById('ventaTransferencia');
  if (efectivoInput) efectivoInput.addEventListener('input', validateMixto);
  if (transferenciaInput) transferenciaInput.addEventListener('input', validateMixto);
  
  // Botón de agregar venta
  const btnAddVenta = document.getElementById('btnAddVenta');
  if (btnAddVenta) {
    btnAddVenta.addEventListener('click', handleAddSale);
  }
  
  console.log('🎯 Event listeners inicializados');
}

function validateMixto() {
  const efectivo = +document.getElementById('ventaEfectivo').value || 0;
  const transferencia = +document.getElementById('ventaTransferencia').value || 0;
  const total = updateTotalAPagar();
  
  const suma = efectivo + transferencia;
  const btnAdd = document.getElementById('btnAddVenta');
  
  if (document.getElementById('ventaPago').value === 'Mixto') {
    if (suma === total) {
      btnAdd.disabled = false;
      btnAdd.textContent = 'Vender';
      btnAdd.className = 'btn btn-success w-100';
    } else {
      btnAdd.disabled = true;
      btnAdd.textContent = `Falta ${money(total - suma)}`;
      btnAdd.className = 'btn btn-outline-danger w-100';
    }
  } else {
    btnAdd.disabled = false;
    btnAdd.textContent = 'Vender';
    btnAdd.className = 'btn btn-success w-100';
  }
}

async function handleAddSale() {
  const pos = document.getElementById('ventaPOS').value;
  const product_id = document.getElementById('ventaProd').value;
  const qty = +document.getElementById('ventaCant').value || 1;
  const pay_method = document.getElementById('ventaPago').value;
  const notes = document.getElementById('ventaNotas').value.trim();
  const date = getSelectedDate();
  const time = new Date().toTimeString().slice(0,8);
  
  // Validaciones básicas
  if (!product_id) {
    alert('Debe seleccionar un producto');
    return;
  }
  
  if (!qty || qty <= 0) {
    alert('La cantidad debe ser mayor a 0');
    return;
  }
  
  // Preparar datos de venta
  const saleData = {
    date,
    time,
    pos,
    product_id,
    qty,
    pay_method,
    notes
  };
  
  // Si es pago mixto, agregar montos
  if (pay_method === 'Mixto') {
    saleData.cash_amount = +document.getElementById('ventaEfectivo').value || 0;
    saleData.transfer_amount = +document.getElementById('ventaTransferencia').value || 0;
  }
  
  try {
    await addSale(saleData);
    alert('✅ Venta registrada exitosamente');
    
    // Limpiar formulario
    document.getElementById('ventaCant').value = 1;
    document.getElementById('ventaNotas').value = '';
    document.getElementById('ventaEfectivo').value = 0;
    document.getElementById('ventaTransferencia').value = 0;
    document.getElementById('ventaPago').value = 'Efectivo';
    document.getElementById('mixtoFields').classList.remove('show');
    
    // Actualizar dashboard
    await updateDashboard();
    
  } catch(e) {
    console.error('Error adding sale:', e);
    alert('❌ Error registrando venta: ' + e.message);
  }
}

// ============ FUNCIONES GLOBALES PARA DEPURACIÓN ============
window.resetAllDataConfirm = function() {
  alert(`🗑️ FUNCIÓN DE RESET DISPONIBLE:

Para borrar todos los datos operativos:
1. Ve a Supabase SQL Editor
2. Ejecuta:
   DELETE FROM sales;
   DELETE FROM purchases; 
   DELETE FROM expenses;
   DELETE FROM inventory_counts;
   DELETE FROM inventory_moves;
   DELETE FROM activity_log;

3. Refresca la aplicación (F5)

✅ Se mantienen: productos, empleados, socios`);
};

window.exportDailyData = function() {
  alert('🚧 Función de exportación en desarrollo. Próximamente disponible.');
};

// ============ INICIALIZACIÓN PRINCIPAL ============
document.addEventListener('DOMContentLoaded', async function() {
  console.log('🚀 Iniciando aplicación...');
  
  try {
    // Inicializar navegación
    initializeNavigation();
    
    // Inicializar event listeners
    initializeEventListeners();
    
    // Cargar datos iniciales
    await loadProducts();
    
    // Actualizar dashboard inicial
    await updateDashboard();
    
    console.log('✅ Aplicación inicializada correctamente');
    
  } catch(e) {
    console.error('❌ Error inicializando aplicación:', e);
    alert('Error inicializando aplicación. Revisa la consola para más detalles.');
  }
});

// ============ EXPORTAR FUNCIONES GLOBALMENTE ============
window.supabase = supabase;
window.money = money;
window.getSelectedDate = getSelectedDate;
window.goto = goto;
window.updateDashboard = updateDashboard;