// ============ LÓGICA DE NEGOCIO - REGLAS MATEMÁTICAS ============

export const BusinessRules = {
  // ============ INVENTARIO ============
  
  // Stock esperado = Inicial + Compras - Ventas registradas
  calcularStockEsperado(inicial, compras, ventasRegistradas) {
    return inicial + compras - ventasRegistradas;
  },
  
  // Ventas faltantes = diferencia entre esperado y contado
  calcularVentasFaltantes(stockEsperado, stockContado) {
    return Math.max(0, stockEsperado - stockContado);
  },
  
  // ============ SISTEMA DE VASOS ============
  
  // Calcular vasos consumidos automáticamente
  calcularVasosConsumidos(producto, cantidad) {
    return (producto.vasos_per_unit || 0) * cantidad;
  },
  
  // ============ PAGOS Y EFECTIVO ============
  
  // Calcular montos según método de pago
  calcularMontosVenta(payMethod, totalPrice, efectivo = 0, transferencia = 0) {
    switch(payMethod) {
      case 'Efectivo':
        return { cash_amount: totalPrice, transfer_amount: 0 };
      case 'Transferencia':
        return { cash_amount: 0, transfer_amount: totalPrice };
      case 'Mixto':
        // Validar que sume exactamente
        if (efectivo + transferencia !== totalPrice) {
          throw new Error(`Pago mixto debe sumar exactamente ${totalPrice}`);
        }
        return { cash_amount: efectivo, transfer_amount: transferencia };
      default:
        throw new Error(`Método de pago inválido: ${payMethod}`);
    }
  },
  
  // Efectivo esperado = suma de todas las ventas en efectivo
  calcularEfectivoEsperado(ventasEfectivo) {
    return ventasEfectivo.reduce((sum, venta) => sum + venta.cash_amount, 0);
  },
  
  // ============ DESCUADRES ============
  
  // Descuadre = Efectivo esperado - Efectivo contado
  calcularDescuadre(efectivoEsperado, efectivoContado) {
    return efectivoEsperado - efectivoContado;
  },
  
  // ============ CIERRES SEMANALES ============
  
  // Utilidad = Ventas - Gastos - Nómina - Descuentos
  calcularUtilidadSemanal(ventas, gastos, nomina, descuentos) {
    return ventas - gastos - nomina - descuentos;
  },
  
  // Reparto por socio según porcentaje
  calcularRepartoSocio(utilidad, porcentajeSocio) {
    return (utilidad * porcentajeSocio) / 100;
  },
  
  // ============ VALIDACIONES DE NEGOCIO ============
  
  // Validar que socios sumen 100%
  validarPorcentajesSocios(socios) {
    const total = socios.reduce((sum, socio) => sum + parseFloat(socio.share_pct), 0);
    return Math.abs(total - 100) < 0.01; // Tolerancia para decimales
  },
  
  // Validar POS válido
  validarPOS(pos) {
    return ['Barra', 'Granizados'].includes(pos);
  },
  
  // Validar método de pago
  validarMetodoPago(method) {
    return ['Efectivo', 'Transferencia', 'Mixto'].includes(method);
  }
};