// Minimal Supabase client wrapper (v2) for Control_BAR_SNOW - FASE 3
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY,
  { auth: { persistSession: true } }
);

// Helpers
export const q = (sel) => document.querySelector(sel);
export const money = (n) =>
  (n || 0).toLocaleString("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  });

// ============ PRODUCTS CRUD ============
export async function getProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("active", true)
    .order("pos, name");
  if (error) throw error;
  return data || [];
}

export async function addProduct({ sku, name, price, pos, vasos_per_unit = 0, type = "producto" }) {
  const { data, error } = await supabase
    .from("products")
    .insert([{ sku, name, price, pos, vasos_per_unit, type, active: true }])
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateProduct(id, updates) {
  const { data, error } = await supabase
    .from("products")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProduct(id) {
  const { error } = await supabase
    .from("products")
    .update({ active: false })
    .eq("id", id);
  if (error) throw error;
}

// ============ EMPLOYEES ============
export async function getEmployees() {
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data || [];
}

export async function addEmployee({ name, role, daily_salary }) {
  const { data, error } = await supabase
    .from("employees")
    .insert([{ name, role, daily_salary, active: true }])
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// ============ WEEKLY EXPENSES ============
export async function addWeeklyExpense({ week_start, concept, amount, attributed_to, notes }) {
  const { data, error } = await supabase
    .from("weekly_expenses")
    .insert([{ week_start, concept, amount, attributed_to, notes }])
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function getWeeklyExpenses(week_start) {
  const { data, error } = await supabase
    .from("weekly_expenses")
    .select("*")
    .eq("week_start", week_start)
    .order("created_at");
  if (error) throw error;
  return data || [];
}

// ============ DEBTS ============
export async function getDebts() {
  const { data, error } = await supabase
    .from("debts")
    .select("*")
    .gt("balance", 0)
    .order("date", { ascending: false });
  if (error) throw error;
  return data || [];
}

// ============ INVENTORY MOVES ============
export async function moveInventory({
  date,
  pos,
  product_id,
  qty,
  kind,
  ref_id,
  notes,
}) {
  const { error } = await supabase.from("inventory_moves").insert([
    { date, pos, product_id, qty, kind, ref_id, notes },
  ]);
  if (error) throw error;
}

async function deleteMovesByRef(ref_id) {
  const { error } = await supabase
    .from("inventory_moves")
    .delete()
    .eq("ref_id", ref_id);
  if (error) throw error;
}

// ================ SALES =================
export async function addSale({
  date,
  time,
  pos,
  product_id,
  qty,
  pay_method,
  cash_amount = 0,
  transfer_amount = 0,
  discount_partner = 0,
  shortage = 0,
  notes = "",
}) {
  const { data: product } = await supabase
    .from("products")
    .select("price, vasos_per_unit")
    .eq("id", product_id)
    .single();
  
  if (!product) throw new Error("Producto no encontrado");
  
  const totalVenta = product.price * qty;
  
  if (pay_method === "Efectivo") {
    cash_amount = totalVenta;
    transfer_amount = 0;
  } else if (pay_method === "Transferencia") {
    cash_amount = 0;
    transfer_amount = totalVenta;
  } else if (pay_method === "Mixto") {
    if (cash_amount + transfer_amount !== totalVenta) {
      throw new Error(`En pago Mixto, efectivo (${cash_amount}) + transferencia (${transfer_amount}) debe sumar ${totalVenta}`);
    }
  }

  const { data, error } = await supabase
    .from("sales")
    .insert([
      {
        date,
        time,
        pos,
        product_id,
        qty,
        pay_method,
        cash_amount,
        transfer_amount,
        discount_partner,
        shortage,
        notes,
      },
    ])
    .select("*")
    .single();
  if (error) throw error;

  await moveInventory({
    date,
    pos,
    product_id,
    qty: -qty,
    kind: "sale",
    ref_id: data.id,
  });

  if (product.vasos_per_unit > 0) {
    const { data: vaso } = await supabase
      .from("products")
      .select("id")
      .eq("sku", "VASO-12")
      .single();
    if (vaso)
      await moveInventory({
        date,
        pos,
        product_id: vaso.id,
        qty: -(qty * product.vasos_per_unit),
        kind: "sale",
        ref_id: data.id,
        notes: "Consumo de vasos",
      });
  }

  return data;
}

// ================ INFERIR VENTAS EN EFECTIVO ================
export async function inferCashSales(date, pos) {
  // 1. Obtener productos del POS
  const { data: products } = await supabase
    .from("products")
    .select("*")
    .eq("pos", pos)
    .eq("type", "producto")
    .eq("active", true);

  if (!products) throw new Error("No se encontraron productos");

  const results = [];
  
  for (const product of products) {
    // 2. Obtener conteos de inventario
    const { data: counts } = await supabase
      .from("inventory_counts")
      .select("initial_qty, final_qty")
      .eq("count_date", date)
      .eq("pos", pos)
      .eq("product_id", product.id)
      .single();

    if (!counts) continue; // Sin conteos, no podemos inferir

    // 3. Obtener compras del día
    const { data: purchases } = await supabase
      .from("purchases")
      .select("qty")
      .eq("date", date)
      .eq("pos", pos)
      .eq("product_id", product.id);

    const totalCompras = (purchases || []).reduce((sum, p) => sum + p.qty, 0);

    // 4. Calcular ventas necesarias desde inventario
    const ventasNecesarias = counts.initial_qty + totalCompras - counts.final_qty;

    if (ventasNecesarias <= 0) continue; // No hay ventas que inferir

    // 5. Obtener ventas ya registradas (no efectivo)
    const { data: existingSales } = await supabase
      .from("sales")
      .select("qty")
      .eq("date", date)
      .eq("pos", pos)
      .eq("product_id", product.id)
      .neq("pay_method", "Efectivo");

    const ventasRegistradas = (existingSales || []).reduce((sum, s) => sum + s.qty, 0);

    // 6. Calcular ventas en efectivo a inferir
    const ventasEfectivo = ventasNecesarias - ventasRegistradas;

    if (ventasEfectivo > 0) {
      // 7. Crear venta en efectivo automática
      const time = "23:59:00"; // Hora de cierre
      const saleData = await addSale({
        date,
        time,
        pos,
        product_id: product.id,
        qty: ventasEfectivo,
        pay_method: "Efectivo",
        notes: "Auto-inferido por cierre diario"
      });

      results.push({
        product: product.name,
        qty: ventasEfectivo,
        amount: product.price * ventasEfectivo,
        sale_id: saleData.id
      });
    }
  }

  return results;
}

export async function listSales(date) {
  const { data, error } = await supabase
    .from("sales")
    .select("*, products(name,price,pos)")
    .eq("date", date)
    .order("time");
  if (error) throw error;
  return data || [];
}

export async function deleteSale(id) {
  await deleteMovesByRef(id);
  const { error } = await supabase.from("sales").delete().eq("id", id);
  if (error) throw error;
}

// =============== PURCHASES ==============
export async function addPurchase({
  date,
  pos,
  product_id,
  qty,
  unit_cost,
  notes,
  file,
}) {
  let invoice_path = null;
  if (file) {
    const fileName = `invoices/${Date.now()}_${file.name}`;
    const { error: uerr } = await supabase.storage
      .from("invoices")
      .upload(fileName, file, { upsert: true });
    if (uerr) throw uerr;
    invoice_path = fileName;
  }
  const { data, error } = await supabase
    .from("purchases")
    .insert([
      { date, pos, product_id, qty, unit_cost, notes, invoice_path },
    ])
    .select("*")
    .single();
  if (error) throw error;

  await moveInventory({
    date,
    pos,
    product_id,
    qty,
    kind: "purchase",
    ref_id: data.id,
  });
  return data;
}

// ================ EXPENSES ==============
export async function addExpense({
  date,
  type,
  concept,
  amount,
  attributed_to,
  notes,
}) {
  const { data, error } = await supabase
    .from("expenses")
    .insert([{ date, type, concept, amount, attributed_to, notes }])
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function addPayrollDay({ date, employees }) {
  const promises = employees.map(emp => 
    addExpense({
      date,
      type: "Nomina",
      concept: `Salario diario - ${emp.role}`,
      amount: emp.salary,
      attributed_to: emp.name,
      notes: `Nómina del día ${date}`
    })
  );
  
  const results = await Promise.all(promises);
  return results;
}

// ======== Inventory Counts ========
export async function upsertCounts({ date, pos, rows }) {
  for (const r of rows) {
    const { error } = await supabase.from("inventory_counts").upsert(
      {
        count_date: date,
        pos,
        product_id: r.product_id,
        initial_qty: r.initial_qty ?? 0,
        final_qty: r.final_qty ?? 0,
      },
      { onConflict: "count_date, pos, product_id" }
    );
    if (error) throw error;
  }
}

export async function getCounts(date, pos) {
  const { data, error } = await supabase
    .from("inventory_counts")
    .select("*, products(sku, name)")
    .eq("count_date", date)
    .eq("pos", pos)
    .order("products(name)");
  if (error) throw error;
  return data || [];
}

// ================ Queries for closes =====================
export async function fetchDayClose(date) {
  const [{ data: sales }, { data: expenses }, { data: purchases }] =
    await Promise.all([
      supabase
        .from("sales")
        .select("*, products(name,price,vasos_per_unit)")
        .eq("date", date)
        .order("time"),
      supabase.from("expenses").select("*").eq("date", date),
      supabase.from("purchases").select("*, products(name)").eq("date", date),
    ]);
  return { sales, expenses, purchases };
}

export async function fetchRangeClose(desde, hasta) {
  const [
    { data: sales },
    { data: expenses },
    { data: purchases },
    { data: counts },
    { data: managers },
    { data: partners },
    { data: weeklyExpenses }
  ] = await Promise.all([
    supabase
      .from("sales")
      .select("*, products(name,price,vasos_per_unit,pos)")
      .gte("date", desde)
      .lte("date", hasta),
    supabase.from("expenses").select("*").gte("date", desde).lte("date", hasta),
    supabase
      .from("purchases")
      .select("*, products(name,price,pos)")
      .gte("date", desde)
      .lte("date", hasta),
    supabase
      .from("inventory_counts")
      .select("*, products(name,pos)")
      .gte("count_date", desde)
      .lte("count_date", hasta),
    supabase.from("pos_managers").select("*"),
    supabase.from("partners").select("*"),
    supabase.from("weekly_expenses").select("*").gte("week_start", desde).lte("week_start", hasta)
  ]);
  return { sales, expenses, purchases, counts, managers, partners, weeklyExpenses };
}