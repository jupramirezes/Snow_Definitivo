# 🗂️ SISTEMA DE BACKUPS Y DOCUMENTACIÓN

## **📁 Estructura de Carpetas**

```
📁 Snow_Definitivo/
├── 📁 backups/           ← TODOS LOS BACKUPS
│   ├── v0.0_original/    ← Estado inicial (HOY)
│   ├── v1.0_css_separado/ ← Después de separar CSS
│   ├── v1.1_js_separado/  ← Después de separar JS
│   └── v2.0_ui_mejorada/  ← Después de mejorar UI
├── 📁 docs/             ← DOCUMENTACIÓN
│   ├── SISTEMA_BACKUPS.md
│   ├── CHANGELOG.md
│   └── TESTING_MANUAL.md
├── 📁 logs/             ← REGISTRO DE CAMBIOS
│   ├── 2025-01-15_v1.0.md
│   └── 2025-01-XX_v1.1.md
└── 📁 [archivos actuales]
```

## **🔄 PROCESO DE BACKUP**

### **Antes de CUALQUIER cambio:**

1. **Crear backup completo:**
```bash
# Desde Snow_Definitivo/
cp -r . backups/v[X.X]_[descripcion]/
```

2. **Documentar estado actual:**
```markdown
# Archivo: logs/[fecha]_v[X.X].md
- ¿Qué funciona perfecto?
- ¿Qué vamos a cambiar?
- ¿Cuáles son los riesgos?
```

3. **Testing pre-cambio:**
- Flujo completo funcional ✅
- Todos los cálculos correctos ✅
- Sin errores en consola ✅

### **Después de cada cambio:**

4. **Testing post-cambio:**
- ¿Sigue funcionando igual? ✅/❌
- ¿Los cálculos son idénticos? ✅/❌
- ¿Hay nuevos errores? ✅/❌

5. **Documentar resultado:**
```markdown
# RESULTADO:
✅ ÉXITO: Todo funciona igual
❌ PROBLEMA: [descripción] → ROLLBACK
```

## **📝 NOMENCLATURA DE VERSIONES**

### **Formato:** `v[MAJOR].[MINOR]_[DESCRIPCIÓN]`

**Ejemplos:**
- `v0.0_original` - Estado inicial
- `v1.0_css_separado` - CSS en archivos independientes
- `v1.1_js_separado` - JavaScript modularizado
- `v1.2_componentes` - Componentes HTML separados
- `v2.0_ui_simplificada` - Interfaz rediseñada
- `v2.1_validaciones` - Validaciones mejoradas
- `v3.0_optimizada` - Performance optimizada

### **Regla de Oro:**
- **MAJOR** (+1): Cambios grandes (UI, arquitectura)
- **MINOR** (+0.1): Cambios pequeños (un archivo, una función)

## **🧪 TESTING CHECKLIST**

### **✅ Tests Obligatorios Antes y Después:**

#### **1. Configuración Inicial:**
- [ ] Crear producto "VASO-12"
- [ ] Agregar productos con precios y vasos
- [ ] Configurar socios (que sumen 100%)
- [ ] Asignar encargados de POS

#### **2. Flujo Diario:**
- [ ] Cargar inventario inicial
- [ ] Registrar venta en efectivo
- [ ] Registrar venta en transferencia
- [ ] Registrar venta mixta
- [ ] Agregar compra con factura
- [ ] Registrar gasto operativo

#### **3. Cierres:**
- [ ] Contar inventario final
- [ ] Ejecutar inferencia automática
- [ ] Calcular descuadres
- [ ] Generar cierre semanal
- [ ] Verificar reparto de socios

#### **4. Validaciones Críticas:**
- [ ] Los totales coinciden antes/después
- [ ] No hay errores en consola
- [ ] Todos los reportes son idénticos
- [ ] La app responde igual de rápido

## **📋 COMANDOS ÚTILES**

### **Crear Backup Rápido:**
```bash
# Desde Snow_Definitivo/
cd ..
cp -r Snow_Definitivo "Snow_Backup_$(date +%Y%m%d_%H%M)"
cd Snow_Definitivo
```

### **Comparar Archivos:**
```bash
# Comparar archivo antes/después
diff backups/v0.0_original/index.html index.html
```

### **Rollback Rápido:**
```bash
# Si algo sale mal, volver al backup
cp -r backups/v[X.X]_[descripcion]/* .
```

## **🚨 REGLAS DE EMERGENCIA**

### **Si algo no funciona:**
1. **NO ENTRAR EN PÁNICO** 😅
2. **Rollback inmediato** al último backup funcional
3. **Documentar el problema** en el log
4. **Analizar qué salió mal** antes de reintentar

### **Si los cálculos no coinciden:**
1. **STOP** - No continuar
2. **Verificar backup** - ¿El original funciona?
3. **Comparar paso a paso** - ¿Qué cambió exactamente?
4. **Rollback** hasta que los números coincidan

### **Mantra de Seguridad:**
> "Es mejor tener 20 backups y no necesitarlos, que necesitar 1 backup y no tenerlo"

---

**📅 Creado:** 2025-01-15
**🔄 Última actualización:** 2025-01-15