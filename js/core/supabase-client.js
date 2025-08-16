// ============ CLIENTE SUPABASE UNIFICADO ============
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Cliente Supabase
export const supabase = createClient(
  window.SUPABASE_URL,
  window.SUPABASE_ANON_KEY,
  { auth: { persistSession: true } }
);

// ============ HELPERS BÁSICOS ============
export const money = (n) => (n || 0).toLocaleString("es-CO", {
  style: "currency", 
  currency: "COP", 
  maximumFractionDigits: 0
});

export const localISODate = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0,10);
};

export const getSelectedDate = () => 
  document.getElementById('appDate')?.value || localISODate();

// ============ OPERACIONES BÁSICAS CRUD ============

// Productos
export async function getProducts() {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("active", true)
    .order("pos, name");
  if (error) throw error;
  return data || [];
}

export async function addProduct(productData) {
  const { data, error } = await supabase
    .from("products")
    .insert([{ ...productData, type: "producto", active: true }])
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// Empleados
export async function getEmployees() {
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("active", true)
    .order("name");
  if (error) throw error;
  return data || [];
}

export async function addEmployee(employeeData) {
  const { data, error } = await supabase
    .from("employees")
    .insert([{ ...employeeData, active: true }])
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// Socios
export async function getPartners() {
  const { data, error } = await supabase
    .from("partners")
    .select("*")
    .order("name");
  if (error) throw error;
  return data || [];
}

export async function addPartner(partnerData) {
  const { data, error } = await supabase
    .from("partners")
    .insert([partnerData])
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// ============ DATOS DEL DASHBOARD ============
export async function getDashboardData(date) {
  try {
    const [salesResult, expensesResult, purchasesResult] = await Promise.all([
      supabase
        .from('sales')
        .select('*, products(name,price,pos)')
        .eq('date', date),
      supabase
        .from('expenses')
        .select('*')
        .eq('date', date),
      supabase
        .from('purchases')
        .select('*, products(name)')
        .eq('date', date)
    ]);

    return {
      sales: salesResult.data || [],
      expenses: expensesResult.data || [],
      purchases: purchasesResult.data || []
    };
  } catch (error) {
    console.error('Error getting dashboard data:', error);
    return { sales: [], expenses: [], purchases: [] };
  }
}