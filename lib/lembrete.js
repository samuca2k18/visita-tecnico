import { money, TZ, dayKey } from "./shared";

// Texto do lembrete pelo WhatsApp, conforme a situação do orçamento.
export function reminderText(q, link, profile = {}) {
  const first = String(q.client_name || "").trim().split(/\s+/)[0];
  const oi = `Olá${first ? ", " + first : ""}! Aqui é ${profile.owner_name || profile.business_name || "o técnico"}.`;
  const future = q.scheduled_at && new Date(q.scheduled_at).getTime() > Date.now() - 3 * 3600_000;
  if (q.status === "sent") {
    return `${oi} Passando pra lembrar do orçamento de ${q.service_name} (${money(q.price_cents)}), que ainda está esperando sua aprovação. Dá pra ver e aprovar por aqui: ${link}`;
  }
  if (q.status === "approved" && future) {
    const d = new Date(q.scheduled_at);
    const today = dayKey(new Date());
    const tomorrow = dayKey(new Date(Date.now() + 86400000));
    const hora = d.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
    const dia = dayKey(d) === today ? "hoje" : dayKey(d) === tomorrow ? "amanhã"
      : d.toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "long", day: "2-digit", month: "2-digit" });
    return `${oi} Lembrete da visita de ${q.service_name}: ${dia}, às ${hora}${q.address ? ", em " + q.address : ""}. Qualquer mudança, me avisa por aqui.`;
  }
  if (q.status === "done") {
    return `${oi} O serviço de ${q.service_name} ficou em ${money(q.price_cents)}. O PIX está no link: ${link}`;
  }
  if (q.status === "approved") {
    return `${oi} Seu orçamento de ${q.service_name} está aprovado. Vamos combinar o dia da visita? ${link}`;
  }
  return "";
}

export function reminderLabel(q) {
  if (q.status === "sent") return "Lembrar aprovação";
  if (q.status === "approved" && q.scheduled_at && new Date(q.scheduled_at).getTime() > Date.now() - 3 * 3600_000) return "Lembrar visita";
  if (q.status === "done") return "Lembrar pagamento";
  if (q.status === "approved") return "Combinar visita";
  return "";
}
