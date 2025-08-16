// ============ MÓDULO DE VENTAS ============
import { supabase, money } from '../core/supabase-client.js';
import { BusinessRules } from '../core/business-rules.js';

export class SalesManager {
  
  // ============ VALIDACIONES ============
  static validateSaleData(saleData, product) {
    const errors = [];
    
    // Validar POS
    if (!BusinessRules.validarPOS(saleData.pos)) {
      errors.push('POS debe ser Barra o Granizados');
    }
    
    // Validar producto
    if (!product) {
      errors.push('Producto no encontrado');
    }
    
    // Validar cantidad
    if (!saleData.qty || saleData.qty <= 0) {
      errors.push('La cantidad debe ser mayor a 0');
    }
    
    // Validar método de pago
    if (!BusinessRules.validarMetodoPago(saleData.pay_method)) {
      errors.push('Método de pago inválido');
    }
    
    // Validar pago mixto
    if (saleData.pay_method === 'Mixto') {
      const total = product.price * saleData.qty;
      const suma = (saleData.cash_amount || 0) + (saleData.transfer_amount || 0);
      if (suma !== total) {
        errors.push(`Pago mixto debe sumar exactamente ${money(total)}`);
      }
    }
    
    return errors;
  }
  
  // ============ REGISTRAR VENTA ============
  static async registrarVenta(saleData, products) {
    try {
      // 1. Obtener producto
      const product = products.find(p => p.id === saleData.product_id);
      
      // 2. Validar datos
      const errors = this.validateSaleData(saleData, product);
      if (errors.length > 0) {
        throw new Error(errors.join(', '));
      }
      
      // 3. Calcular montos según método de pago
      const totalPrice = product.price * saleData.qty;
      const { cash_amount, transfer_amount } = BusinessRules.calcularMontosVenta(
        saleData.pay_method,
        totalPrice,
        saleData.cash_amount,
        saleData.transfer_amount
      );
      
      // 4. Preparar datos de venta
      const ventaCompleta = {
        date: saleData.date,
        time: saleData.time,
        pos: saleData.pos,
        product_id: saleData.product_id,
        qty: saleData.qty,
        pay_method: saleData.pay_method,
        cash_amount,
        transfer_amount,
        notes: saleData.notes || ''
      };
      
      // 5. Registrar en base de datos
      const { data, error } = await supabase
        .from('sales')
        .insert([ventaCompleta])
        .select('*')
        .single();
        
      if (error) throw error;
      
      console.log('✅ Venta registrada:', data);
      return data;
      
    } catch (error) {
      console.error('❌ Error registrando venta:', error);
      throw error;
    }
  }
  
  // ============ OBTENER VENTAS DEL DÍA ============
  static async getVentasDelDia(date) {
    try {
      const { data, error } = await supabase
        .from('sales')
        .select('*, products(name,price,pos)')
        .eq('date', date)
        .order('time');
        
      if (error) throw error;
      return data || [];
      
    } catch (error) {
      console.error('Error obteniendo ventas:', error);
      return [];
    }
  }
  
  // ============ ACTUALIZAR TOTAL A PAGAR ============
  static updateTotalAPagar(products) {
    const productId = document.getElementById('ventaProd')?.value;
    const qty = +document.getElementById('ventaCant')?.value || 1;
    const product = products.find(p => p.id === productId);
    const total = product ? product.price * qty : 0;
    
    const totalElement = document.getElementById('totalAPagar');
    if (totalElement) {
      totalElement.textContent = money(total);
    }
    return total;
  }
  
  // ============ VALIDAR PAGO MIXTO EN TIEMPO REAL ============
  static validateMixtoRealTime(products) {
    const efectivo = +document.getElementById('ventaEfectivo')?.value || 0;
    const transferencia = +document.getElementById('ventaTransferencia')?.value || 0;
    const total = this.updateTotalAPagar(products);
    
    const suma = efectivo + transferencia;
    const btnAdd = document.getElementById('btnAddVenta');
    
    if (document.getElementById('ventaPago')?.value === 'Mixto') {
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
}