// ============ APLICACIÓN PRINCIPAL - SNOW BAR ============
import { supabase, getProducts, getEmployees, getPartners, localISODate } from './core/supabase-client.js';
import { NavigationManager } from './ui/navigation.js';
import { DashboardManager } from './ui/dashboard.js';
import { SalesManager } from './modules/sales.js';

class SnowApp {
  
  // ============ INICIALIZACIÓN PRINCIPAL ============
  static async init() {
    try {
      console.log('🚀 Iniciando Snow Bar App...');
      
      // 1. Verificar conexión Supabase
      await this.checkSupabaseConnection();
      
      // 2. Inicializar estado global
      this.initGlobalState();
      
      // 3. Cargar datos críticos en orden correcto
      await this.loadCriticalData();
      
      // 4. Inicializar UI
      this.initUI();
      
      // 5. Configurar event listeners
      this.setupEventListeners();
      
      console.log('✅ Snow Bar App inicializada correctamente');
      
    } catch (error) {
      console.error('❌ Error inicializando aplicación:', error);
      this.showInitError(error);
    }
  }
  
  // ============ VERIFICAR CONEXIÓN SUPABASE ============
  static async checkSupabaseConnection() {
    try {
      const { error } = await supabase
        .from('products')
        .select('id', { count: 'exact', head: true });
        
      if (error) throw error;
      console.log('✅ Conexión Supabase OK');
      
    } catch (error) {
      console.error('❌ Error conexión Supabase:', error);
      throw new Error('No se pudo conectar a la base de datos');
    }
  }
  
  // ============ INICIALIZAR ESTADO GLOBAL ============
  static initGlobalState() {
    window.AppState = {
      products: [],
      employees: [],
      partners: [],
      
      // Métodos para actualizar estado
      dashboard: {
        refresh: () => DashboardManager.refresh()
      }
    };
    
    console.log('✅ Estado global inicializado');
  }
  
  // ============ CARGAR DATOS CRÍTICOS ============
  static async loadCriticalData() {
    console.log('📊 Cargando datos críticos...');
    
    // ORDEN CRÍTICO: Productos primero, dashboard después
    try {
      // 1. Cargar productos
      window.AppState.products = await getProducts();
      console.log(`📦 Productos cargados: ${window.AppState.products.length}`);
      
      // 2. Cargar empleados
      window.AppState.employees = await getEmployees();
      console.log(`👥 Empleados cargados: ${window.AppState.employees.length}`);
      
      // 3. Cargar socios
      window.AppState.partners = await getPartners();
      console.log(`🤝 Socios cargados: ${window.AppState.partners.length}`);
      
      // 4. Actualizar selects después de cargar productos
      this.rebuildProductSelects();
      
      // 5. Actualizar dashboard
      await DashboardManager.refresh();
      
    } catch (error) {
      console.error('❌ Error cargando datos:', error);
      throw error;
    }
  }
  
  // ============ INICIALIZAR UI ============
  static initUI() {
    // 1. Configurar fecha actual
    const dateInput = document.getElementById('appDate');
    if (dateInput) {
      dateInput.value = localISODate();
      
      // Event listener para cambio de fecha
      dateInput.addEventListener('change', async () => {
        console.log('📅 Fecha cambiada, actualizando dashboard...');
        await DashboardManager.refresh();
      });
    }
    
    // 2. Inicializar navegación
    NavigationManager.init();
    
    console.log('✅ UI inicializada');
  }
  
  // ============ CONFIGURAR EVENT LISTENERS ============
  static setupEventListeners() {
    // Event listeners para ventas
    this.setupSalesListeners();
    
    // Event listeners para botones globales
    this.setupGlobalButtons();
    
    console.log('✅ Event listeners configurados');
  }
  
  // ============ EVENT LISTENERS DE VENTAS ============
  static setupSalesListeners() {
    // Cambio de POS - actualizar productos
    const ventaPOSSelect = document.getElementById('ventaPOS');
    if (ventaPOSSelect) {
      ventaPOSSelect.addEventListener('change', () => {
        this.rebuildProductSelects();
      });
    }
    
    // Cambio de producto/cantidad - actualizar total
    const ventaProdSelect = document.getElementById('ventaProd');
    const ventaCantInput = document.getElementById('ventaCant');
    if (ventaProdSelect) {
      ventaProdSelect.addEventListener('change', () => {
        SalesManager.updateTotalAPagar(window.AppState.products);
      });
    }
    if (ventaCantInput) {
      ventaCantInput.addEventListener('input', () => {
        SalesManager.updateTotalAPagar(window.AppState.products);
      });
    }
    
    // Manejo de pago mixto
    const ventaPagoSelect = document.getElementById('ventaPago');
    if (ventaPagoSelect) {
      ventaPagoSelect.addEventListener('change', function() {
        const mixtoFields = document.getElementById('mixtoFields');
        if (mixtoFields) {
          if (this.value === 'Mixto') {
            mixtoFields.classList.add('show');
            SalesManager.updateTotalAPagar(window.AppState.products);
          } else {
            mixtoFields.classList.remove('show');
            document.getElementById('ventaEfectivo').value = 0;
            document.getElementById('ventaTransferencia').value = 0;
          }
        }
      });
    }
    
    // Validación en tiempo real para pago mixto
    const efectivoInput = document.getElementById('ventaEfectivo');
    const transferenciaInput = document.getElementById('ventaTransferencia');
    if (efectivoInput) {
      efectivoInput.addEventListener('input', () => {
        SalesManager.validateMixtoRealTime(window.AppState.products);
      });
    }
    if (transferenciaInput) {
      transferenciaInput.addEventListener('input', () => {
        SalesManager.validateMixtoRealTime(window.AppState.products);
      });
    }
    
    // Botón de agregar venta
    const btnAddVenta = document.getElementById('btnAddVenta');
    if (btnAddVenta) {
      btnAddVenta.addEventListener('click', () => this.handleAddSale());
    }
  }
  
  // ============ MANEJAR AGREGAR VENTA ============
  static async handleAddSale() {
    try {
      // Recopilar datos del formulario
      const saleData = {
        date: document.getElementById('appDate').value || localISODate(),
        time: new Date().toTimeString().slice(0,8),
        pos: document.getElementById('ventaPOS').value,
        product_id: document.getElementById('ventaProd').value,
        qty: +document.getElementById('ventaCant').value || 1,
        pay_method: document.getElementById('ventaPago').value,
        notes: document.getElementById('ventaNotas').value.trim()
      };
      
      // Si es pago mixto, agregar montos
      if (saleData.pay_method === 'Mixto') {
        saleData.cash_amount = +document.getElementById('ventaEfectivo').value || 0;
        saleData.transfer_amount = +document.getElementById('ventaTransferencia').value || 0;
      }
      
      // Registrar venta
      await SalesManager.registrarVenta(saleData, window.AppState.products);
      
      // Limpiar formulario
      this.clearSaleForm();
      
      // Actualizar dashboard
      await DashboardManager.refresh();
      
      alert('✅ Venta registrada exitosamente');
      
    } catch (error) {
      console.error('❌ Error registrando venta:', error);
      alert('❌ Error registrando venta: ' + error.message);
    }
  }
  
  // ============ LIMPIAR FORMULARIO DE VENTA ============
  static clearSaleForm() {
    document.getElementById('ventaCant').value = 1;
    document.getElementById('ventaNotas').value = '';
    document.getElementById('ventaEfectivo').value = 0;
    document.getElementById('ventaTransferencia').value = 0;
    document.getElementById('ventaPago').value = 'Efectivo';
    document.getElementById('mixtoFields').classList.remove('show');
  }
  
  // ============ ACTUALIZAR SELECTS DE PRODUCTOS ============
  static rebuildProductSelects() {
    const pos = document.getElementById('ventaPOS')?.value;
    const ventaProdSelect = document.getElementById('ventaProd');
    
    if (ventaProdSelect && window.AppState.products) {
      ventaProdSelect.innerHTML = window.AppState.products
        .filter(p => p.pos === pos && p.type === 'producto')
        .map(p => `<option value="${p.id}">${p.name} (${new Intl.NumberFormat('es-CO', {style: 'currency', currency: 'COP', maximumFractionDigits: 0}).format(p.price)})</option>`)
        .join('');
    }
  }
  
  // ============ BOTONES GLOBALES ============
  static setupGlobalButtons() {
    // Función de reset (placeholder)
    window.resetAllDataConfirm = function() {
      alert('🚧 Función de reset en desarrollo. Usa Supabase SQL Editor para borrar datos.');
    };
    
    // Función de export (placeholder)
    window.exportDailyData = function() {
      alert('🚧 Función de exportación en desarrollo.');
    };
  }
  
  // ============ MOSTRAR ERROR DE INICIALIZACIÓN ============
  static showInitError(error) {
    const errorHTML = `
      <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); 
                  background: #dc3545; color: white; padding: 20px; border-radius: 8px; 
                  text-align: center; z-index: 9999;">
        <h3>❌ Error de Inicialización</h3>
        <p>${error.message}</p>
        <button onclick="location.reload()" style="background: white; color: #dc3545; 
                border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer;">
          Recargar Página
        </button>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', errorHTML);
  }
}

// ============ INICIALIZAR CUANDO DOM ESTÉ LISTO ============
document.addEventListener('DOMContentLoaded', () => {
  SnowApp.init();
});

// ============ EXPORTAR PARA USO GLOBAL ============
window.SnowApp = SnowApp;