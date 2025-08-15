# PR: Supabase + Trazabilidad + Cierres reales

Este PR conecta la PWA a **Supabase** y agrega:
- **Trazabilidad de inventario** con `inventory_moves` (ventas, compras, ajustes).
- **Consumo automático de vasos** (`VASO-12`) según `vasos_per_unit` del producto.
- **Descuentos a socios** y **descuadres** en la venta, con deudas para encargados.
- **Cierres diario/semanal** desde BD y **reparto** por % (post-gastos).
- **PWA** real (manifest + service worker).
- **Compras con factura** (Storage `invoices/`).

## Pasos
1. En Supabase → SQL → pegar `schema.sql` (run).
2. Crear bucket `invoices` en Storage y políticas de lectura/escritura para autenticados.
3. En Vercel → Variables de entorno:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. En `index.html`, reemplazar `{{SUPABASE_URL}}` y `{{SUPABASE_ANON_KEY}}` o usar env injection.
5. Deploy. Abrir en móvil y “Agregar a pantalla de inicio”.

## Semillas recomendadas
- Insertar `pos_managers` para Barra/Granizados.
- Insertar `partners` con % de reparto.
- Insertar `products` (10 barra, 3 granizados, VASO-12).

> Nota: el cálculo de **utilidad** en semanal usa ventas netas − (Gasto+Nómina+DescuentoSocio). Si querés **COGS** real, agregar `unit_cost` y precio/costo promedio por producto o usar consumo (inicial+compras−final) con costo unitario.
