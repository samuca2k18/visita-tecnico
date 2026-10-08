import { createClient } from "@supabase/supabase-js";

export function supabaseReady() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getSupabase() {
  if (!supabaseReady()) return null;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function when(iso) {
  if (!iso) return "A combinar";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

export const STATUS = {
  sent: "Enviado",
  approved: "Aprovado",
  rejected: "Recusado",
  done: "Feito",
  paid: "Pago"
};
