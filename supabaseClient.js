// Minimal Supabase client wrapper (v2) for Control_BAR_SNOW
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const supabase = createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY,
  { auth: { persistSession: true } }
);

// Helpers
export const q = (sel) => document.querySelector(sel);
export const money = (n) => (n||0).toLocaleString('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0});

// Inventory moves
export async function moveInventory({date, pos, product_id, qty, kind, ref_id, notes}){
  return await supabase.from('inventory_moves').insert([{date, pos, product_id, qty, kind, ref_id, notes}]);
}

// Sales
export async function addSale({date, time, pos, product_id, qty, pay_method, discount_partner=0, shortage=0, notes=''}){
  const { data, error } = await supabase.from('sales').insert([{date,time,pos,product_id,qty,pay_method,discount_partner,shortage,notes}]).select('*').single();
  if(error) throw error;
  // inventory move for product
  await moveInventory({date, pos, product_id, qty: -qty, kind: 'sale', ref_id: data.id});
  // if product uses cups, discount VASO-12
  const { data: prod } = await supabase.from('products').select('vasos_per_unit').eq('id', product_id).single();
  if(prod && prod.vasos_per_unit>0){
    const { data: vaso } = await supabase.from('products').select('id').eq('sku','VASO-12').single();
    if(vaso) await moveInventory({date, pos, product_id: vaso.id, qty: -(qty * prod.vasos_per_unit), kind:'sale', ref_id: data.id, notes:'Consumo de vasos'});
  }
  // shortage -> debt for manager
  if(shortage > 0){
    const { data: mgr } = await supabase.from('pos_managers').select('manager_name').eq('pos', pos).single();
    const person = mgr?.manager_name || `Encargado ${pos}`;
    await supabase.from('debts').insert([{ date, person, reason: `Descuadre ${pos}`, amount: shortage, balance: shortage }]);
  }
  return data;
}

// Purchases
export async function addPurchase({date, pos, product_id, qty, unit_cost, notes, file}){
  let invoice_path = null;
  if(file){
    const fileName = `invoices/${Date.now()}_${file.name}`;
    const { error: uerr } = await supabase.storage.from('invoices').upload(fileName, file, { upsert: true });
    if(uerr) throw uerr;
    invoice_path = fileName;
  }
  const { data, error } = await supabase.from('purchases').insert([{date,pos,product_id,qty,unit_cost,notes,invoice_path}]).select('*').single();
  if(error) throw error;
  await moveInventory({date, pos, product_id, qty, kind:'purchase', ref_id: data.id});
  return data;
}

// Expenses
export async function addExpense({date, type, concept, amount, attributed_to, notes}){
  const { data, error } = await supabase.from('expenses').insert([{date,type,concept,amount,attributed_to,notes}]).select('*').single();
  if(error) throw error;
  return data;
}

// Inventory Counts (initial/final upsert)
export async function upsertCounts({date, pos, rows}){
  // rows: [{product_id, initial_qty, final_qty}]
  for(const r of rows){
    const { error } = await supabase.from('inventory_counts').upsert({
      count_date: date, pos, product_id: r.product_id,
      initial_qty: r.initial_qty ?? 0,
      final_qty: r.final_qty ?? 0
    }, { onConflict: 'count_date, pos, product_id' });
    if(error) throw error;
  }
}

// Queries for closes
export async function fetchDayClose(date){
  const [{ data: sales }, { data: expenses }, { data: purchases }] = await Promise.all([
    supabase.from('sales').select('*, products(name,price,vasos_per_unit)').eq('date', date).order('time'),
    supabase.from('expenses').select('*').eq('date', date),
    supabase.from('purchases').select('*, products(name)').eq('date', date),
  ]);
  return { sales, expenses, purchases };
}

export async function fetchRangeClose(desde, hasta){
  const [{ data: sales }, { data: expenses }, { data: purchases }, { data: counts }, { data: managers }, { data: partners }] = await Promise.all([
    supabase.from('sales').select('*, products(name,price,vasos_per_unit,pos)').gte('date', desde).lte('date', hasta),
    supabase.from('expenses').select('*').gte('date', desde).lte('date', hasta),
    supabase.from('purchases').select('*, products(name,price,pos)').gte('date', desde).lte('date', hasta),
    supabase.from('inventory_counts').select('*, products(name,pos)').gte('count_date', desde).lte('count_date', hasta),
    supabase.from('pos_managers').select('*'),
    supabase.from('partners').select('*')
  ]);
  return { sales, expenses, purchases, counts, managers, partners };
}
