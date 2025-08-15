// Utilidades para exportación de datos
// Requiere: jsPDF y SheetJS (incluir en HTML)

class ExportUtils {
  
  // Exportar reporte diario en PDF
  static async exportDailyPDF(date, data) {
    // Usar jsPDF (necesita ser incluido en index.html)
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Configurar fuente
    doc.setFont("helvetica");
    
    // Título
    doc.setFontSize(20);
    doc.text(`Reporte Diario - ${date}`, 20, 25);
    
    // Línea separadora
    doc.setLineWidth(0.5);
    doc.line(20, 30, 190, 30);
    
    let yPos = 45;
    
    // KPIs principales
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Resumen del Día", 20, yPos);
    yPos += 10;
    
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    
    const totalVentas = data.sales.reduce((sum, s) => sum + s.cash_amount + s.transfer_amount, 0);
    const totalGastos = data.expenses.reduce((sum, e) => sum + e.amount, 0);
    const totalCompras = data.purchases.reduce((sum, p) => sum + (p.qty * p.unit_cost), 0);
    
    doc.text(`Ventas Totales: ${this.formatMoney(totalVentas)}`, 20, yPos);
    yPos += 7;
    doc.text(`Gastos Totales: ${this.formatMoney(totalGastos)}`, 20, yPos);
    yPos += 7;
    doc.text(`Compras Totales: ${this.formatMoney(totalCompras)}`, 20, yPos);
    yPos += 7;
    doc.text(`Utilidad Estimada: ${this.formatMoney(totalVentas - totalGastos - totalCompras)}`, 20, yPos);
    yPos += 15;
    
    // Ventas detalladas
    if (data.sales.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.text("Ventas del Día", 20, yPos);
      yPos += 7;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      
      // Headers
      doc.text("Hora", 20, yPos);
      doc.text("Producto", 45, yPos);
      doc.text("Cant", 110, yPos);
      doc.text("Método", 130, yPos);
      doc.text("Total", 165, yPos);
      yPos += 5;
      
      data.sales.forEach(sale => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        
        doc.text(sale.time, 20, yPos);
        doc.text(sale.products?.name || 'N/A', 45, yPos);
        doc.text(sale.qty.toString(), 110, yPos);
        doc.text(sale.pay_method, 130, yPos);
        doc.text(this.formatMoney(sale.cash_amount + sale.transfer_amount), 165, yPos);
        yPos += 5;
      });
      yPos += 10;
    }
    
    // Gastos
    if (data.expenses.length > 0) {
      if (yPos > 220) {
        doc.addPage();
        yPos = 20;
      }
      
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("Gastos del Día", 20, yPos);
      yPos += 7;
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      
      data.expenses.forEach(expense => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
        
        doc.text(`${expense.concept} (${expense.type})`, 20, yPos);
        doc.text(this.formatMoney(expense.amount), 165, yPos);
        if (expense.attributed_to) {
          yPos += 4;
          doc.setFontSize(8);
          doc.text(`- ${expense.attributed_to}`, 25, yPos);
          doc.setFontSize(10);
        }
        yPos += 6;
      });
    }
    
    // Pie de página
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.text(`Página ${i} de ${pageCount} - Generado: ${new Date().toLocaleString('es-CO')}`, 20, 290);
    }
    
    // Descargar
    doc.save(`reporte_diario_${date}.pdf`);
  }
  
  // Exportar reporte semanal en PDF
  static async exportWeeklyPDF(fechaInicio, fechaFin, data, partners, utilidades) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    doc.setFont("helvetica");
    doc.setFontSize(20);
    doc.text(`Reporte Semanal`, 20, 25);
    doc.setFontSize(12);
    doc.text(`${fechaInicio} al ${fechaFin}`, 20, 35);
    
    doc.setLineWidth(0.5);
    doc.line(20, 40, 190, 40);
    
    let yPos = 55;
    
    // Resumen financiero
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Resumen Financiero", 20, yPos);
    yPos += 10;
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    
    const totalVentas = data.sales.reduce((sum, s) => sum + s.cash_amount + s.transfer_amount, 0);
    const totalGastos = data.expenses.reduce((sum, e) => sum + e.amount, 0);
    const utilidadTotal = utilidades.utilidadDistribuible;
    
    doc.text(`Ventas Totales: ${this.formatMoney(totalVentas)}`, 20, yPos);
    yPos += 7;
    doc.text(`Gastos Totales: ${this.formatMoney(totalGastos)}`, 20, yPos);
    yPos += 7;
    doc.text(`Utilidad a Distribuir: ${this.formatMoney(utilidadTotal)}`, 20, yPos);
    yPos += 15;
    
    // Reparto entre socios
    doc.setFont("helvetica", "bold");
    doc.text("Reparto entre Socios", 20, yPos);
    yPos += 7;
    
    doc.setFont("helvetica", "normal");
    partners.forEach(partner => {
      const parte = (utilidadTotal * partner.share_pct) / 100;
      doc.text(`${partner.name} (${partner.share_pct}%): ${this.formatMoney(parte)}`, 20, yPos);
      yPos += 6;
    });
    
    doc.save(`reporte_semanal_${fechaInicio}_${fechaFin}.pdf`);
  }
  
  // Exportar datos en Excel
  static exportToExcel(data, filename) {
    // Usar SheetJS (necesita ser incluido en HTML)
    const XLSX = window.XLSX;
    const workbook = XLSX.utils.book_new();
    
    // Hoja de ventas
    if (data.sales && data.sales.length > 0) {
      const salesData = data.sales.map(sale => ({
        Fecha: sale.date,
        Hora: sale.time,
        POS: sale.pos,
        Producto: sale.products?.name || '',
        Cantidad: sale.qty,
        'Método Pago': sale.pay_method,
        'Efectivo': sale.cash_amount,
        'Transferencia': sale.transfer_amount,
        'Total': sale.cash_amount + sale.transfer_amount,
        Notas: sale.notes || ''
      }));
      
      const salesSheet = XLSX.utils.json_to_sheet(salesData);
      XLSX.utils.book_append_sheet(workbook, salesSheet, "Ventas");
    }
    
    // Hoja de gastos
    if (data.expenses && data.expenses.length > 0) {
      const expensesData = data.expenses.map(expense => ({
        Fecha: expense.date,
        Tipo: expense.type,
        Concepto: expense.concept,
        Monto: expense.amount,
        'Atribuido a': expense.attributed_to || '',
        Notas: expense.notes || ''
      }));
      
      const expensesSheet = XLSX.utils.json_to_sheet(expensesData);
      XLSX.utils.book_append_sheet(workbook, expensesSheet, "Gastos");
    }
    
    // Hoja de compras
    if (data.purchases && data.purchases.length > 0) {
      const purchasesData = data.purchases.map(purchase => ({
        Fecha: purchase.date,
        POS: purchase.pos,
        Producto: purchase.products?.name || '',
        Cantidad: purchase.qty,
        'Costo Unitario': purchase.unit_cost,
        'Total': purchase.qty * purchase.unit_cost,
        Notas: purchase.notes || ''
      }));
      
      const purchasesSheet = XLSX.utils.json_to_sheet(purchasesData);
      XLSX.utils.book_append_sheet(workbook, purchasesSheet, "Compras");
    }
    
    // Descargar archivo
    XLSX.writeFile(workbook, filename);
  }
  
  // Función auxiliar para formatear dinero
  static formatMoney(amount) {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(amount || 0);
  }
  
  // Exportar reporte completo (PDF + Excel)
  static async exportCompleteReport(date) {
    try {
      const data = await window.getDashboardData(date);
      
      // Exportar PDF diario
      await this.exportDailyPDF(date, data);
      
      // Exportar Excel
      this.exportToExcel(data, `datos_completos_${date}.xlsx`);
      
      return true;
    } catch (error) {
      console.error('Error exporting complete report:', error);
      throw error;
    }
  }
}

// Hacer disponible globalmente
window.ExportUtils = ExportUtils;