// Combinar los 3 artefactos creados:
// 1. Lógica de cierre diario completo
// 2. Lógica de cierre semanal completo  
// 3. Vista de administración completa

// [Copiar todo el código del artefacto "cierre_diario_completo"]
// ===== FUNCIONES PARA COMPLETAR CIERRE DIARIO =====

// 1. INFERIR VENTAS EN EFECTIVO POR POS
async function inferirVentasEfectivo(pos, fecha) {
    try {
        console.log(`🔍 Iniciando inferencia para ${pos} en ${fecha}`);
        
        // 1. Obtener productos del POS
        const productos = await getProductsByPOS(pos);
        const ventasInferidas = [];
        
        for (const producto of productos) {
            // 2. Obtener conteos de inventario
            const conteos = await supabase
                .from('inventory_counts')
                .select('initial_qty, final_qty')
                .eq('count_date', fecha)
                .eq('pos', pos)
                .eq('product_id', producto.id)
                .single();
            
            if (!conteos.data) {
                console.warn(`⚠️ Sin conteos para ${producto.name} en ${pos}`);
                continue;
            }
            
            // 3. Obtener compras del día
            const compras = await supabase
                .from('purchases')
                .select('qty')
                .eq('date', fecha)
                .eq('pos', pos)
                .eq('product_id', producto.id);
            
            const totalCompras = compras.data?.reduce((sum, c) => sum + c.qty, 0) || 0;
            
            // 4. Calcular ventas necesarias
            const { initial_qty, final_qty } = conteos.data;
            const ventasNecesarias = initial_qty + totalCompras - final_qty;
            
            if (ventasNecesarias <= 0) {
                console.log(`✅ ${producto.name}: Sin ventas necesarias (${ventasNecesarias})`);
                continue;
            }
            
            // 5. Obtener ventas ya registradas (no efectivo)
            const ventasRegistradas = await supabase
                .from('sales')
                .select('qty')
                .eq('date', fecha)
                .eq('pos', pos)
                .eq('product_id', producto.id)
                .neq('pay_method', 'Efectivo');
            
            const totalRegistradas = ventasRegistradas.data?.reduce((sum, v) => sum + v.qty, 0) || 0;
            
            // 6. Calcular cantidad en efectivo a inferir
            const qtyEfectivo = ventasNecesarias - totalRegistradas;
            
            if (qtyEfectivo > 0) {
                // 7. Crear venta en efectivo
                const ventaEfectivo = {
                    date: fecha,
                    time: '23:59:00', // Hora de cierre
                    pos: pos,
                    product_id: producto.id,
                    qty: qtyEfectivo,
                    pay_method: 'Efectivo',
                    cash_amount: qtyEfectivo * producto.price,
                    transfer_amount: 0,
                    notes: `Auto-inferido por cierre ${pos}`
                };
                
                // Insertar venta
                const { data: nuevaVenta, error } = await supabase
                    .from('sales')
                    .insert(ventaEfectivo)
                    .select()
                    .single();
                
                if (error) throw error;
                
                // 8. Crear movimiento de inventario
                await createInventoryMove(nuevaVenta.id, producto.id, pos, -qtyEfectivo, 'sale', fecha);
                
                // 9. Si consume vasos, crear movimiento adicional
                if (producto.vasos_per_unit > 0) {
                    const vasoProduct = await getProductBySKU('VASO-12');
                    if (vasoProduct) {
                        await createInventoryMove(
                            nuevaVenta.id, 
                            vasoProduct.id, 
                            pos, 
                            -(qtyEfectivo * producto.vasos_per_unit), 
                            'sale', 
                            fecha
                        );
                    }
                }
                
                ventasInferidas.push({
                    producto: producto.name,
                    cantidad: qtyEfectivo,
                    total: ventaEfectivo.cash_amount
                });
                
                console.log(`✨ Inferido: ${qtyEfectivo}x ${producto.name} = $${ventaEfectivo.cash_amount.toLocaleString()}`);
            }
        }
        
        return {
            success: true,
            mensaje: `Inferidas ${ventasInferidas.length} ventas en ${pos}`,
            ventas: ventasInferidas,
            total: ventasInferidas.reduce((sum, v) => sum + v.total, 0)
        };
        
    } catch (error) {
        console.error('❌ Error en inferencia:', error);
        return {
            success: false,
            mensaje: `Error: ${error.message}`,
            ventas: [],
            total: 0
        };
    }
}

// 2. CALCULAR EFECTIVO ESPERADO Y DESCUADRES
async function calcularDescuadres(fecha) {
    try {
        const descuadres = {};
        
        for (const pos of ['Barra', 'Granizados']) {
            // Obtener todas las ventas del día en este POS
            const ventas = await supabase
                .from('sales')
                .select('cash_amount, transfer_amount, pay_method')
                .eq('date', fecha)
                .eq('pos', pos);
            
            if (!ventas.data) continue;
            
            // Calcular efectivo esperado
            const efectivoEsperado = ventas.data.reduce((sum, venta) => {
                if (venta.pay_method === 'Efectivo') {
                    return sum + venta.cash_amount;
                } else if (venta.pay_method === 'Mixto') {
                    return sum + venta.cash_amount; // Solo la parte en efectivo
                }
                return sum;
            }, 0);
            
            descuadres[pos] = {
                esperado: efectivoEsperado,
                contado: 0, // Se llenará por input del usuario
                descuadre: 0 // Se calculará después
            };
        }
        
        return descuadres;
        
    } catch (error) {
        console.error('❌ Error calculando descuadres:', error);
        return {};
    }
}

// 3. REGISTRAR DESCUADRES COMO DEUDAS
async function registrarDescuadres(fecha, efectivoContado) {
    try {
        const deudas = [];
        
        for (const [pos, datos] of Object.entries(efectivoContado)) {
            const descuadre = Math.max(0, datos.esperado - datos.contado);
            
            if (descuadre > 0) {
                // Obtener encargado del POS
                const encargado = await supabase
                    .from('pos_managers')
                    .select('manager_name')
                    .eq('pos', pos)
                    .single();
                
                if (!encargado.data) {
                    console.warn(`⚠️ No hay encargado definido para ${pos}`);
                    continue;
                }
                
                // Crear deuda
                const deuda = {
                    date: fecha,
                    person: encargado.data.manager_name,
                    reason: `Descuadre ${pos}`,
                    amount: descuadre,
                    balance: descuadre
                };
                
                const { data, error } = await supabase
                    .from('debts')
                    .insert(deuda)
                    .select()
                    .single();
                
                if (error) throw error;
                
                deudas.push({
                    pos,
                    encargado: encargado.data.manager_name,
                    descuadre,
                    deuda_id: data.id
                });
                
                console.log(`💸 Deuda registrada: ${encargado.data.manager_name} debe $${descuadre.toLocaleString()} por ${pos}`);
            }
        }
        
        return {
            success: true,
            deudas,
            mensaje: `Registradas ${deudas.length} deudas por descuadres`
        };
        
    } catch (error) {
        console.error('❌ Error registrando descuadres:', error);
        return {
            success: false,
            deudas: [],
            mensaje: `Error: ${error.message}`
        };
    }
}

// 4. GENERAR RESUMEN DE CIERRE DIARIO
async function generarResumenCierreDiario(fecha) {
    try {
        const resumen = {
            fecha,
            barra: await getResumenPOS('Barra', fecha),
            granizados: await getResumenPOS('Granizados', fecha),
            total: {}
        };
        
        // Calcular totales
        resumen.total = {
            ventas: resumen.barra.ventas + resumen.granizados.ventas,
            efectivo: resumen.barra.efectivo + resumen.granizados.efectivo,
            transferencias: resumen.barra.transferencias + resumen.granizados.transferencias,
            compras: resumen.barra.compras + resumen.granizados.compras,
            gastos: resumen.barra.gastos + resumen.granizados.gastos
        };
        
        return resumen;
        
    } catch (error) {
        console.error('❌ Error generando resumen:', error);
        return null;
    }
}

async function getResumenPOS(pos, fecha) {
    // Ventas del día
    const ventas = await supabase
        .from('sales')
        .select(`
            qty, cash_amount, transfer_amount, pay_method,
            products!inner(price)
        `)
        .eq('date', fecha)
        .eq('pos', pos);
    
    // Compras del día
    const compras = await supabase
        .from('purchases')
        .select('qty, unit_cost')
        .eq('date', fecha)
        .eq('pos', pos);
    
    // Gastos del día (filtrados por POS si es posible)
    const gastos = await supabase
        .from('expenses')
        .select('amount')
        .eq('date', fecha);
    
    const ventasData = ventas.data || [];
    const comprasData = compras.data || [];
    const gastosData = gastos.data || [];
    
    return {
        ventas: ventasData.reduce((sum, v) => sum + (v.qty * v.products.price), 0),
        efectivo: ventasData.reduce((sum, v) => sum + (v.cash_amount || 0), 0),
        transferencias: ventasData.reduce((sum, v) => sum + (v.transfer_amount || 0), 0),
        compras: comprasData.reduce((sum, c) => sum + (c.qty * c.unit_cost), 0),
        gastos: gastosData.reduce((sum, g) => sum + g.amount, 0) / 2 // Dividir entre 2 POS
    };
}

// ===== FUNCIONES AUXILIARES =====

async function getProductsByPOS(pos) {
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('pos', pos)
        .eq('active', true);
    
    if (error) throw error;
    return data || [];
}

async function getProductBySKU(sku) {
    const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('sku', sku)
        .single();
    
    if (error) return null;
    return data;
}

async function createInventoryMove(saleId, productId, pos, qty, kind, date) {
    const move = {
        date,
        pos,
        product_id: productId,
        qty,
        kind,
        ref_id: saleId,
        notes: kind === 'sale' ? 'Venta inferida por cierre' : ''
    };
    
    const { error } = await supabase
        .from('inventory_moves')
        .insert(move);
    
    if (error) throw error;
}

// ===== INTERFAZ DE USUARIO PARA CIERRE DIARIO =====

function renderCierreDiario() {
    const fechaActual = document.getElementById('fecha-selector').value;
    
    return `
        <div class="cierre-diario">
            <h3>📊 Cierre Diario - ${fechaActual}</h3>
            
            <!-- Sección de Inferencia -->
            <div class="seccion-inferencia">
                <h4 style="color: #10b981;">🔮 Inferir Ventas en Efectivo</h4>
                <div class="botones-inferencia">
                    <button onclick="ejecutarInferencia('Barra')" class="btn-inferir" data-pos="Barra">
                        ⚡ Inferir Barra
                    </button>
                    <button onclick="ejecutarInferencia('Granizados')" class="btn-inferir" data-pos="Granizados">
                        ⚡ Inferir Granizados
                    </button>
                </div>
                <div id="resultado-inferencia" class="resultado-inferencia"></div>
            </div>
            
            <!-- Sección de Efectivo Contado -->
            <div class="seccion-efectivo">
                <h4>💰 Efectivo Contado</h4>
                <div class="inputs-efectivo">
                    <div class="input-group">
                        <label>Barra $</label>
                        <input type="number" id="efectivo-barra" placeholder="0" min="0">
                        <span id="esperado-barra" class="esperado">Esperado: $0</span>
                    </div>
                    <div class="input-group">
                        <label>Granizados $</label>
                        <input type="number" id="efectivo-granizados" placeholder="0" min="0">
                        <span id="esperado-granizados" class="esperado">Esperado: $0</span>
                    </div>
                </div>
                <button onclick="calcularYRegistrarDescuadres()" class="btn-descuadres">
                    📝 Calcular Descuadres
                </button>
                <div id="resultado-descuadres" class="resultado-descuadres"></div>
            </div>
            
            <!-- Resumen del Día -->
            <div class="seccion-resumen">
                <h4>📈 Resumen del Día</h4>
                <div id="resumen-diario" class="resumen-grid">
                    <div class="loading">Cargando resumen...</div>
                </div>
            </div>
        </div>
    `;
}

// ===== FUNCIONES DE INTERFAZ =====

async function ejecutarInferencia(pos) {
    const fecha = document.getElementById('fecha-selector').value;
    const btn = document.querySelector(`[data-pos="${pos}"]`);
    const resultado = document.getElementById('resultado-inferencia');
    
    // UI feedback
    btn.disabled = true;
    btn.innerHTML = '⏳ Procesando...';
    
    try {
        const respuesta = await inferirVentasEfectivo(pos, fecha);
        
        if (respuesta.success) {
            resultado.innerHTML += `
                <div class="inferencia-exitosa">
                    <h5>✅ ${respuesta.mensaje}</h5>
                    <ul>
                        ${respuesta.ventas.map(v => `
                            <li>${v.cantidad}x ${v.producto} = $${v.total.toLocaleString()}</li>
                        `).join('')}
                    </ul>
                    <strong>Total inferido: $${respuesta.total.toLocaleString()}</strong>
                </div>
            `;
            
            // Actualizar efectivo esperado
            await actualizarEfectivoEsperado();
            
        } else {
            resultado.innerHTML += `
                <div class="inferencia-error">
                    <h5>❌ Error en ${pos}</h5>
                    <p>${respuesta.mensaje}</p>
                </div>
            `;
        }
        
    } catch (error) {
        resultado.innerHTML += `
            <div class="inferencia-error">
                <h5>❌ Error en ${pos}</h5>
                <p>${error.message}</p>
            </div>
        `;
    } finally {
        btn.disabled = false;
        btn.innerHTML = `⚡ Inferir ${pos}`;
    }
}

async function actualizarEfectivoEsperado() {
    const fecha = document.getElementById('fecha-selector').value;
    const descuadres = await calcularDescuadres(fecha);
    
    document.getElementById('esperado-barra').textContent = 
        `Esperado: $${(descuadres.Barra?.esperado || 0).toLocaleString()}`;
    document.getElementById('esperado-granizados').textContent = 
        `Esperado: $${(descuadres.Granizados?.esperado || 0).toLocaleString()}`;
}

async function calcularYRegistrarDescuadres() {
    const fecha = document.getElementById('fecha-selector').value;
    const efectivoContado = {
        Barra: {
            contado: parseInt(document.getElementById('efectivo-barra').value) || 0,
            esperado: 0
        },
        Granizados: {
            contado: parseInt(document.getElementById('efectivo-granizados').value) || 0,
            esperado: 0
        }
    };
    
    // Recalcular esperado
    const descuadres = await calcularDescuadres(fecha);
    efectivoContado.Barra.esperado = descuadres.Barra?.esperado || 0;
    efectivoContado.Granizados.esperado = descuadres.Granizados?.esperado || 0;
    
    // Registrar descuadres
    const resultado = await registrarDescuadres(fecha, efectivoContado);
    
    const divResultado = document.getElementById('resultado-descuadres');
    
    if (resultado.success) {
        divResultado.innerHTML = `
            <div class="descuadres-exitoso">
                <h5>✅ ${resultado.mensaje}</h5>
                ${resultado.deudas.map(d => `
                    <div class="deuda-item">
                        <strong>${d.pos}:</strong> ${d.encargado} debe $${d.descuadre.toLocaleString()}
                    </div>
                `).join('')}
            </div>
        `;
    } else {
        divResultado.innerHTML = `
            <div class="descuadres-error">
                <h5>❌ ${resultado.mensaje}</h5>
            </div>
        `;
    }
    
    // Actualizar resumen
    await actualizarResumenDiario();
}

async function actualizarResumenDiario() {
    const fecha = document.getElementById('fecha-selector').value;
    const resumen = await generarResumenCierreDiario(fecha);
    
    if (!resumen) {
        document.getElementById('resumen-diario').innerHTML = '<div class="error">Error cargando resumen</div>';
        return;
    }
    
    document.getElementById('resumen-diario').innerHTML = `
        <div class="resumen-pos">
            <h5>🍺 Barra</h5>
            <div class="metricas">
                <div>Ventas: $${resumen.barra.ventas.toLocaleString()}</div>
                <div>Efectivo: $${resumen.barra.efectivo.toLocaleString()}</div>
                <div>Transferencias: $${resumen.barra.transferencias.toLocaleString()}</div>
            </div>
        </div>
        
        <div class="resumen-pos">
            <h5>🧊 Granizados</h5>
            <div class="metricas">
                <div>Ventas: $${resumen.granizados.ventas.toLocaleString()}</div>
                <div>Efectivo: $${resumen.granizados.efectivo.toLocaleString()}</div>
                <div>Transferencias: $${resumen.granizados.transferencias.toLocaleString()}</div>
            </div>
        </div>
        
        <div class="resumen-total">
            <h5>📊 Total del Día</h5>
            <div class="metricas-total">
                <div><strong>Ventas Totales: $${resumen.total.ventas.toLocaleString()}</strong></div>
                <div>Efectivo: $${resumen.total.efectivo.toLocaleString()}</div>
                <div>Transferencias: $${resumen.total.transferencias.toLocaleString()}</div>
                <div>Compras: $${resumen.total.compras.toLocaleString()}</div>
                <div>Gastos: $${resumen.total.gastos.toLocaleString()}</div>
            </div>
        </div>
    `;
}

// ===== ESTILOS CSS PARA LA INTERFAZ =====
const estilosCierreDiario = `
<style>
.cierre-diario {
    max-width: 1000px;
    margin: 0 auto;
    padding: 20px;
}

.seccion-inferencia, .seccion-efectivo, .seccion-resumen {
    background: white;
    margin: 20px 0;
    padding: 20px;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.botones-inferencia {
    display: flex;
    gap: 15px;
    margin: 15px 0;
}

.btn-inferir {
    background: linear-gradient(135deg, #10b981, #059669);
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    font-weight: bold;
    cursor: pointer;
    transition: all 0.3s;
}

.btn-inferir:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
}

.btn-inferir:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
}

.inputs-efectivo {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin: 15px 0;
}

.input-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.input-group label {
    font-weight: bold;
    color: #374151;
}

.input-group input {
    padding: 10px;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    font-size: 16px;
}

.esperado {
    font-size: 14px;
    color: #6b7280;
    font-style: italic;
}

.btn-descuadres {
    background: linear-gradient(135deg, #3b82f6, #2563eb);
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 8px;
    font-weight: bold;
    cursor: pointer;
    margin: 15px 0;
}

.resultado-inferencia, .resultado-descuadres {
    margin: 15px 0;
}

.inferencia-exitosa, .descuadres-exitoso {
    background: #f0fdf4;
    border: 1px solid #22c55e;
    padding: 15px;
    border-radius: 8px;
    margin: 10px 0;
}

.inferencia-error, .descuadres-error {
    background: #fef2f2;
    border: 1px solid #ef4444;
    padding: 15px;
    border-radius: 8px;
    margin: 10px 0;
}

.resumen-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 20px;
}

.resumen-pos, .resumen-total {
    background: #f8fafc;
    padding: 15px;
    border-radius: 8px;
    border-left: 4px solid #3b82f6;
}

.resumen-total {
    grid-column: 1 / -1;
    border-left-color: #10b981;
}

.metricas, .metricas-total {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 10px;
}

.metricas div, .metricas-total div {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    border-bottom: 1px solid #e5e7eb;
}

.deuda-item {
    background: #fef3c7;
    padding: 8px 12px;
    margin: 5px 0;
    border-radius: 4px;
    border-left: 3px solid #f59e0b;
}

@media (max-width: 768px) {
    .inputs-efectivo, .resumen-grid {
        grid-template-columns: 1fr;
    }
    
    .botones-inferencia {
        flex-direction: column;
    }
}
</style>
`;
// [Copiar todo el código del artefacto "cierre_semanal_completo"]
// ===== FUNCIONES PARA CIERRE SEMANAL COMPLETO =====

// 1. CALCULAR METRICAS DEL PERÍODO
async function calcularMetricasSemana(fechaInicio, fechaFin) {
    try {
        console.log(`📊 Calculando métricas de ${fechaInicio} a ${fechaFin}`);
        
        // 1. INGRESOS - Todas las ventas del período
        const ventas = await supabase
            .from('sales')
            .select(`
                qty, cash_amount, transfer_amount, pay_method, pos,
                products!inner(price, name, sku)
            `)
            .gte('date', fechaInicio)
            .lte('date', fechaFin);
        
        if (ventas.error) throw ventas.error;
        
        const ventasData = ventas.data || [];
        const ingresosTotales = ventasData.reduce((sum, venta) => {
            return sum + (venta.qty * venta.products.price);
        }, 0);
        
        // Desglose por método de pago
        const ingresosPorMetodo = {
            efectivo: ventasData.reduce((sum, v) => sum + (v.cash_amount || 0), 0),
            transferencia: ventasData.reduce((sum, v) => sum + (v.transfer_amount || 0), 0)
        };
        
        // Desglose por POS
        const ingresosPorPOS = {
            barra: ventasData.filter(v => v.pos === 'Barra').reduce((sum, v) => sum + (v.qty * v.products.price), 0),
            granizados: ventasData.filter(v => v.pos === 'Granizados').reduce((sum, v) => sum + (v.qty * v.products.price), 0)
        };
        
        // 2. COGS (Costo de Ventas) - Compras del período
        const compras = await supabase
            .from('purchases')
            .select('qty, unit_cost, pos, products!inner(name)')
            .gte('date', fechaInicio)
            .lte('date', fechaFin);
        
        if (compras.error) throw compras.error;
        
        const comprasData = compras.data || [];
        const cogs = comprasData.reduce((sum, compra) => {
            return sum + (compra.qty * compra.unit_cost);
        }, 0);
        
        const cogsPorPOS = {
            barra: comprasData.filter(c => c.pos === 'Barra').reduce((sum, c) => sum + (c.qty * c.unit_cost), 0),
            granizados: comprasData.filter(c => c.pos === 'Granizados').reduce((sum, c) => sum + (c.qty * c.unit_cost), 0)
        };
        
        // 3. GASTOS DEL PERÍODO
        const gastos = await supabase
            .from('expenses')
            .select('type, amount, concept, attributed_to')
            .gte('date', fechaInicio)
            .lte('date', fechaFin);
        
        if (gastos.error) throw gastos.error;
        
        const gastosData = gastos.data || [];
        const gastosPorTipo = {
            gasto: gastosData.filter(g => g.type === 'Gasto').reduce((sum, g) => sum + g.amount, 0),
            nomina: gastosData.filter(g => g.type === 'Nomina').reduce((sum, g) => sum + g.amount, 0),
            descuentoSocio: gastosData.filter(g => g.type === 'DescuentoSocio').reduce((sum, g) => sum + g.amount, 0)
        };
        
        // Descuentos por socio específico
        const descuentosPorSocio = {};
        gastosData.filter(g => g.type === 'DescuentoSocio').forEach(gasto => {
            const socio = gasto.attributed_to || 'Sin asignar';
            descuentosPorSocio[socio] = (descuentosPorSocio[socio] || 0) + gasto.amount;
        });
        
        // 4. GASTOS SEMANALES EXTRA
        const semanaInicio = obtenerLunesDeAntes(fechaInicio);
        const gastosSemanales = await supabase
            .from('weekly_expenses')
            .select('amount, concept, attributed_to')
            .eq('week_start', semanaInicio);
        
        if (gastosSemanales.error) throw gastosSemanales.error;
        
        const gastosSemanalesTotal = (gastosSemanales.data || []).reduce((sum, g) => sum + g.amount, 0);
        
        // 5. CÁLCULOS FINALES
        const utilidadBruta = ingresosTotales - cogs;
        const gastosOperativos = gastosPorTipo.gasto + gastosPorTipo.nomina + gastosSemanalesTotal;
        const resultadoOperativo = utilidadBruta - gastosOperativos - gastosPorTipo.descuentoSocio;
        
        return {
            periodo: { fechaInicio, fechaFin },
            ingresos: {
                total: ingresosTotales,
                porMetodo: ingresosPorMetodo,
                porPOS: ingresosPorPOS,
                ventasDetalle: ventasData
            },
            costos: {
                cogs,
                cogsPorPOS,
                comprasDetalle: comprasData
            },
            gastos: {
                porTipo: gastosPorTipo,
                semanales: gastosSemanalesTotal,
                total: gastosOperativos + gastosPorTipo.descuentoSocio,
                descuentosPorSocio
            },
            resultados: {
                utilidadBruta,
                gastosOperativos,
                resultadoOperativo,
                margenBruto: utilidadBruta / ingresosTotales * 100,
                margenOperativo: resultadoOperativo / ingresosTotales * 100
            }
        };
        
    } catch (error) {
        console.error('❌ Error calculando métricas:', error);
        throw error;
    }
}

// 2. OBTENER Y GESTIONAR SOCIOS
async function obtenerSocios() {
    try {
        const { data, error } = await supabase
            .from('partners')
            .select('*')
            .order('participation_pct', { ascending: false });
        
        if (error) throw error;
        
        // Validar que sumen 100%
        const totalPorcentaje = (data || []).reduce((sum, socio) => sum + socio.participation_pct, 0);
        
        return {
            socios: data || [],
            totalPorcentaje,
            esValido: Math.abs(totalPorcentaje - 100) < 0.01 // Tolerancia para decimales
        };
        
    } catch (error) {
        console.error('❌ Error obteniendo socios:', error);
        return { socios: [], totalPorcentaje: 0, esValido: false };
    }
}

async function actualizarSocio(id, datos) {
    try {
        const { data, error } = await supabase
            .from('partners')
            .update(datos)
            .eq('id', id)
            .select()
            .single();
        
        if (error) throw error;
        return { success: true, socio: data };
        
    } catch (error) {
        console.error('❌ Error actualizando socio:', error);
        return { success: false, error: error.message };
    }
}

async function agregarSocio(nombre, porcentaje) {
    try {
        const { data, error } = await supabase
            .from('partners')
            .insert({ name: nombre, participation_pct: porcentaje })
            .select()
            .single();
        
        if (error) throw error;
        return { success: true, socio: data };
        
    } catch (error) {
        console.error('❌ Error agregando socio:', error);
        return { success: false, error: error.message };
    }
}

// 3. CALCULAR REPARTO DE UTILIDADES
function calcularRepartoUtilidades(resultadoOperativo, socios, descuentosPorSocio) {
    const reparto = [];
    
    socios.forEach(socio => {
        const participacionBase = resultadoOperativo * (socio.participation_pct / 100);
        const descuentos = descuentosPorSocio[socio.name] || 0;
        const participacionNeta = participacionBase - descuentos;
        
        reparto.push({
            socio: socio.name,
            porcentaje: socio.participation_pct,
            participacionBase,
            descuentos,
            participacionNeta,
            id: socio.id
        });
    });
    
    return reparto;
}

// 4. GESTIONAR GASTOS SEMANALES EXTRA
async function obtenerGastosSemanales(semanaInicio) {
    try {
        const { data, error } = await supabase
            .from('weekly_expenses')
            .select('*')
            .eq('week_start', semanaInicio)
            .order('concept');
        
        if (error) throw error;
        return data || [];
        
    } catch (error) {
        console.error('❌ Error obteniendo gastos semanales:', error);
        return [];
    }
}

async function agregarGastoSemanal(semanaInicio, concepto, monto, atribuidoA = null) {
    try {
        const gasto = {
            week_start: semanaInicio,
            concept: concepto,
            amount: monto,
            attributed_to: atribuidoA
        };
        
        const { data, error } = await supabase
            .from('weekly_expenses')
            .insert(gasto)
            .select()
            .single();
        
        if (error) throw error;
        return { success: true, gasto: data };
        
    } catch (error) {
        console.error('❌ Error agregando gasto semanal:', error);
        return { success: false, error: error.message };
    }
}

async function eliminarGastoSemanal(id) {
    try {
        const { error } = await supabase
            .from('weekly_expenses')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        return { success: true };
        
    } catch (error) {
        console.error('❌ Error eliminando gasto semanal:', error);
        return { success: false, error: error.message };
    }
}

// 5. OBTENER DEUDAS VIGENTES
async function obtenerDeudasVigentes() {
    try {
        const { data, error } = await supabase
            .from('debts')
            .select('*')
            .gt('balance', 0)
            .order('date', { ascending: false });
        
        if (error) throw error;
        
        // Agrupar por persona
        const deudores = {};
        (data || []).forEach(deuda => {
            if (!deudores[deuda.person]) {
                deudores[deuda.person] = {
                    persona: deuda.person,
                    totalDeuda: 0,
                    deudas: []
                };
            }
            deudores[deuda.person].totalDeuda += deuda.balance;
            deudores[deuda.person].deudas.push(deuda);
        });
        
        return Object.values(deudores);
        
    } catch (error) {
        console.error('❌ Error obteniendo deudas:', error);
        return [];
    }
}

// 6. FUNCIONES AUXILIARES
function obtenerLunesDeAntes(fecha) {
    const date = new Date(fecha);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Ajustar al lunes
    return new Date(date.setDate(diff)).toISOString().split('T')[0];
}

function obtenerRangoSemana(fechaReferencia) {
    const lunesInicio = obtenerLunesDeAntes(fechaReferencia);
    const domingo = new Date(lunesInicio);
    domingo.setDate(domingo.getDate() + 6);
    
    return {
        inicio: lunesInicio,
        fin: domingo.toISOString().split('T')[0]
    };
}

function formatearMoneda(valor) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0
    }).format(valor);
}

function formatearPorcentaje(valor) {
    return `${valor.toFixed(2)}%`;
}

// ===== INTERFAZ DE USUARIO PARA CIERRE SEMANAL =====

function renderCierreSemanal() {
    const fechaActual = document.getElementById('fecha-selector').value;
    const rangoSemana = obtenerRangoSemana(fechaActual);
    
    return `
        <div class="cierre-semanal">
            <h3>📈 Cierre Semanal - ${rangoSemana.inicio} al ${rangoSemana.fin}</h3>
            
            <!-- Selector de Período -->
            <div class="selector-periodo">
                <label>Período de análisis:</label>
                <input type="date" id="fecha-inicio-semana" value="${rangoSemana.inicio}">
                <span>al</span>
                <input type="date" id="fecha-fin-semana" value="${rangoSemana.fin}">
                <button onclick="recalcularCierreSemanal()" class="btn-recalcular">
                    🔄 Recalcular
                </button>
            </div>
            
            <!-- Gastos Semanales Extra -->
            <div class="seccion-gastos-extra">
                <h4>💸 Gastos Semanales Extra</h4>
                <div class="form-gasto-extra">
                    <input type="text" id="concepto-extra" placeholder="Concepto (ej: Cemento, Pintura)">
                    <input type="number" id="monto-extra" placeholder="Monto" min="0">
                    <input type="text" id="atribuido-extra" placeholder="Atribuido a (opcional)">
                    <button onclick="agregarGastoExtra()" class="btn-agregar-gasto">
                        ➕ Agregar Gasto
                    </button>
                </div>
                <div id="lista-gastos-extra" class="lista-gastos-extra">
                    <div class="loading">Cargando gastos...</div>
                </div>
            </div>
            
            <!-- Gestión de Socios -->
            <div class="seccion-socios">
                <h4>👥 Gestión de Socios</h4>
                <div class="form-socio">
                    <input type="text" id="nombre-socio" placeholder="Nombre del socio">
                    <input type="number" id="porcentaje-socio" placeholder="% Participación" min="0" max="100" step="0.01">
                    <button onclick="agregarNuevoSocio()" class="btn-agregar-socio">
                        👤 Agregar Socio
                    </button>
                </div>
                <div id="lista-socios" class="lista-socios">
                    <div class="loading">Cargando socios...</div>
                </div>
            </div>
            
            <!-- Resultados del Período -->
            <div class="seccion-resultados">
                <h4>📊 Resultados del Período</h4>
                <div id="metricas-periodo" class="metricas-periodo">
                    <div class="loading">Calculando métricas...</div>
                </div>
            </div>
            
            <!-- Reparto de Utilidades -->
            <div class="seccion-reparto">
                <h4>💰 Reparto de Utilidades</h4>
                <div id="tabla-reparto" class="tabla-reparto">
                    <div class="loading">Calculando reparto...</div>
                </div>
            </div>
            
            <!-- Deudas Vigentes -->
            <div class="seccion-deudas">
                <h4>📋 Deudas Vigentes</h4>
                <div id="lista-deudas" class="lista-deudas">
                    <div class="loading">Cargando deudas...</div>
                </div>
            </div>
        </div>
    `;
}

// ===== FUNCIONES DE INTERFAZ =====

async function recalcularCierreSemanal() {
    const fechaInicio = document.getElementById('fecha-inicio-semana').value;
    const fechaFin = document.getElementById('fecha-fin-semana').value;
    
    if (!fechaInicio || !fechaFin) {
        alert('Por favor selecciona ambas fechas');
        return;
    }
    
    // Mostrar loading
    document.getElementById('metricas-periodo').innerHTML = '<div class="loading">Recalculando...</div>';
    document.getElementById('tabla-reparto').innerHTML = '<div class="loading">Recalculando...</div>';
    
    try {
        await cargarMetricasPeriodo(fechaInicio, fechaFin);
        await cargarRepartoUtilidades();
        
    } catch (error) {
        console.error('Error recalculando:', error);
        alert('Error al recalcular: ' + error.message);
    }
}

async function cargarMetricasPeriodo(fechaInicio, fechaFin) {
    try {
        const metricas = await calcularMetricasSemana(fechaInicio, fechaFin);
        
        document.getElementById('metricas-periodo').innerHTML = `
            <div class="metricas-grid">
                <!-- Ingresos -->
                <div class="metrica-card ingresos">
                    <h5>💰 Ingresos</h5>
                    <div class="valor-principal">${formatearMoneda(metricas.ingresos.total)}</div>
                    <div class="desglose">
                        <div>Efectivo: ${formatearMoneda(metricas.ingresos.porMetodo.efectivo)}</div>
                        <div>Transferencia: ${formatearMoneda(metricas.ingresos.porMetodo.transferencia)}</div>
                        <div>Barra: ${formatearMoneda(metricas.ingresos.porPOS.barra)}</div>
                        <div>Granizados: ${formatearMoneda(metricas.ingresos.porPOS.granizados)}</div>
                    </div>
                </div>
                
                <!-- Costos -->
                <div class="metrica-card costos">
                    <h5>📦 Costo de Ventas (COGS)</h5>
                    <div class="valor-principal">${formatearMoneda(metricas.costos.cogs)}</div>
                    <div class="desglose">
                        <div>Barra: ${formatearMoneda(metricas.costos.cogsPorPOS.barra)}</div>
                        <div>Granizados: ${formatearMoneda(metricas.costos.cogsPorPOS.granizados)}</div>
                    </div>
                </div>
                
                <!-- Gastos -->
                <div class="metrica-card gastos">
                    <h5>💸 Gastos</h5>
                    <div class="valor-principal">${formatearMoneda(metricas.gastos.total)}</div>
                    <div class="desglose">
                        <div>Operativos: ${formatearMoneda(metricas.gastos.porTipo.gasto)}</div>
                        <div>Nómina: ${formatearMoneda(metricas.gastos.porTipo.nomina)}</div>
                        <div>Desc. Socios: ${formatearMoneda(metricas.gastos.porTipo.descuentoSocio)}</div>
                        <div>Extra semana: ${formatearMoneda(metricas.gastos.semanales)}</div>
                    </div>
                </div>
                
                <!-- Resultados -->
                <div class="metrica-card resultados">
                    <h5>📈 Resultados</h5>
                    <div class="resultado-item">
                        <span>Utilidad Bruta:</span>
                        <span>${formatearMoneda(metricas.resultados.utilidadBruta)}</span>
                        <small>(${formatearPorcentaje(metricas.resultados.margenBruto)})</small>
                    </div>
                    <div class="resultado-item destacado">
                        <span><strong>Resultado Operativo:</strong></span>
                        <span><strong>${formatearMoneda(metricas.resultados.resultadoOperativo)}</strong></span>
                        <small>(${formatearPorcentaje(metricas.resultados.margenOperativo)})</small>
                    </div>
                </div>
            </div>
        `;
        
        // Guardar métricas para el reparto
        window.metricasActuales = metricas;
        
    } catch (error) {
        document.getElementById('metricas-periodo').innerHTML = `
            <div class="error">Error cargando métricas: ${error.message}</div>
        `;
    }
}

async function cargarSocios() {
    try {
        const { socios, totalPorcentaje, esValido } = await obtenerSocios();
        
        let html = `
            <div class="validacion-porcentaje ${esValido ? 'valido' : 'invalido'}">
                Total porcentajes: ${totalPorcentaje.toFixed(2)}% 
                ${esValido ? '✅' : '❌ Debe sumar 100%'}
            </div>
            <div class="socios-lista">
        `;
        
        socios.forEach(socio => {
            html += `
                <div class="socio-item">
                    <div class="socio-info">
                        <strong>${socio.name}</strong>
                        <span>${socio.participation_pct}%</span>
                    </div>
                    <div class="socio-acciones">
                        <input type="number" 
                               id="pct-${socio.id}" 
                               value="${socio.participation_pct}" 
                               min="0" max="100" step="0.01" 
                               onchange="actualizarPorcentajeSocio(${socio.id}, this.value)">
                        <button onclick="eliminarSocio(${socio.id})" class="btn-eliminar">🗑️</button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        document.getElementById('lista-socios').innerHTML = html;
        
        return { socios, esValido };
        
    } catch (error) {
        document.getElementById('lista-socios').innerHTML = `
            <div class="error">Error cargando socios: ${error.message}</div>
        `;
        return { socios: [], esValido: false };
    }
}

async function cargarRepartoUtilidades() {
    try {
        if (!window.metricasActuales) {
            document.getElementById('tabla-reparto').innerHTML = '<div class="info">Primero calcula las métricas del período</div>';
            return;
        }
        
        const { socios, esValido } = await cargarSocios();
        
        if (!esValido) {
            document.getElementById('tabla-reparto').innerHTML = `
                <div class="warning">⚠️ Los porcentajes de socios no suman 100%. Ajusta los porcentajes para ver el reparto correcto.</div>
            `;
            return;
        }
        
        const reparto = calcularRepartoUtilidades(
            window.metricasActuales.resultados.resultadoOperativo,
            socios,
            window.metricasActuales.gastos.descuentosPorSocio
        );
        
        let html = `
            <div class="reparto-header">
                <h5>Resultado Operativo a repartir: ${formatearMoneda(window.metricasActuales.resultados.resultadoOperativo)}</h5>
            </div>
            <table class="tabla-reparto-detalle">
                <thead>
                    <tr>
                        <th>Socio</th>
                        <th>%</th>
                        <th>Participación Base</th>
                        <th>Descuentos</th>
                        <th>Participación Neta</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        reparto.forEach(item => {
            html += `
                <tr>
                    <td><strong>${item.socio}</strong></td>
                    <td>${formatearPorcentaje(item.porcentaje)}</td>
                    <td>${formatearMoneda(item.participacionBase)}</td>
                    <td class="descuentos">${formatearMoneda(item.descuentos)}</td>
                    <td class="neta ${item.participacionNeta >= 0 ? 'positiva' : 'negativa'}">
                        <strong>${formatearMoneda(item.participacionNeta)}</strong>
                    </td>
                </tr>
            `;
        });
        
        const totalNeto = reparto.reduce((sum, item) => sum + item.participacionNeta, 0);
        
        html += `
                </tbody>
                <tfoot>
                    <tr class="total">
                        <td colspan="4"><strong>Total Neto:</strong></td>
                        <td><strong>${formatearMoneda(totalNeto)}</strong></td>
                    </tr>
                </tfoot>
            </table>
        `;
        
        document.getElementById('tabla-reparto').innerHTML = html;
        
    } catch (error) {
        document.getElementById('tabla-reparto').innerHTML = `
            <div class="error">Error calculando reparto: ${error.message}</div>
        `;
    }
}

async function cargarGastosSemanales() {
    try {
        const fechaInicio = document.getElementById('fecha-inicio-semana').value;
        const semanaInicio = obtenerLunesDeAntes(fechaInicio);
        const gastos = await obtenerGastosSemanales(semanaInicio);
        
        if (gastos.length === 0) {
            document.getElementById('lista-gastos-extra').innerHTML = '<div class="info">No hay gastos semanales registrados</div>';
            return;
        }
        
        let html = '<div class="gastos-items">';
        let total = 0;
        
        gastos.forEach(gasto => {
            total += gasto.amount;
            html += `
                <div class="gasto-item">
                    <div class="gasto-info">
                        <strong>${gasto.concept}</strong>
                        <span>${formatearMoneda(gasto.amount)}</span>
                        ${gasto.attributed_to ? `<small>Atribuido a: ${gasto.attributed_to}</small>` : ''}
                    </div>
                    <button onclick="eliminarGastoExtra(${gasto.id})" class="btn-eliminar-gasto">🗑️</button>
                </div>
            `;
        });
        
        html += `</div><div class="total-gastos-extra">Total: ${formatearMoneda(total)}</div>`;
        document.getElementById('lista-gastos-extra').innerHTML = html;
        
    } catch (error) {
        document.getElementById('lista-gastos-extra').innerHTML = `
            <div class="error">Error cargando gastos: ${error.message}</div>
        `;
    }
}

async function cargarDeudasVigentes() {
    try {
        const deudores = await obtenerDeudasVigentes();
        
        if (deudores.length === 0) {
            document.getElementById('lista-deudas').innerHTML = '<div class="info">✅ No hay deudas vigentes</div>';
            return;
        }
        
        let html = '<div class="deudores-lista">';
        let totalDeudas = 0;
        
        deudores.forEach(deudor => {
            totalDeudas += deudor.totalDeuda;
            html += `
                <div class="deudor-item">
                    <div class="deudor-header">
                        <strong>${deudor.persona}</strong>
                        <span class="total-deuda">${formatearMoneda(deudor.totalDeuda)}</span>
                    </div>
                    <div class="deudas-detalle">
            `;
            
            deudor.deudas.forEach(deuda => {
                html += `
                    <div class="deuda-detalle">
                        <span>${deuda.date}</span>
                        <span>${deuda.reason}</span>
                        <span>${formatearMoneda(deuda.balance)}</span>
                    </div>
                `;
            });
            
            html += '</div></div>';
        });
        
        html += `</div><div class="total-deudas-general">Total Deudas: ${formatearMoneda(totalDeudas)}</div>`;
        document.getElementById('lista-deudas').innerHTML = html;
        
    } catch (error) {
        document.getElementById('lista-deudas').innerHTML = `
            <div class="error">Error cargando deudas: ${error.message}</div>
        `;
    }
}

// ===== FUNCIONES DE ACCIONES =====

async function agregarGastoExtra() {
    const concepto = document.getElementById('concepto-extra').value.trim();
    const monto = parseInt(document.getElementById('monto-extra').value) || 0;
    const atribuido = document.getElementById('atribuido-extra').value.trim() || null;
    
    if (!concepto || monto <= 0) {
        alert('Por favor completa el concepto y un monto válido');
        return;
    }
    
    try {
        const fechaInicio = document.getElementById('fecha-inicio-semana').value;
        const semanaInicio = obtenerLunesDeAntes(fechaInicio);
        
        const resultado = await agregarGastoSemanal(semanaInicio, concepto, monto, atribuido);
        
        if (resultado.success) {
            // Limpiar formulario
            document.getElementById('concepto-extra').value = '';
            document.getElementById('monto-extra').value = '';
            document.getElementById('atribuido-extra').value = '';
            
            // Recargar listas
            await cargarGastosSemanales();
            await recalcularCierreSemanal();
            
        } else {
            alert('Error agregando gasto: ' + resultado.error);
        }
        
    } catch (error) {
        console.error('Error agregando gasto extra:', error);
        alert('Error: ' + error.message);
    }
}

async function eliminarGastoExtra(id) {
    if (!confirm('¿Estás seguro de eliminar este gasto?')) return;
    
    try {
        const resultado = await eliminarGastoSemanal(id);
        
        if (resultado.success) {
            await cargarGastosSemanales();
            await recalcularCierreSemanal();
        } else {
            alert('Error eliminando gasto: ' + resultado.error);
        }
        
    } catch (error) {
        console.error('Error eliminando gasto:', error);
        alert('Error: ' + error.message);
    }
}

async function agregarNuevoSocio() {
    const nombre = document.getElementById('nombre-socio').value.trim();
    const porcentaje = parseFloat(document.getElementById('porcentaje-socio').value) || 0;
    
    if (!nombre || porcentaje <= 0 || porcentaje > 100) {
        alert('Por favor completa un nombre válido y porcentaje entre 0 y 100');
        return;
    }
    
    try {
        const resultado = await agregarSocio(nombre, porcentaje);
        
        if (resultado.success) {
            // Limpiar formulario
            document.getElementById('nombre-socio').value = '';
            document.getElementById('porcentaje-socio').value = '';
            
            // Recargar socios y reparto
            await cargarSocios();
            await cargarRepartoUtilidades();
            
        } else {
            alert('Error agregando socio: ' + resultado.error);
        }
        
    } catch (error) {
        console.error('Error agregando socio:', error);
        alert('Error: ' + error.message);
    }
}

async function actualizarPorcentajeSocio(id, nuevoPorcentaje) {
    const porcentaje = parseFloat(nuevoPorcentaje);
    
    if (isNaN(porcentaje) || porcentaje < 0 || porcentaje > 100) {
        alert('Porcentaje debe ser entre 0 y 100');
        return;
    }
    
    try {
        const resultado = await actualizarSocio(id, { participation_pct: porcentaje });
        
        if (resultado.success) {
            await cargarSocios();
            await cargarRepartoUtilidades();
        } else {
            alert('Error actualizando socio: ' + resultado.error);
        }
        
    } catch (error) {
        console.error('Error actualizando porcentaje:', error);
        alert('Error: ' + error.message);
    }
}

async function eliminarSocio(id) {
    if (!confirm('¿Estás seguro de eliminar este socio?')) return;
    
    try {
        const { error } = await supabase
            .from('partners')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        await cargarSocios();
        await cargarRepartoUtilidades();
        
    } catch (error) {
        console.error('Error eliminando socio:', error);
        alert('Error: ' + error.message);
    }
}

// ===== INICIALIZACIÓN DE LA INTERFAZ =====

async function inicializarCierreSemanal() {
    try {
        // Cargar datos iniciales
        await cargarGastosSemanales();
        await cargarSocios();
        await cargarDeudasVigentes();
        
        // Calcular métricas del período actual
        const fechaInicio = document.getElementById('fecha-inicio-semana').value;
        const fechaFin = document.getElementById('fecha-fin-semana').value;
        await cargarMetricasPeriodo(fechaInicio, fechaFin);
        await cargarRepartoUtilidades();
        
    } catch (error) {
        console.error('Error inicializando cierre semanal:', error);
    }
}

// ===== ESTILOS CSS PARA CIERRE SEMANAL =====
const estilosCierreSemanal = `
<style>
.cierre-semanal {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}

.selector-periodo {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 30px;
    padding: 15px;
    background: #f8fafc;
    border-radius: 8px;
}

.selector-periodo input[type="date"] {
    padding: 8px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
}

.btn-recalcular {
    background: #3b82f6;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    cursor: pointer;
}

.seccion-gastos-extra, .seccion-socios, .seccion-resultados, 
.seccion-reparto, .seccion-deudas {
    background: white;
    margin: 20px 0;
    padding: 20px;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}

.form-gasto-extra, .form-socio {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr auto;
    gap: 10px;
    margin-bottom: 20px;
    align-items: center;
}

.form-gasto-extra input, .form-socio input {
    padding: 10px;
    border: 1px solid #d1d5db;
    border-radius: 6px;
}

.btn-agregar-gasto, .btn-agregar-socio {
    background: #10b981;
    color: white;
    border: none;
    padding: 10px 15px;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
}

.gastos-items, .socios-lista, .deudores-lista {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.gasto-item, .socio-item, .deudor-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: #f8fafc;
    border-radius: 6px;
    border-left: 3px solid #3b82f6;
}

.deudor-item {
    border-left-color: #ef4444;
    flex-direction: column;
    align-items: stretch;
}

.deudor-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
}

.deudas-detalle {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding-left: 15px;
}

.deuda-detalle {
    display: grid;
    grid-template-columns: auto 1fr auto;
    gap: 10px;
    padding: 5px 0;
    border-bottom: 1px solid #e5e7eb;
    font-size: 14px;
}

.gasto-info, .socio-info {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.socio-acciones {
    display: flex;
    gap: 10px;
    align-items: center;
}

.socio-acciones input {
    width: 80px;
    padding: 5px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
}

.btn-eliminar, .btn-eliminar-gasto {
    background: #ef4444;
    color: white;
    border: none;
    padding: 5px 8px;
    border-radius: 4px;
    cursor: pointer;
}

.validacion-porcentaje {
    padding: 10px;
    border-radius: 6px;
    margin-bottom: 15px;
    font-weight: bold;
}

.validacion-porcentaje.valido {
    background: #f0fdf4;
    color: #15803d;
    border: 1px solid #22c55e;
}

.validacion-porcentaje.invalido {
    background: #fef2f2;
    color: #dc2626;
    border: 1px solid #ef4444;
}

.metricas-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 20px;
}

.metrica-card {
    padding: 20px;
    border-radius: 10px;
    border-left: 4px solid;
}

.metrica-card.ingresos {
    background: #f0fdf4;
    border-left-color: #22c55e;
}

.metrica-card.costos {
    background: #fef3c7;
    border-left-color: #f59e0b;
}

.metrica-card.gastos {
    background: #fef2f2;
    border-left-color: #ef4444;
}

.metrica-card.resultados {
    background: #eff6ff;
    border-left-color: #3b82f6;
}

.valor-principal {
    font-size: 24px;
    font-weight: bold;
    margin: 10px 0;
}

.desglose {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 14px;
    color: #6b7280;
}

.resultado-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid #e5e7eb;
}

.resultado-item.destacado {
    border-bottom: 2px solid #3b82f6;
    font-size: 16px;
}

.tabla-reparto-detalle {
    width: 100%;
    border-collapse: collapse;
    margin-top: 15px;
}

.tabla-reparto-detalle th,
.tabla-reparto-detalle td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid #e5e7eb;
}

.tabla-reparto-detalle th {
    background: #f8fafc;
    font-weight: bold;
    color: #374151;
}

.tabla-reparto-detalle .descuentos {
    color: #dc2626;
}

.tabla-reparto-detalle .neta.positiva {
    color: #059669;
}

.tabla-reparto-detalle .neta.negativa {
    color: #dc2626;
}

.tabla-reparto-detalle tfoot tr.total {
    background: #f8fafc;
    font-weight: bold;
    border-top: 2px solid #3b82f6;
}

.reparto-header {
    text-align: center;
    padding: 15px;
    background: #eff6ff;
    border-radius: 6px;
    margin-bottom: 15px;
}

.total-gastos-extra, .total-deudas-general {
    text-align: center;
    font-weight: bold;
    font-size: 18px;
    padding: 15px;
    background: #f8fafc;
    border-radius: 6px;
    margin-top: 15px;
}

.loading, .info, .error, .warning {
    text-align: center;
    padding: 20px;
    border-radius: 6px;
    margin: 10px 0;
}

.loading {
    background: #f3f4f6;
    color: #6b7280;
}

.info {
    background: #eff6ff;
    color: #1d4ed8;
}

.error {
    background: #fef2f2;
    color: #dc2626;
}

.warning {
    background: #fef3c7;
    color: #d97706;
}

.total-deuda {
    font-weight: bold;
    color: #dc2626;
}

@media (max-width: 768px) {
    .form-gasto-extra, .form-socio {
        grid-template-columns: 1fr;
    }
    
    .metricas-grid {
        grid-template-columns: 1fr;
    }
    
    .selector-periodo {
        flex-direction: column;
        align-items: stretch;
    }
    
    .tabla-reparto-detalle {
        font-size: 14px;
    }
    
    .tabla-reparto-detalle th,
    .tabla-reparto-detalle td {
        padding: 8px 4px;
    }
}
</style>
`;

// ===== FUNCIÓN PRINCIPAL PARA INTEGRAR CON LA APP =====

// Esta función debe llamarse cuando se carga la sección de cierres
function cargarCierreSemanal() {
    // Insertar HTML
    document.getElementById('cierre-semanal-container').innerHTML = renderCierreSemanal();
    
    // Insertar estilos
    if (!document.getElementById('estilos-cierre-semanal')) {
        const styleElement = document.createElement('div');
        styleElement.id = 'estilos-cierre-semanal';
        styleElement.innerHTML = estilosCierreSemanal;
        document.head.appendChild(styleElement);
    }
    
    // Inicializar datos
    setTimeout(() => {
        inicializarCierreSemanal();
    }, 100);
}

// Función para exportar métricas (opcional)
function exportarMetricasSemanal() {
    if (!window.metricasActuales) {
        alert('Primero calcula las métricas del período');
        return;
    }
    
    const datos = {
        periodo: window.metricasActuales.periodo,
        resumen: {
            ingresos: window.metricasActuales.ingresos.total,
            cogs: window.metricasActuales.costos.cogs,
            gastosTotal: window.metricasActuales.gastos.total,
            resultadoOperativo: window.metricasActuales.resultados.resultadoOperativo,
            margenOperativo: window.metricasActuales.resultados.margenOperativo
        },
        timestamp: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metricas_${datos.periodo.fechaInicio}_${datos.periodo.fechaFin}.json`;
    a.click();
    URL.revokeObjectURL(url);
}
// [Copiar todo el código del artefacto "vista_administracion_completa"]
// ===== VISTA DE ADMINISTRACIÓN COMPLETA =====

// 1. GESTIÓN DE DEUDORES Y PAGOS
async function obtenerDeudoresCompleto() {
    try {
        const { data, error } = await supabase
            .from('debts')
            .select('*')
            .order('date', { ascending: false });
        
        if (error) throw error;
        
        // Agrupar por persona y calcular totales
        const deudores = {};
        (data || []).forEach(deuda => {
            if (!deudores[deuda.person]) {
                deudores[deuda.person] = {
                    persona: deuda.person,
                    totalOriginal: 0,
                    totalPendiente: 0,
                    deudas: [],
                    ultimaDeuda: null
                };
            }
            
            deudores[deuda.person].totalOriginal += deuda.amount;
            deudores[deuda.person].totalPendiente += deuda.balance;
            deudores[deuda.person].deudas.push(deuda);
            
            if (!deudores[deuda.person].ultimaDeuda || 
                new Date(deuda.date) > new Date(deudores[deuda.person].ultimaDeuda)) {
                deudores[deuda.person].ultimaDeuda = deuda.date;
            }
        });
        
        return Object.values(deudores).sort((a, b) => b.totalPendiente - a.totalPendiente);
        
    } catch (error) {
        console.error('❌ Error obteniendo deudores:', error);
        return [];
    }
}

async function registrarPagoDeuda(deudaId, montoPago, metodoPago = 'Efectivo', notas = '') {
    try {
        // Obtener deuda actual
        const { data: deuda, error: errorDeuda } = await supabase
            .from('debts')
            .select('*')
            .eq('id', deudaId)
            .single();
        
        if (errorDeuda) throw errorDeuda;
        
        if (montoPago <= 0 || montoPago > deuda.balance) {
            throw new Error('Monto de pago inválido');
        }
        
        // Actualizar balance de la deuda
        const nuevoBalance = deuda.balance - montoPago;
        const { error: errorUpdate } = await supabase
            .from('debts')
            .update({ balance: nuevoBalance })
            .eq('id', deudaId);
        
        if (errorUpdate) throw errorUpdate;
        
        // Registrar el pago (opcional: crear tabla de pagos para historial)
        const registroPago = {
            debt_id: deudaId,
            amount: montoPago,
            payment_method: metodoPago,
            payment_date: new Date().toISOString().split('T')[0],
            notes: notas
        };
        
        // Si existe tabla debt_payments, registrar ahí
        try {
            await supabase
                .from('debt_payments')
                .insert(registroPago);
        } catch (e) {
            console.log('Tabla debt_payments no existe, continuando...');
        }
        
        return {
            success: true,
            mensaje: `Pago registrado: $${montoPago.toLocaleString()}`,
            nuevoBalance,
            saldado: nuevoBalance === 0
        };
        
    } catch (error) {
        console.error('❌ Error registrando pago:', error);
        return {
            success: false,
            mensaje: error.message
        };
    }
}

async function condonarDeuda(deudaId, motivo = '') {
    try {
        const { error } = await supabase
            .from('debts')
            .update({ 
                balance: 0,
                reason: motivo ? `${motivo} (CONDONADA)` : 'CONDONADA'
            })
            .eq('id', deudaId);
        
        if (error) throw error;
        
        return { success: true, mensaje: 'Deuda condonada exitosamente' };
        
    } catch (error) {
        console.error('❌ Error condonando deuda:', error);
        return { success: false, mensaje: error.message };
    }
}

// 2. GESTIÓN DE ENCARGADOS POS
async function obtenerEncargados() {
    try {
        const { data, error } = await supabase
            .from('pos_managers')
            .select('*');
        
        if (error) throw error;
        return data || [];
        
    } catch (error) {
        console.error('❌ Error obteniendo encargados:', error);
        return [];
    }
}

async function actualizarEncargado(pos, nuevoEncargado) {
    try {
        const { data, error } = await supabase
            .from('pos_managers')
            .upsert({ pos, manager_name: nuevoEncargado })
            .select()
            .single();
        
        if (error) throw error;
        return { success: true, encargado: data };
        
    } catch (error) {
        console.error('❌ Error actualizando encargado:', error);
        return { success: false, mensaje: error.message };
    }
}

// 3. REPORTES Y ESTADÍSTICAS
async function generarReporteRapido(fechaInicio, fechaFin) {
    try {
        // Ventas por producto
        const { data: ventas, error: errorVentas } = await supabase
            .from('sales')
            .select(`
                qty, cash_amount, transfer_amount, pos,
                products!inner(name, sku, price)
            `)
            .gte('date', fechaInicio)
            .lte('date', fechaFin);
        
        if (errorVentas) throw errorVentas;
        
        // Análisis por producto
        const ventasPorProducto = {};
        let totalVentas = 0;
        let totalEfectivo = 0;
        let totalTransferencia = 0;
        
        (ventas || []).forEach(venta => {
            const producto = venta.products.name;
            if (!ventasPorProducto[producto]) {
                ventasPorProducto[producto] = {
                    nombre: producto,
                    sku: venta.products.sku,
                    cantidad: 0,
                    ingresos: 0,
                    precio: venta.products.price
                };
            }
            
            ventasPorProducto[producto].cantidad += venta.qty;
            ventasPorProducto[producto].ingresos += venta.qty * venta.products.price;
            
            totalVentas += venta.qty * venta.products.price;
            totalEfectivo += venta.cash_amount || 0;
            totalTransferencia += venta.transfer_amount || 0;
        });
        
        // Top productos
        const topProductos = Object.values(ventasPorProducto)
            .sort((a, b) => b.ingresos - a.ingresos)
            .slice(0, 10);
        
        // Ventas por POS
        const ventasPorPOS = {
            Barra: ventas.filter(v => v.pos === 'Barra').reduce((sum, v) => sum + (v.qty * v.products.price), 0),
            Granizados: ventas.filter(v => v.pos === 'Granizados').reduce((sum, v) => sum + (v.qty * v.products.price), 0)
        };
        
        // Análisis por día
        const ventasPorDia = {};
        ventas.forEach(venta => {
            const fecha = venta.date || new Date().toISOString().split('T')[0];
            if (!ventasPorDia[fecha]) {
                ventasPorDia[fecha] = 0;
            }
            ventasPorDia[fecha] += venta.qty * venta.products.price;
        });
        
        return {
            periodo: { fechaInicio, fechaFin },
            resumen: {
                totalVentas,
                totalEfectivo,
                totalTransferencia,
                promedioVentaDiaria: totalVentas / Object.keys(ventasPorDia).length
            },
            topProductos,
            ventasPorPOS,
            ventasPorDia: Object.entries(ventasPorDia).map(([fecha, total]) => ({ fecha, total }))
        };
        
    } catch (error) {
        console.error('❌ Error generando reporte:', error);
        throw error;
    }
}

// 4. BACKUP Y RESTORE DE DATOS
async function exportarDatos(fechaInicio, fechaFin) {
    try {
        console.log('📦 Exportando datos...');
        
        // Obtener todas las tablas principales
        const [ventas, compras, gastos, inventario, productos, socios, deudas] = await Promise.all([
            supabase.from('sales').select('*').gte('date', fechaInicio).lte('date', fechaFin),
            supabase.from('purchases').select('*').gte('date', fechaInicio).lte('date', fechaFin),
            supabase.from('expenses').select('*').gte('date', fechaInicio).lte('date', fechaFin),
            supabase.from('inventory_counts').select('*').gte('count_date', fechaInicio).lte('count_date', fechaFin),
            supabase.from('products').select('*'),
            supabase.from('partners').select('*'),
            supabase.from('debts').select('*')
        ]);
        
        const backup = {
            metadata: {
                fechaExportacion: new Date().toISOString(),
                periodo: { fechaInicio, fechaFin },
                version: '1.0'
            },
            datos: {
                ventas: ventas.data || [],
                compras: compras.data || [],
                gastos: gastos.data || [],
                inventario: inventario.data || [],
                productos: productos.data || [],
                socios: socios.data || [],
                deudas: deudas.data || []
            }
        };
        
        return backup;
        
    } catch (error) {
        console.error('❌ Error exportando datos:', error);
        throw error;
    }
}

function descargarBackup(datos, nombreArchivo) {
    const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo || `backup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 5. INTERFAZ DE ADMINISTRACIÓN
function renderVistaAdministracion() {
    return `
        <div class="administracion-completa">
            <h2>🛠️ Administración del Sistema</h2>
            
            <!-- Navegación de secciones -->
            <div class="nav-admin">
                <button onclick="mostrarSeccionAdmin('deudores')" class="nav-btn active" data-section="deudores">
                    💸 Deudores
                </button>
                <button onclick="mostrarSeccionAdmin('productos')" class="nav-btn" data-section="productos">
                    📦 Productos
                </button>
                <button onclick="mostrarSeccionAdmin('empleados')" class="nav-btn" data-section="empleados">
                    👥 Empleados
                </button>
                <button onclick="mostrarSeccionAdmin('encargados')" class="nav-btn" data-section="encargados">
                    👨‍💼 Encargados POS
                </button>
                <button onclick="mostrarSeccionAdmin('reportes')" class="nav-btn" data-section="reportes">
                    📊 Reportes
                </button>
                <button onclick="mostrarSeccionAdmin('sistema')" class="nav-btn" data-section="sistema">
                    ⚙️ Sistema
                </button>
            </div>
            
            <!-- Sección Deudores -->
            <div id="seccion-deudores" class="seccion-admin active">
                <h3>💸 Gestión de Deudores</h3>
                
                <div class="resumen-deudas">
                    <div class="card-resumen">
                        <h4>💰 Total Deudas Pendientes</h4>
                        <div id="total-deudas-pendientes" class="valor-grande">$0</div>
                    </div>
                    <div class="card-resumen">
                        <h4>👤 Número de Deudores</h4>
                        <div id="numero-deudores" class="valor-grande">0</div>
                    </div>
                </div>
                
                <div class="filtros-deudas">
                    <input type="text" id="filtro-deudor" placeholder="Buscar por nombre..." onkeyup="filtrarDeudores()">
                    <select id="filtro-estado" onchange="filtrarDeudores()">
                        <option value="todos">Todos</option>
                        <option value="pendientes">Solo pendientes</option>
                        <option value="saldados">Solo saldados</option>
                    </select>
                </div>
                
                <div id="lista-deudores-admin" class="lista-deudores-admin">
                    <div class="loading">Cargando deudores...</div>
                </div>
            </div>
            
            <!-- Sección Productos -->
            <div id="seccion-productos" class="seccion-admin">
                <h3>📦 Gestión de Productos</h3>
                
                <div class="form-producto">
                    <input type="text" id="sku-producto" placeholder="SKU">
                    <input type="text" id="nombre-producto" placeholder="Nombre">
                    <input type="number" id="precio-producto" placeholder="Precio" min="0">
                    <select id="pos-producto">
                        <option value="Barra">Barra</option>
                        <option value="Granizados">Granizados</option>
                    </select>
                    <input type="number" id="vasos-producto" placeholder="Vasos por unidad" min="0" value="0">
                    <button onclick="guardarProducto()" class="btn-guardar-producto">
                        💾 Guardar Producto
                    </button>
                </div>
                
                <div id="lista-productos-admin" class="lista-productos-admin">
                    <div class="loading">Cargando productos...</div>
                </div>
            </div>
            
            <!-- Sección Empleados -->
            <div id="seccion-empleados" class="seccion-admin">
                <h3>👥 Gestión de Empleados</h3>
                
                <div class="form-empleado">
                    <input type="text" id="nombre-empleado" placeholder="Nombre completo">
                    <input type="text" id="rol-empleado" placeholder="Rol/Puesto">
                    <input type="number" id="salario-empleado" placeholder="Salario diario" min="0">
                    <button onclick="guardarEmpleado()" class="btn-guardar-empleado">
                        👤 Agregar Empleado
                    </button>
                </div>
                
                <div id="lista-empleados-admin" class="lista-empleados-admin">
                    <div class="loading">Cargando empleados...</div>
                </div>
            </div>
            
            <!-- Sección Encargados POS -->
            <div id="seccion-encargados" class="seccion-admin">
                <h3>👨‍💼 Encargados por POS</h3>
                
                <div class="encargados-grid">
                    <div class="encargado-card">
                        <h4>🍺 Barra</h4>
                        <div class="encargado-form">
                            <input type="text" id="encargado-barra" placeholder="Nombre del encargado">
                            <button onclick="actualizarEncargadoPOS('Barra')" class="btn-actualizar-encargado">
                                💾 Actualizar
                            </button>
                        </div>
                        <div id="actual-barra" class="encargado-actual">Sin asignar</div>
                    </div>
                    
                    <div class="encargado-card">
                        <h4>🧊 Granizados</h4>
                        <div class="encargado-form">
                            <input type="text" id="encargado-granizados" placeholder="Nombre del encargado">
                            <button onclick="actualizarEncargadoPOS('Granizados')" class="btn-actualizar-encargado">
                                💾 Actualizar
                            </button>
                        </div>
                        <div id="actual-granizados" class="encargado-actual">Sin asignar</div>
                    </div>
                </div>
            </div>
            
            <!-- Sección Reportes -->
            <div id="seccion-reportes" class="seccion-admin">
                <h3>📊 Reportes y Estadísticas</h3>
                
                <div class="generador-reportes">
                    <h4>Generar Reporte Rápido</h4>
                    <div class="form-reporte">
                        <input type="date" id="fecha-inicio-reporte">
                        <input type="date" id="fecha-fin-reporte">
                        <button onclick="generarReporte()" class="btn-generar-reporte">
                            📈 Generar Reporte
                        </button>
                    </div>
                </div>
                
                <div id="resultados-reporte" class="resultados-reporte">
                    <!-- Aquí se mostrarán los resultados -->
                </div>
            </div>
            
            <!-- Sección Sistema -->
            <div id="seccion-sistema" class="seccion-admin">
                <h3>⚙️ Sistema y Backup</h3>
                
                <div class="sistema-grid">
                    <div class="sistema-card">
                        <h4>💾 Backup de Datos</h4>
                        <p>Exportar todos los datos del sistema</p>
                        <div class="backup-form">
                            <input type="date" id="backup-inicio" placeholder="Fecha inicio">
                            <input type="date" id="backup-fin" placeholder="Fecha fin">
                            <button onclick="exportarDatosCompletos()" class="btn-backup">
                                📦 Exportar Datos
                            </button>
                        </div>
                    </div>
                    
                    <div class="sistema-card">
                        <h4>🔧 Mantenimiento</h4>
                        <p>Herramientas de limpieza y optimización</p>
                        <button onclick="limpiarDatosObsoletos()" class="btn-mantenimiento">
                            🧹 Limpiar Datos Obsoletos
                        </button>
                        <button onclick="verificarIntegridad()" class="btn-mantenimiento">
                            ✅ Verificar Integridad
                        </button>
                    </div>
                    
                    <div class="sistema-card">
                        <h4>📋 Información del Sistema</h4>
                        <div id="info-sistema" class="info-sistema">
                            <div class="loading">Cargando información...</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ===== FUNCIONES DE NAVEGACIÓN =====

function mostrarSeccionAdmin(seccion) {
    // Ocultar todas las secciones
    document.querySelectorAll('.seccion-admin').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    // Mostrar sección seleccionada
    document.getElementById(`seccion-${seccion}`).classList.add('active');
    document.querySelector(`[data-section="${seccion}"]`).classList.add('active');
    
    // Cargar datos específicos de la sección
    cargarDatosSeccion(seccion);
}

async function cargarDatosSeccion(seccion) {
    switch (seccion) {
        case 'deudores':
            await cargarDeudoresAdmin();
            break;
        case 'productos':
            await cargarProductosAdmin();
            break;
        case 'empleados':
            await cargarEmpleadosAdmin();
            break;
        case 'encargados':
            await cargarEncargadosAdmin();
            break;
        case 'sistema':
            await cargarInfoSistema();
            break;
    }
}

// ===== FUNCIONES DE DEUDORES =====

async function cargarDeudoresAdmin() {
    try {
        const deudores = await obtenerDeudoresCompleto();
        
        // Actualizar resumen
        const totalPendiente = deudores.reduce((sum, d) => sum + d.totalPendiente, 0);
        const numeroDeudores = deudores.filter(d => d.totalPendiente > 0).length;
        
        document.getElementById('total-deudas-pendientes').textContent = `${totalPendiente.toLocaleString()}`;
        document.getElementById('numero-deudores').textContent = numeroDeudores;
        
        // Renderizar lista
        let html = '';
        
        if (deudores.length === 0) {
            html = '<div class="info">✅ No hay deudores registrados</div>';
        } else {
            deudores.forEach(deudor => {
                const estado = deudor.totalPendiente > 0 ? 'pendiente' : 'saldado';
                html += `
                    <div class="deudor-card ${estado}" data-deudor="${deudor.persona}">
                        <div class="deudor-header">
                            <div class="deudor-info">
                                <h4>${deudor.persona}</h4>
                                <div class="deudor-stats">
                                    <span>Total original: ${deudor.totalOriginal.toLocaleString()}</span>
                                    <span class="pendiente">Pendiente: ${deudor.totalPendiente.toLocaleString()}</span>
                                    <span class="ultima-deuda">Última: ${deudor.ultimaDeuda}</span>
                                </div>
                            </div>
                            <div class="deudor-acciones">
                                ${deudor.totalPendiente > 0 ? `
                                    <button onclick="mostrarPagoDeuda('${deudor.persona}')" class="btn-pago">
                                        💰 Registrar Pago
                                    </button>
                                ` : ''}
                                <button onclick="toggleDetalleDeuda('${deudor.persona}')" class="btn-detalle">
                                    📋 Ver Detalle
                                </button>
                            </div>
                        </div>
                        
                        <div id="detalle-${deudor.persona}" class="deudor-detalle" style="display: none;">
                            <table class="tabla-deudas">
                                <thead>
                                    <tr>
                                        <th>Fecha</th>
                                        <th>Motivo</th>
                                        <th>Monto Original</th>
                                        <th>Saldo</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                `;
                
                deudor.deudas.forEach(deuda => {
                    html += `
                        <tr class="${deuda.balance > 0 ? 'deuda-pendiente' : 'deuda-saldada'}">
                            <td>${deuda.date}</td>
                            <td>${deuda.reason}</td>
                            <td>${deuda.amount.toLocaleString()}</td>
                            <td>${deuda.balance.toLocaleString()}</td>
                            <td>
                                ${deuda.balance > 0 ? `
                                    <button onclick="pagarDeudaEspecifica(${deuda.id}, ${deuda.balance})" class="btn-pagar-mini">
                                        💸 Pagar
                                    </button>
                                    <button onclick="condonarDeudaEspecifica(${deuda.id})" class="btn-condonar">
                                        ❌ Condonar
                                    </button>
                                ` : '<span class="saldada">✅ Saldada</span>'}
                            </td>
                        </tr>
                    `;
                });
                
                html += `
                                </tbody>
                            </table>
                        </div>
                    </div>
                `;
            });
        }
        
        document.getElementById('lista-deudores-admin').innerHTML = html;
        
    } catch (error) {
        document.getElementById('lista-deudores-admin').innerHTML = `
            <div class="error">Error cargando deudores: ${error.message}</div>
        `;
    }
}

function filtrarDeudores() {
    const filtroNombre = document.getElementById('filtro-deudor').value.toLowerCase();
    const filtroEstado = document.getElementById('filtro-estado').value;
    
    document.querySelectorAll('.deudor-card').forEach(card => {
        const nombre = card.dataset.deudor.toLowerCase();
        const esPendiente = card.classList.contains('pendiente');
        
        let mostrar = true;
        
        // Filtro por nombre
        if (filtroNombre && !nombre.includes(filtroNombre)) {
            mostrar = false;
        }
        
        // Filtro por estado
        if (filtroEstado === 'pendientes' && !esPendiente) {
            mostrar = false;
        } else if (filtroEstado === 'saldados' && esPendiente) {
            mostrar = false;
        }
        
        card.style.display = mostrar ? 'block' : 'none';
    });
}

function toggleDetalleDeuda(persona) {
    const detalle = document.getElementById(`detalle-${persona}`);
    detalle.style.display = detalle.style.display === 'none' ? 'block' : 'none';
}

async function mostrarPagoDeuda(persona) {
    const monto = prompt(`¿Cuánto está pagando ${persona}?`);
    if (!monto || isNaN(monto) || parseFloat(monto) <= 0) return;
    
    const metodo = prompt('Método de pago (Efectivo/Transferencia):', 'Efectivo');
    if (!metodo) return;
    
    // Obtener deudas pendientes de la persona
    const { data: deudas, error } = await supabase
        .from('debts')
        .select('*')
        .eq('person', persona)
        .gt('balance', 0)
        .order('date');
    
    if (error) {
        alert('Error obteniendo deudas: ' + error.message);
        return;
    }
    
    // Aplicar pago a la deuda más antigua
    let montoRestante = parseFloat(monto);
    const pagosRealizados = [];
    
    for (const deuda of deudas) {
        if (montoRestante <= 0) break;
        
        const pagoAplicado = Math.min(montoRestante, deuda.balance);
        const resultado = await registrarPagoDeuda(deuda.id, pagoAplicado, metodo);
        
        if (resultado.success) {
            pagosRealizados.push(`${pagoAplicado.toLocaleString()} a "${deuda.reason}"`);
            montoRestante -= pagoAplicado;
        }
    }
    
    if (pagosRealizados.length > 0) {
        alert(`Pagos registrados:\n${pagosRealizados.join('\n')}`);
        await cargarDeudoresAdmin();
    }
}

async function pagarDeudaEspecifica(deudaId, saldo) {
    const monto = prompt(`Monto a pagar (máximo ${saldo.toLocaleString()}):`, saldo);
    if (!monto || isNaN(monto) || parseFloat(monto) <= 0) return;
    
    const resultado = await registrarPagoDeuda(deudaId, parseFloat(monto));
    
    if (resultado.success) {
        alert(resultado.mensaje);
        await cargarDeudoresAdmin();
    } else {
        alert('Error: ' + resultado.mensaje);
    }
}

async function condonarDeudaEspecifica(deudaId) {
    if (!confirm('¿Estás seguro de condonar esta deuda? Esta acción no se puede deshacer.')) return;
    
    const motivo = prompt('Motivo de la condonación (opcional):') || 'Condonación administrativa';
    const resultado = await condonarDeuda(deudaId, motivo);
    
    if (resultado.success) {
        alert(resultado.mensaje);
        await cargarDeudoresAdmin();
    } else {
        alert('Error: ' + resultado.mensaje);
    }
}

// ===== FUNCIONES DE PRODUCTOS =====

async function cargarProductosAdmin() {
    try {
        const { data: productos, error } = await supabase
            .from('products')
            .select('*')
            .order('sku');
        
        if (error) throw error;
        
        let html = `
            <table class="tabla-productos-admin">
                <thead>
                    <tr>
                        <th>SKU</th>
                        <th>Nombre</th>
                        <th>Precio</th>
                        <th>POS</th>
                        <th>Vasos/Unidad</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
        `;
        
        (productos || []).forEach(producto => {
            html += `
                <tr class="${producto.active ? '' : 'producto-inactivo'}">
                    <td><code>${producto.sku}</code></td>
                    <td>${producto.name}</td>
                    <td>${producto.price.toLocaleString()}</td>
                    <td><span class="badge-pos ${producto.pos.toLowerCase()}">${producto.pos}</span></td>
                    <td>${producto.vasos_per_unit || 0}</td>
                    <td>
                        <span class="estado ${producto.active ? 'activo' : 'inactivo'}">
                            ${producto.active ? '✅ Activo' : '❌ Inactivo'}
                        </span>
                    </td>
                    <td>
                        <button onclick="editarProducto(${producto.id})" class="btn-editar">✏️</button>
                        <button onclick="toggleProducto(${producto.id}, ${!producto.active})" class="btn-toggle">
                            ${producto.active ? '🔒' : '🔓'}
                        </button>
                    </td>
                </tr>
            `;
        });
        
        html += '</tbody></table>';
        document.getElementById('lista-productos-admin').innerHTML = html;
        
    } catch (error) {
        document.getElementById('lista-productos-admin').innerHTML = `
            <div class="error">Error cargando productos: ${error.message}</div>
        `;
    }
}

async function guardarProducto() {
    const sku = document.getElementById('sku-producto').value.trim();
    const nombre = document.getElementById('nombre-producto').value.trim();
    const precio = parseInt(document.getElementById('precio-producto').value) || 0;
    const pos = document.getElementById('pos-producto').value;
    const vasos = parseInt(document.getElementById('vasos-producto').value) || 0;
    
    if (!sku || !nombre || precio <= 0) {
        alert('Por favor completa todos los campos requeridos');
        return;
    }
    
    try {
        const producto = {
            sku,
            name: nombre,
            price: precio,
            pos,
            vasos_per_unit: vasos,
            active: true
        };
        
        const { data, error } = await supabase
            .from('products')
            .insert(producto)
            .select()
            .single();
        
        if (error) throw error;
        
        // Limpiar formulario
        document.getElementById('sku-producto').value = '';
        document.getElementById('nombre-producto').value = '';
        document.getElementById('precio-producto').value = '';
        document.getElementById('vasos-producto').value = '0';
        
        alert('Producto guardado exitosamente');
        await cargarProductosAdmin();
        
    } catch (error) {
        alert('Error guardando producto: ' + error.message);
    }
}

async function editarProducto(id) {
    // Implementar modal de edición o usar prompts
    const nombre = prompt('Nuevo nombre:');
    const precio = prompt('Nuevo precio:');
    
    if (!nombre || !precio || isNaN(precio)) return;
    
    try {
        const { error } = await supabase
            .from('products')
            .update({ 
                name: nombre,
                price: parseInt(precio)
            })
            .eq('id', id);
        
        if (error) throw error;
        
        alert('Producto actualizado');
        await cargarProductosAdmin();
        
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function toggleProducto(id, nuevoEstado) {
    try {
        const { error } = await supabase
            .from('products')
            .update({ active: nuevoEstado })
            .eq('id', id);
        
        if (error) throw error;
        
        await cargarProductosAdmin();
        
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// ===== FUNCIONES DE EMPLEADOS =====

async function cargarEmpleadosAdmin() {
    try {
        const { data: empleados, error } = await supabase
            .from('employees')
            .select('*')
            .order('name');
        
        if (error) throw error;
        
        let html = '';
        
        if (!empleados || empleados.length === 0) {
            html = '<div class="info">No hay empleados registrados</div>';
        } else {
            html = '<div class="empleados-grid">';
            
            empleados.forEach(empleado => {
                html += `
                    <div class="empleado-card">
                        <div class="empleado-info">
                            <h4>${empleado.name}</h4>
                            <p><strong>Rol:</strong> ${empleado.role || 'Sin especificar'}</p>
                            <p><strong>Salario diario:</strong> ${(empleado.daily_salary || 0).toLocaleString()}</p>
                        </div>
                        <div class="empleado-acciones">
                            <button onclick="editarEmpleado(${empleado.id})" class="btn-editar">✏️ Editar</button>
                            <button onclick="eliminarEmpleado(${empleado.id})" class="btn-eliminar">🗑️ Eliminar</button>
                        </div>
                    </div>
                `;
            });
            
            html += '</div>';
        }
        
        document.getElementById('lista-empleados-admin').innerHTML = html;
        
    } catch (error) {
        document.getElementById('lista-empleados-admin').innerHTML = `
            <div class="error">Error cargando empleados: ${error.message}</div>
        `;
    }
}

async function guardarEmpleado() {
    const nombre = document.getElementById('nombre-empleado').value.trim();
    const rol = document.getElementById('rol-empleado').value.trim();
    const salario = parseInt(document.getElementById('salario-empleado').value) || 0;
    
    if (!nombre) {
        alert('El nombre es requerido');
        return;
    }
    
    try {
        const empleado = {
            name: nombre,
            role: rol,
            daily_salary: salario
        };
        
        const { error } = await supabase
            .from('employees')
            .insert(empleado);
        
        if (error) throw error;
        
        // Limpiar formulario
        document.getElementById('nombre-empleado').value = '';
        document.getElementById('rol-empleado').value = '';
        document.getElementById('salario-empleado').value = '';
        
        alert('Empleado guardado exitosamente');
        await cargarEmpleadosAdmin();
        
    } catch (error) {
        alert('Error guardando empleado: ' + error.message);
    }
}

async function editarEmpleado(id) {
    const nombre = prompt('Nuevo nombre:');
    const rol = prompt('Nuevo rol:');
    const salario = prompt('Nuevo salario diario:');
    
    if (!nombre) return;
    
    try {
        const update = { name: nombre };
        if (rol) update.role = rol;
        if (salario && !isNaN(salario)) update.daily_salary = parseInt(salario);
        
        const { error } = await supabase
            .from('employees')
            .update(update)
            .eq('id', id);
        
        if (error) throw error;
        
        alert('Empleado actualizado');
        await cargarEmpleadosAdmin();
        
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

async function eliminarEmpleado(id) {
    if (!confirm('¿Estás seguro de eliminar este empleado?')) return;
    
    try {
        const { error } = await supabase
            .from('employees')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        await cargarEmpleadosAdmin();
        
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// ===== FUNCIONES DE ENCARGADOS =====

async function cargarEncargadosAdmin() {
    try {
        const encargados = await obtenerEncargados();
        
        const barra = encargados.find(e => e.pos === 'Barra');
        const granizados = encargados.find(e => e.pos === 'Granizados');
        
        document.getElementById('actual-barra').textContent = 
            barra ? `Actual: ${barra.manager_name}` : 'Sin asignar';
        document.getElementById('actual-granizados').textContent = 
            granizados ? `Actual: ${granizados.manager_name}` : 'Sin asignar';
        
        if (barra) document.getElementById('encargado-barra').value = barra.manager_name;
        if (granizados) document.getElementById('encargado-granizados').value = granizados.manager_name;
        
    } catch (error) {
        console.error('Error cargando encargados:', error);
    }
}

async function actualizarEncargadoPOS(pos) {
    const inputId = pos === 'Barra' ? 'encargado-barra' : 'encargado-granizados';
    const nuevoEncargado = document.getElementById(inputId).value.trim();
    
    if (!nuevoEncargado) {
        alert('Por favor ingresa un nombre');
        return;
    }
    
    try {
        const resultado = await actualizarEncargado(pos, nuevoEncargado);
        
        if (resultado.success) {
            alert(`Encargado de ${pos} actualizado a: ${nuevoEncargado}`);
            await cargarEncargadosAdmin();
        } else {
            alert('Error: ' + resultado.mensaje);
        }
        
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// ===== FUNCIONES DE REPORTES =====

async function generarReporte() {
    const fechaInicio = document.getElementById('fecha-inicio-reporte').value;
    const fechaFin = document.getElementById('fecha-fin-reporte').value;
    
    if (!fechaInicio || !fechaFin) {
        alert('Por favor selecciona ambas fechas');
        return;
    }
    
    const divResultados = document.getElementById('resultados-reporte');
    divResultados.innerHTML = '<div class="loading">Generando reporte...</div>';
    
    try {
        const reporte = await generarReporteRapido(fechaInicio, fechaFin);
        
        let html = `
            <div class="reporte-completo">
                <h4>📈 Reporte ${fechaInicio} - ${fechaFin}</h4>
                
                <div class="reporte-resumen">
                    <div class="metrica-reporte">
                        <h5>💰 Ventas Totales</h5>
                        <div class="valor-metrica">${formatearMoneda(reporte.resumen.totalVentas)}</div>
                    </div>
                    <div class="metrica-reporte">
                        <h5>📊 Promedio Diario</h5>
                        <div class="valor-metrica">${formatearMoneda(reporte.resumen.promedioVentaDiaria)}</div>
                    </div>
                    <div class="metrica-reporte">
                        <h5>💵 Efectivo</h5>
                        <div class="valor-metrica">${formatearMoneda(reporte.resumen.totalEfectivo)}</div>
                    </div>
                    <div class="metrica-reporte">
                        <h5>💳 Transferencias</h5>
                        <div class="valor-metrica">${formatearMoneda(reporte.resumen.totalTransferencia)}</div>
                    </div>
                </div>
                
                <div class="reporte-secciones">
                    <div class="seccion-reporte">
                        <h5>🏆 Top Productos</h5>
                        <table class="tabla-reporte">
                            <thead>
                                <tr><th>Producto</th><th>Cantidad</th><th>Ingresos</th></tr>
                            </thead>
                            <tbody>
        `;
        
        reporte.topProductos.forEach(producto => {
            html += `
                <tr>
                    <td>${producto.nombre}</td>
                    <td>${producto.cantidad}</td>
                    <td>${formatearMoneda(producto.ingresos)}</td>
                </tr>
            `;
        });
        
        html += `
                            </tbody>
                        </table>
                    </div>
                    
                    <div class="seccion-reporte">
                        <h5>🍺🧊 Ventas por POS</h5>
                        <div class="pos-stats">
                            <div class="pos-stat">
                                <span>Barra:</span>
                                <span>${formatearMoneda(reporte.ventasPorPOS.Barra)}</span>
                            </div>
                            <div class="pos-stat">
                                <span>Granizados:</span>
                                <span>${formatearMoneda(reporte.ventasPorPOS.Granizados)}</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <button onclick="exportarReporte()" class="btn-exportar-reporte">
                    📋 Exportar Reporte
                </button>
            </div>
        `;
        
        divResultados.innerHTML = html;
        
        // Guardar reporte para exportar
        window.ultimoReporte = reporte;
        
    } catch (error) {
        divResultados.innerHTML = `
            <div class="error">Error generando reporte: ${error.message}</div>
        `;
    }
}

function exportarReporte() {
    if (!window.ultimoReporte) {
        alert('No hay reporte para exportar');
        return;
    }
    
    const csv = convertirReporteACSV(window.ultimoReporte);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_${window.ultimoReporte.periodo.fechaInicio}_${window.ultimoReporte.periodo.fechaFin}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

function convertirReporteACSV(reporte) {
    let csv = 'REPORTE DE VENTAS\n';
    csv += `Período:,${reporte.periodo.fechaInicio},${reporte.periodo.fechaFin}\n\n`;
    
    csv += 'RESUMEN GENERAL\n';
    csv += `Ventas Totales,${reporte.resumen.totalVentas}\n`;
    csv += `Efectivo,${reporte.resumen.totalEfectivo}\n`;
    csv += `Transferencias,${reporte.resumen.totalTransferencia}\n`;
    csv += `Promedio Diario,${reporte.resumen.promedioVentaDiaria}\n\n`;
    
    csv += 'TOP PRODUCTOS\n';
    csv += 'Producto,Cantidad,Ingresos\n';
    reporte.topProductos.forEach(p => {
        csv += `${p.nombre},${p.cantidad},${p.ingresos}\n`;
    });
    
    csv += '\nVENTAS POR POS\n';
    csv += `Barra,${reporte.ventasPorPOS.Barra}\n`;
    csv += `Granizados,${reporte.ventasPorPOS.Granizados}\n`;
    
    return csv;
}

// ===== FUNCIONES DE SISTEMA =====

async function cargarInfoSistema() {
    try {
        // Obtener estadísticas generales
        const [ventas, productos, empleados, deudas] = await Promise.all([
            supabase.from('sales').select('id', { count: 'exact', head: true }),
            supabase.from('products').select('id', { count: 'exact', head: true }),
            supabase.from('employees').select('id', { count: 'exact', head: true }),
            supabase.from('debts').select('balance').gt('balance', 0)
        ]);
        
        const totalDeudas = (deudas.data || []).reduce((sum, d) => sum + d.balance, 0);
        
        const info = `
            <div class="estadisticas-sistema">
                <div class="stat-item">
                    <span class="stat-label">Total Ventas Registradas:</span>
                    <span class="stat-valor">${ventas.count || 0}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Productos en Catálogo:</span>
                    <span class="stat-valor">${productos.count || 0}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Empleados Registrados:</span>
                    <span class="stat-valor">${empleados.count || 0}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Deudas Pendientes:</span>
                    <span class="stat-valor">${formatearMoneda(totalDeudas)}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Última Actualización:</span>
                    <span class="stat-valor">${new Date().toLocaleString()}</span>
                </div>
            </div>
        `;
        
        document.getElementById('info-sistema').innerHTML = info;
        
    } catch (error) {
        document.getElementById('info-sistema').innerHTML = `
            <div class="error">Error cargando información: ${error.message}</div>
        `;
    }
}

async function exportarDatosCompletos() {
    const fechaInicio = document.getElementById('backup-inicio').value;
    const fechaFin = document.getElementById('backup-fin').value;
    
    if (!fechaInicio || !fechaFin) {
        alert('Por favor selecciona el rango de fechas para el backup');
        return;
    }
    
    try {
        const datos = await exportarDatos(fechaInicio, fechaFin);
        const nombreArchivo = `backup_snow_${fechaInicio}_${fechaFin}.json`;
        
        descargarBackup(datos, nombreArchivo);
        alert('Backup descargado exitosamente');
        
    } catch (error) {
        alert('Error exportando datos: ' + error.message);
    }
}

async function limpiarDatosObsoletos() {
    if (!confirm('¿Estás seguro de limpiar datos obsoletos? Esta acción no se puede deshacer.')) return;
    
    try {
        // Eliminar deudas saldadas muy antiguas (más de 6 meses)
        const fechaLimite = new Date();
        fechaLimite.setMonth(fechaLimite.getMonth() - 6);
        const fechaLimiteStr = fechaLimite.toISOString().split('T')[0];
        
        const { error } = await supabase
            .from('debts')
            .delete()
            .eq('balance', 0)
            .lt('date', fechaLimiteStr);
        
        if (error) throw error;
        
        alert('Limpieza completada: deudas saldadas antiguas eliminadas');
        
    } catch (error) {
        alert('Error en limpieza: ' + error.message);
    }
}

async function verificarIntegridad() {
    try {
        console.log('🔍 Verificando integridad de datos...');
        
        const problemas = [];
        
        // 1. Verificar ventas sin productos
        const { data: ventasSinProducto } = await supabase
            .from('sales')
            .select('id, product_id')
            .is('product_id', null);
        
        if (ventasSinProducto && ventasSinProducto.length > 0) {
            problemas.push(`${ventasSinProducto.length} ventas sin producto asociado`);
        }
        
        // 2. Verificar productos sin SKU
        const { data: productosSinSKU } = await supabase
            .from('products')
            .select('id, sku')
            .or('sku.is.null,sku.eq.');
        
        if (productosSinSKU && productosSinSKU.length > 0) {
            problemas.push(`${productosSinSKU.length} productos sin SKU`);
        }
        
        // 3. Verificar consistencia de pagos mixtos
        const { data: pagosMixtos } = await supabase
            .from('sales')
            .select('id, cash_amount, transfer_amount, qty, products!inner(price)')
            .eq('pay_method', 'Mixto');
        
        if (pagosMixtos) {
            const pagosInconsistentes = pagosMixtos.filter(venta => {
                const totalEsperado = venta.qty * venta.products.price;
                const totalPago = (venta.cash_amount || 0) + (venta.transfer_amount || 0);
                return Math.abs(totalEsperado - totalPago) > 1; // Tolerancia de 1 peso
            });
            
            if (pagosInconsistentes.length > 0) {
                problemas.push(`${pagosInconsistentes.length} ventas mixtas con totales inconsistentes`);
            }
        }
        
        if (problemas.length === 0) {
            alert('✅ Verificación completada: No se encontraron problemas de integridad');
        } else {
            alert(`⚠️ Se encontraron ${problemas.length} problemas:\n\n${problemas.join('\n')}`);
        }
        
    } catch (error) {
        alert('Error verificando integridad: ' + error.message);
    }
}

// ===== INICIALIZACIÓN DE LA VISTA =====

function inicializarVistaAdministracion() {
    // Cargar la sección de deudores por defecto
    cargarDatosSeccion('deudores');
    
    // Configurar fechas por defecto para reportes y backup
    const hoy = new Date().toISOString().split('T')[0];
    const haceUnaSemana = new Date();
    haceUnaSemana.setDate(haceUnaSemana.getDate() - 7);
    const fechaInicio = haceUnaSemana.toISOString().split('T')[0];
    
    // Reportes
    document.getElementById('fecha-inicio-reporte').value = fechaInicio;
    document.getElementById('fecha-fin-reporte').value = hoy;
    
    // Backup
    document.getElementById('backup-inicio').value = fechaInicio;
    document.getElementById('backup-fin').value = hoy;
}

// ===== ESTILOS CSS PARA ADMINISTRACIÓN =====
const estilosAdministracion = `
<style>
.administracion-completa {
    max-width: 1400px;
    margin: 0 auto;
    padding: 20px;
}

.nav-admin {
    display: flex;
    gap: 10px;
    margin-bottom: 30px;
    padding: 15px;
    background: #f8fafc;
    border-radius: 10px;
    overflow-x: auto;
}

.nav-btn {
    background: white;
    border: 2px solid #e5e7eb;
    padding: 10px 20px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
    white-space: nowrap;
    transition: all 0.3s;
}

.nav-btn:hover {
    border-color: #3b82f6;
    background: #eff6ff;
}

.nav-btn.active {
    background: #3b82f6;
    color: white;
    border-color: #3b82f6;
}

.seccion-admin {
    display: none;
    background: white;
    padding: 30px;
    border-radius: 10px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.1);
}

.seccion-admin.active {
    display: block;
}

.resumen-deudas {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
}

.card-resumen {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 20px;
    border-radius: 10px;
    text-align: center;
}

.valor-grande {
    font-size: 2.5em;
    font-weight: bold;
    margin: 10px 0;
}

.filtros-deudas {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 15px;
    margin-bottom: 20px;
}

.filtros-deudas input, .filtros-deudas select {
    padding: 10px;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    font-size: 16px;
}

.deudor-card {
    border: 2px solid #e5e7eb;
    border-radius: 10px;
    margin-bottom: 15px;
    overflow: hidden;
    transition: all 0.3s;
}

.deudor-card.pendiente {
    border-left: 5px solid #ef4444;
}

.deudor-card.saldado {
    border-left: 5px solid #22c55e;
    opacity: 0.7;
}

.deudor-header {
    padding: 20px;
    background: #f8fafc;
    display: flex;
    justify-content: space-between;
    align-items: center;
}

.deudor-stats {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 14px;
    color: #6b7280;
    margin-top: 10px;
}

.deudor-stats .pendiente {
    color: #dc2626;
    font-weight: bold;
}

.deudor-acciones {
    display: flex;
    gap: 10px;
}

.btn-pago, .btn-detalle {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
}

.btn-pago {
    background: #10b981;
    color: white;
}

.btn-detalle {
    background: #3b82f6;
    color: white;
}

.deudor-detalle {
    padding: 20px;
    border-top: 1px solid #e5e7eb;
}

.tabla-deudas {
    width: 100%;
    border-collapse: collapse;
}

.tabla-deudas th,
.tabla-deudas td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid #e5e7eb;
}

.tabla-deudas th {
    background: #f8fafc;
    font-weight: bold;
}

.deuda-pendiente {
    background: #fef2f2;
}

.deuda-saldada {
    background: #f0fdf4;
    opacity: 0.7;
}

.btn-pagar-mini, .btn-condonar {
    padding: 4px 8px;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    margin-right: 5px;
}

.btn-pagar-mini {
    background: #fbbf24;
    color: white;
}

.btn-condonar {
    background: #ef4444;
    color: white;
}

.saldada {
    color: #059669;
    font-weight: bold;
}

.form-producto, .form-empleado {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)) auto;
    gap: 15px;
    margin-bottom: 30px;
    padding: 20px;
    background: #f8fafc;
    border-radius: 8px;
}

.form-producto input, .form-producto select,
.form-empleado input {
    padding: 10px;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
}

.btn-guardar-producto, .btn-guardar-empleado {
    background: #10b981;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 6px;
    font-weight: bold;
    cursor: pointer;
    white-space: nowrap;
}

.tabla-productos-admin {
    width: 100%;
    border-collapse: collapse;
    margin-top: 20px;
}

.tabla-productos-admin th,
.tabla-productos-admin td {
    padding: 12px;
    text-align: left;
    border-bottom: 1px solid #e5e7eb;
}

.tabla-productos-admin th {
    background: #f8fafc;
    font-weight: bold;
}

.producto-inactivo {
    opacity: 0.5;
    background: #f9fafb;
}

.badge-pos {
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: bold;
    text-transform: uppercase;
}

.badge-pos.barra {
    background: #fef3c7;
    color: #92400e;
}

.badge-pos.granizados {
    background: #dbeafe;
    color: #1e40af;
}

.estado.activo {
    color: #059669;
}

.estado.inactivo {
    color: #dc2626;
}

.btn-editar, .btn-toggle, .btn-eliminar {
    padding: 6px 10px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    margin-right: 5px;
    font-size: 14px;
}

.btn-editar {
    background: #3b82f6;
    color: white;
}

.btn-toggle {
    background: #6b7280;
    color: white;
}

.btn-eliminar {
    background: #ef4444;
    color: white;
}

.empleados-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
}

.empleado-card {
    border: 2px solid #e5e7eb;
    border-radius: 10px;
    padding: 20px;
    background: #fafafa;
}

.empleado-info h4 {
    margin: 0 0 10px 0;
    color: #374151;
}

.empleado-acciones {
    display: flex;
    gap: 10px;
    margin-top: 15px;
}

.encargados-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 30px;
}

.encargado-card {
    border: 2px solid #e5e7eb;
    border-radius: 10px;
    padding: 20px;
    background: #f8fafc;
}

.encargado-form {
    display: flex;
    gap: 10px;
    margin: 15px 0;
}

.encargado-form input {
    flex: 1;
    padding: 8px;
    border: 1px solid #d1d5db;
    border-radius: 4px;
}

.btn-actualizar-encargado {
    background: #3b82f6;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 4px;
    cursor: pointer;
}

.encargado-actual {
    font-size: 14px;
    color: #6b7280;
    font-style: italic;
}

.generador-reportes {
    background: #f8fafc;
    padding: 20px;
    border-radius: 10px;
    margin-bottom: 30px;
}

.form-reporte {
    display: flex;
    gap: 15px;
    align-items: center;
    margin-top: 15px;
}

.form-reporte input {
    padding: 10px;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
}

.btn-generar-reporte {
    background: #8b5cf6;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 6px;
    font-weight: bold;
    cursor: pointer;
}

.reporte-resumen {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin: 20px 0;
}

.metrica-reporte {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 20px;
    border-radius: 10px;
    text-align: center;
}

.valor-metrica {
    font-size: 1.8em;
    font-weight: bold;
    margin-top: 10px;
}

.reporte-secciones {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 30px;
    margin: 30px 0;
}

.seccion-reporte {
    background: #f8fafc;
    padding: 20px;
    border-radius: 10px;
}

.tabla-reporte {
    width: 100%;
    border-collapse: collapse;
    margin-top: 15px;
}

.tabla-reporte th,
.tabla-reporte td {
    padding: 10px;
    text-align: left;
    border-bottom: 1px solid #e5e7eb;
}

.tabla-reporte th {
    background: #f1f5f9;
    font-weight: bold;
}

.pos-stats {
    display: flex;
    flex-direction: column;
    gap: 15px;
    margin-top: 15px;
}

.pos-stat {
    display: flex;
    justify-content: space-between;
    padding: 10px;
    background: white;
    border-radius: 6px;
    font-weight: 500;
}

.btn-exportar-reporte {
    background: #059669;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 6px;
    font-weight: bold;
    cursor: pointer;
    margin-top: 20px;
}

.sistema-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 30px;
}

.sistema-card {
    border: 2px solid #e5e7eb;
    border-radius: 10px;
    padding: 25px;
    background: #f8fafc;
}

.sistema-card h4 {
    margin: 0 0 10px 0;
    color: #374151;
}

.sistema-card p {
    color: #6b7280;
    margin-bottom: 20px;
}

.backup-form {
    display: flex;
    flex-direction: column;
    gap: 15px;
}

.backup-form input {
    padding: 10px;
    border: 2px solid #e5e7eb;
    border-radius: 6px;
}

.btn-backup, .btn-mantenimiento {
    background: #7c3aed;
    color: white;
    border: none;
    padding: 12px 20px;
    border-radius: 6px;
    font-weight: bold;
    cursor: pointer;
    margin: 5px 0;
}

.btn-mantenimiento {
    background: #f59e0b;
}

.estadisticas-sistema {
    display: flex;
    flex-direction: column;
    gap: 15px;
}

.stat-item {
    display: flex;
    justify-content: space-between;
    padding: 12px;
    background: white;
    border-radius: 6px;
    border-left: 4px solid #3b82f6;
}

.stat-label {
    font-weight: 500;
    color: #374151;
}

.stat-valor {
    font-weight: bold;
    color: #1f2937;
}

.loading, .info, .error {
    text-align: center;
    padding: 30px;
    border-radius: 10px;
    margin: 20px 0;
}

.loading {
    background: #f3f4f6;
    color: #6b7280;
}

.info {
    background: #eff6ff;
    color: #1d4ed8;
}

.error {
    background: #fef2f2;
    color: #dc2626;
}

@media (max-width: 768px) {
    .nav-admin {
        flex-direction: column;
    }
    
    .resumen-deudas {
        grid-template-columns: 1fr;
    }
    
    .filtros-deudas {
        grid-template-columns: 1fr;
    }
    
    .deudor-header {
        flex-direction: column;
        align-items: stretch;
        gap: 15px;
    }
    
    .form-producto, .form-empleado {
        grid-template-columns: 1fr;
    }
    
    .encargados-grid {
        grid-template-columns: 1fr;
    }
    
    .reporte-secciones {
        grid-template-columns: 1fr;
    }
    
    .sistema-grid {
        grid-template-columns: 1fr;
    }
    
    .form-reporte {
        flex-direction: column;
        align-items: stretch;
    }
}
</style>
`;

// ===== FUNCIÓN PRINCIPAL PARA INTEGRAR CON LA APP =====

function cargarVistaAdministracion() {
    // Insertar HTML
    document.getElementById('administracion-container').innerHTML = renderVistaAdministracion();
    
    // Insertar estilos
    if (!document.getElementById('estilos-administracion')) {
        const styleElement = document.createElement('div');
        styleElement.id = 'estilos-administracion';
        styleElement.innerHTML = estilosAdministracion;
        document.head.appendChild(styleElement);
    }
    
    // Inicializar vista
    setTimeout(() => {
        inicializarVistaAdministracion();
    }, 100);
}

// ===== FUNCIONES DE UTILIDAD =====

function formatearMoneda(valor) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0
    }).format(valor);
}

// Función para integrar con el sistema de navegación principal
function integrarConNavegacionPrincipal() {
    // Esta función se debe llamar desde el script principal
    // para agregar el botón de administración a la navegación
    
    const btnAdministracion = document.createElement('button');
    btnAdministracion.textContent = '🛠️ Administración';
    btnAdministracion.onclick = () => {
        // Ocultar otras secciones
        document.querySelectorAll('.seccion-principal').forEach(s => s.style.display = 'none');
        
        // Mostrar administración
        document.getElementById('administracion-container').style.display = 'block';
        cargarVistaAdministracion();
    };
    
    // Agregar al menú principal
    document.getElementById('menu-principal').appendChild(btnAdministracion);
}