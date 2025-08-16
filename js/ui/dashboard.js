// ============ DASHBOARD Y KPIs ============
import { getDashboardData, money, getSelectedDate } from '../core/supabase-client.js';

export class DashboardManager {
  
  // ============ ACTUALIZAR DASHBOARD COMPLETO ============
  static async refresh() {
    try {
      const date = getSelectedDate();
      console.log(`📊 Actualizando dashboard para: ${date}`);
      
      // Obtener datos del día
      const data = await getDashboardData(date);
      
      // Calcular KPIs
      const kpis = this.calculateKPIs(data);
      
      // Renderizar KPIs
      this.renderKPIs(kpis);
      
      // Actualizar contadores de actividad
      this.updateActivityCounters(data);
      
      console.log('✅ Dashboard actualizado');
      
    } catch (error) {
      console.error('❌ Error actualizando dashboard:', error);
    }
  }
  
  // ============ CALCULAR KPIs ============
  static calculateKPIs(data) {
    const totalVentas = data.sales.reduce((sum, s) => 
      sum + s.cash_amount + s.transfer_amount, 0);
      
    const totalGastos = data.expenses.reduce((sum, e) => 
      sum + e.amount, 0);
      
    const totalCompras = data.purchases.reduce((sum, p) => 
      sum + (p.qty * p.unit_cost), 0);
      
    const utilidadDia = totalVentas - totalGastos - totalCompras;
    
    return {
      totalVentas,
      totalGastos,
      totalCompras,
      utilidadDia
    };
  }
  
  // ============ RENDERIZAR KPIs ============
  static renderKPIs(kpis) {
    const kpisHTML = `
      <div class="col-6 col-md-3">
        <div class="kpi-card" style="background: linear-gradient(135deg, #28a745, #20c997);">
          <div class="kpi-value">${money(kpis.totalVentas)}</div>
          <div class="kpi-label">Ventas del día</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="kpi-card" style="background: linear-gradient(135deg, #dc3545, #fd7e14);">
          <div class="kpi-value">${money(kpis.totalGastos)}</div>
          <div class="kpi-label">Gastos del día</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="kpi-card" style="background: linear-gradient(135deg, #6f42c1, #e83e8c);">
          <div class="kpi-value">${money(kpis.totalCompras)}</div>
          <div class="kpi-label">Compras del día</div>
        </div>
      </div>
      <div class="col-6 col-md-3">
        <div class="kpi-card" style="background: linear-gradient(135deg, ${
          kpis.utilidadDia >= 0 ? '#28a745, #20c997' : '#dc3545, #fd7e14'
        });">
          <div class="kpi-value">${money(kpis.utilidadDia)}</div>
          <div class="kpi-label">Utilidad estimada</div>
        </div>
      </div>`;
    
    const dashboardElement = document.getElementById('dashboardKPIs');
    if (dashboardElement) {
      dashboardElement.innerHTML = kpisHTML;
    }
  }
  
  // ============ ACTUALIZAR CONTADORES DE ACTIVIDAD ============
  static updateActivityCounters(data) {
    // Actualizar contador de ventas
    const ventasCountElement = document.getElementById('ventasCount');
    if (ventasCountElement) {
      ventasCountElement.textContent = data.sales.length;
    }
    
    // Actualizar contador de compras
    const comprasCountElement = document.getElementById('comprasCount');
    if (comprasCountElement) {
      comprasCountElement.textContent = data.purchases.length;
    }
    
    // Mostrar última actividad
    const lastActivityElement = document.getElementById('lastActivity');
    if (lastActivityElement && data.sales.length > 0) {
      const lastSale = data.sales[data.sales.length - 1];
      lastActivityElement.textContent = `Última venta: ${lastSale.time} - ${lastSale.products?.name || 'Producto'}`;
    }
  }
}