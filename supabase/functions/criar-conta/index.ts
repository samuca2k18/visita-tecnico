import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Cria conta já confirmada (o plano grátis do Supabase quase não manda e-mail).
// Proteções: campo isca (website), limite por IP e por e-mail em public.signup_attempts.
const MAX_PER_IP_HOUR = 5;
const MAX_PER_EMAIL_HOUR = 3;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function clientIp(req: Request) {
  const raw = req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") ||
    (req.headers.get("x-forwarded-for") || "").split(",")[0];
  return (raw || "").trim().slice(0, 64);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método inválido." }, 405);
  let body: { email?: string; password?: string; website?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Pedido inválido." });
  }
  if (body.website) return json({ error: "Pedido inválido." });
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    return json({ error: "Coloque um e-mail válido." });
  }
  if (password.length < 6 || password.length > 72) {
    return json({ error: "A senha precisa ter de 6 a 72 caracteres." });
  }
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const ip = clientIp(req);
  const since = new Date(Date.now() - 3600_000).toISOString();
  const [byIp, byEmail] = await Promise.all([
    ip
      ? admin.from("signup_attempts").select("id", { count: "exact", head: true }).eq("ip", ip).gte("created_at", since)
      : Promise.resolve({ count: 0, error: null }),
    admin.from("signup_attempts").select("id", { count: "exact", head: true }).eq("email", email).gte("created_at", since),
  ]);
  if (byIp.error || byEmail.error) return json({ error: "Não consegui criar a conta agora. Tenta de novo em alguns minutos." });
  if ((byIp.count ?? 0) >= MAX_PER_IP_HOUR || (byEmail.count ?? 0) >= MAX_PER_EMAIL_HOUR) {
    return json({ error: "Muitas tentativas de cadastro. Espera uma hora e tenta de novo." });
  }
  await admin.from("signup_attempts").insert({ ip, email });
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    const msg = /already|registered|exists/i.test(error.message)
      ? "Esse e-mail já tem conta. Use Entrar."
      : /password/i.test(error.message)
      ? "Senha fraca demais. Usa uma maior, com letras e números."
      : "Não consegui criar a conta agora. Tenta de novo em alguns minutos.";
    return json({ error: msg });
  }
  return json({ ok: true });
});
