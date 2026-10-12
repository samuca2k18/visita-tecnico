import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Fotos da visita para o link do cliente (/o/<token>), sem login.
// Quem tem o token do orçamento vê só as fotos dele, por links assinados de 1 hora.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Método inválido." }, 405);
  let t = "";
  try {
    t = String((await req.json())?.t || "");
  } catch {
    return json({ error: "Pedido inválido." }, 400);
  }
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(t)) return json({ photos: [] });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  const { data: rows, error } = await admin
    .from("quote_photos")
    .select("id, kind, path, created_at")
    .eq("quote_token", t)
    .order("created_at")
    .limit(8);
  if (error) return json({ error: "Não consegui buscar as fotos." }, 500);
  if (!rows?.length) return json({ photos: [] });

  const { data: signed, error: sErr } = await admin.storage
    .from("fotos-visita")
    .createSignedUrls(rows.map((r) => r.path), 3600);
  if (sErr) return json({ error: "Não consegui abrir as fotos." }, 500);
  const byPath = new Map((signed || []).map((s) => [s.path, s.signedUrl]));
  return json({
    photos: rows
      .map((r) => ({ id: r.id, kind: r.kind, url: byPath.get(r.path) || "" }))
      .filter((p) => p.url),
  });
});
