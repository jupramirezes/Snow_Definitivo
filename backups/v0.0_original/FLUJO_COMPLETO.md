# 📋 FLUJO COMPLETO DEL SISTEMA - GUÍA PASO A PASO

## 🎯 **LÓGICA DEL SISTEMA**

### **1. CONFIGURACIÓN INICIAL (Solo una vez)**

#### **Administración → Productos**
- Agregar todos los productos con SKU únicos
- Precio por producto
- POS asignado (Barra/Granizados)
- Vasos por unidad (para productos que consumen vasos)
- **Obligatorio:** Crear producto "VASO-12" (se consume automáticamente)

#### **Administración → Empleados**
- Agregar empleados con salario base diario
- En nómina podrás editarlo según el día

#### **Administración → Socios**
- Agregar socios con % de participación
- **DEBE SUMAR 100%** (validación automática)

#### **Administración → Encargados**
- Asignar responsable de Barra
- Asignar responsable de Granizados
- **Son responsables de descuadres**

---

## 📅 **FLUJO DIARIO OPERACIONAL**

### **PASO 1: INVENTARIO INICIAL (Mañana)**
1. **POS → Inventario**
2. Seleccionar POS (Barra o Granizados)
3. **"Cargar inventario"**
4. Llenar **"Inicial"** = Stock al empezar el día
5. Dejar **"Final"** en 0 por ahora
6. **"Guardar cambios inventario"**
7. **Se guarda en Supabase + localStorage (persiste al refrescar)**

### **PASO 2: OPERACIÓN DEL DÍA**
#### **Ventas (Mesero)**
- Registrar todas las ventas
- **Automático:** Resta del inventario + consume vasos si aplica
- **Pagos mixtos:** Efectivo + transferencia debe sumar el total

#### **Compras (POS)**
- Registrar compras con facturas
- **Automático:** Suma al inventario

#### **Gastos (POS)**
- Gastos operativos, nómina, descuentos socios
- **Se reflejan en dashboard inmediatamente**

### **PASO 3: CIERRE DE DÍA (Noche)**
1. **Contar físicamente** el inventario final
2. **POS → Inventario → Llenar "Final"** con lo contado
3. **Contar efectivo** en caja de Barra y Granizados

#### **Cierres → Cierre Diario**
4. **"⚡ Inferir Barra/Granizados"**
   - Calcula: `Ventas Faltantes = Inicial + Compras - Final - Ventas Registradas`
   - **Crea ventas en efectivo automáticas** por lo faltante

5. **Ingresar efectivo contado**
   - "Efectivo contado Barra"
   - "Efectivo contado Granizados"

6. **"Calcular Descuadres"**
   - Compara: `Efectivo Esperado vs Efectivo Contado`
   - **Registra deuda** al encargado si hay faltante

---

## 📊 **CIERRE SEMANAL**

### **Cierres → Cierre Semanal**
1. Seleccionar fechas (lunes a domingo)
2. **"Generar"** - Calcula automáticamente:
   - Total ventas del período
   - Total gastos (operativos + nómina + extra)
   - **Utilidad = Ventas - Gastos**

3. **Gastos semanales extra** (cemento, pintura, etc.)
4. **Reparto automático** según % de socios
   - Juan: 40% → $X
   - María: 35% → $Y
   - Pedro: 25% → $Z

---

## 🧮 **LÓGICA DE STOCK/INVENTARIO**

### **Stock Real = Inicial + Compras - Ventas**

**Ejemplo Cerveza Corona:**
- Inicial: 50 unidades
- Compras: +20 unidades  
- Ventas: -15 unidades
- **Stock esperado: 55 unidades**
- **Stock contado final: 53 unidades**
- **Diferencia: -2 (faltante, posible venta no registrada)**

### **Sistema de Vasos:**
- Producto "Cerveza" tiene `vasos_per_unit = 1`
- Al vender 1 cerveza → Resta 1 vaso automáticamente
- Producto "Jarra" tiene `vasos_per_unit = 0` (usa vaso reutilizable)

---

## 🔧 **FLUJO DE RESOLUCIÓN DE PROBLEMAS**

### **Si hay descuadre:**
1. **Sistema identifica al encargado** del POS con problema
2. **Registra deuda** automáticamente
3. **Aparece en "Administración → Deudores"**

### **Si faltan ventas:**
1. **Inferencia automática** encuentra las ventas no registradas
2. **Las crea como "Efectivo" a las 23:59**
3. **Ajusta el efectivo esperado**

### **Si el inventario no cuadra:**
1. **Revisar:** ¿Se registraron todas las compras?
2. **Revisar:** ¿Se registraron todas las ventas?
3. **Usar inferencia** para encontrar ventas faltantes
4. **Diferencia restante** = pérdida/merma real

---

## 💡 **TIPS IMPORTANTES**

1. **Inventario persiste** al refrescar página
2. **Dashboard se actualiza** en tiempo real cada vez que agregas algo
3. **Socios deben sumar 100%** antes de hacer reparto
4. **Encargados son obligatorios** para calcular responsabilidades
5. **Exportar reportes** después del cierre semanal para auditoría

---

## 🚨 **ERRORES COMUNES**

❌ **No configurar encargados** → No se pueden asignar descuadres  
❌ **Socios no suman 100%** → Reparto incorrecto  
❌ **No llenar inventario final** → No funciona inferencia  
❌ **No contar efectivo físico** → No se pueden detectar descuadres  
❌ **Olvidar producto VASO-12** → Error al vender productos con vasos