import { createClient } from "@supabase/supabase-js";

export const TZ = "America/Fortaleza";

export function supabaseReady() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

let client = null;

// Um cliente só para o app inteiro: evita várias instâncias de login brigando pela sessão.
export function getSupabase() {
  if (!supabaseReady()) return null;
  if (!client) {
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  }
  return client;
}

export function money(cents) {
  return (Number(cents || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// "1.200,50" -> 120050 · "R$ 180" -> 18000 · "1.200" -> 120000 · "180.5" -> 18050.
// Devolve NaN quando não dá para ler.
export function parseBRL(input) {
  let s = String(input ?? "").replace(/[^\d.,-]/g, "");
  if (!s || !/\d/.test(s)) return NaN;
  if (s.includes(",")) {
    s = s.replace(/\./g, "").replace(",", ".").replace(/,/g, "");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return Math.round(n * 100);
}

export function centsToInput(cents) {
  const n = Number(cents || 0) / 100;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

export function when(iso) {
  if (!iso) return "A combinar";
  return new Date(iso).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function dateBR(d = new Date()) {
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: TZ });
}

// AAAA-MM-DD no fuso de Fortaleza, para comparar dias.
export function dayKey(d) {
  return new Date(d).toLocaleDateString("en-CA", { timeZone: TZ });
}

// <input type="datetime-local"> <-> ISO, sempre no horário de Fortaleza (UTC-3, sem horário de verão).
export function toLocalInput(iso) {
  if (!iso) return "";
  const local = new Date(new Date(iso).getTime() - 3 * 3600_000);
  return local.toISOString().slice(0, 16);
}

export function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value + ":00-03:00");
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Telefone: guarda só dígitos com 55 + DDD. Devolve "" se não der para usar no WhatsApp.
export function normalizePhone(input) {
  let d = String(input || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) return d;
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  if (d.length === 12 || d.length === 13) d = d.slice(2); // 0 + operadora + DDD + número
  if (d.length === 10 || d.length === 11) return "55" + d;
  return "";
}

export function formatPhone(input) {
  const n = normalizePhone(input);
  if (!n) return String(input || "");
  const local = n.slice(2);
  const ddd = local.slice(0, 2);
  const rest = local.slice(2);
  return rest.length === 9 ? `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}` : `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

export function whatsAppLink(phone, text) {
  const n = normalizePhone(phone);
  if (!n) return "";
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
}

export function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Linhas do orçamento: preço unitário x quantidade. Linhas antigas não têm qty.
export function lineQty(item) {
  return Math.max(1, Math.round(Number(item?.qty) || 1));
}

export function lineTotal(item) {
  return (Number(item?.price_cents) || 0) * lineQty(item);
}

export function itemsOf(quote) {
  const items = Array.isArray(quote?.items) ? quote.items.filter((i) => i && i.name) : [];
  return items.length ? items : [{ name: quote?.service_name || "Serviço", qty: 1, price_cents: Number(quote?.price_cents) || 0 }];
}

export const STATUS = {
  sent: "Enviado",
  approved: "Aprovado",
  rejected: "Recusado/cancelado",
  done: "Feito",
  paid: "Pago"
};
