"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  getSupabase, supabaseReady, money, when, uid, STATUS, parseBRL, centsToInput, dayKey,
  toLocalInput, fromLocalInput, normalizePhone, formatPhone, whatsAppLink, itemsOf, lineQty, lineTotal
} from "../../lib/shared";
import { loadDemo, saveDemo, encodeQuote, loadExtra, saveExtra, shrinkLogo } from "../../lib/demo";
import { openPaper } from "../../lib/papers";
import { Brand, BrandMark, Icon, WhatsAppIcon } from "../../lib/icons";
import { reminderText, reminderLabel } from "../../lib/lembrete";
import { PhotoBox, MAX_PHOTOS } from "../../components/Fotos";
import Relatorio from "../../components/Relatorio";

const PROFILE_FIELDS = ["business_name", "owner_name", "cnpj", "address_line", "city", "phone", "email", "pix_key", "logo_data"];
const DEFAULT_PROFILE = { business_name: "Meu serviço", owner_name: "", cnpj: "", address_line: "", city: "Fortaleza", phone: "", email: "", pix_key: "", logo_data: "" };

function traduz(msg) {
  const m = String(msg || "");
  if (/email rate limit/i.test(m)) return "O Supabase limitou o envio de e-mail. Espera cerca de uma hora, ou entra com a conta que já existe.";
  if (/anonymous sign-ins are disabled/i.test(m)) return "Preencha o e-mail e a senha.";
  if (/invalid login credentials/i.test(m)) return "E-mail ou senha incorretos.";
  if (/email not confirmed/i.test(m)) return "Confirme seu e-mail antes de entrar.";
  if (/already registered|already been registered/i.test(m)) return "Esse e-mail já tem conta. Use Entrar.";
  if (/failed to fetch|network/i.test(m)) return "Sem conexão com o servidor. Confere a internet.";
  if (/jwt|session/i.test(m)) return "Sua sessão expirou. Sai e entra de novo.";
  return m || "Algo deu errado. Tenta de novo.";
}

function cleanProfile(p) {
  const out = {};
  PROFILE_FIELDS.forEach((k) => { out[k] = String(p?.[k] ?? DEFAULT_PROFILE[k] ?? ""); });
  if (!out.business_name.trim()) out.business_name = "Meu serviço";
  return out;
}

export default function Painel() {
  const live = supabaseReady();
  const [tab, setTab] = useState("hoje");
  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [data, setData] = useState(null);
  const [notice, setNotice] = useState({ text: "", bad: false });
  const [draft, setDraft] = useState(null);
  const [draftKey, setDraftKey] = useState(0);

  function say(text, bad = false) { setNotice({ text, bad }); }

  useEffect(() => {
    if (!live) {
      setData(loadDemo());
      setSession({ demo: true });
      return;
    }
    const sb = getSupabase();
    sb.auth.getSession().then(({ data: d }) => setSession(d.session));
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, [live]);

  useEffect(() => {
    if (!live || !session?.user) return;
    refresh();
  }, [live, session?.user?.id]);

  useEffect(() => {
    if (!data || live) return;
    const params = new URLSearchParams(window.location.search);
    const token = params.get("ok") || params.get("no");
    if (!token) return;
    const status = params.get("ok") ? "approved" : "rejected";
    persist({ ...data, quotes: data.quotes.map((q) => q.token === token ? { ...q, status } : q) });
    window.history.replaceState({}, "", "/painel");
  }, [data]);

  async function refresh() {
    const sb = getSupabase();
    const user = session.user;
    const [p, s, q, f] = await Promise.all([
      sb.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      sb.from("services").select("*").eq("user_id", user.id).order("created_at"),
      sb.from("quotes").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
      sb.from("quote_photos").select("id, quote_token, kind, path, created_at").eq("user_id", user.id).order("created_at")
    ]);
    const err = p.error || s.error || q.error;
    if (err) say("Não consegui carregar tudo do servidor: " + traduz(err.message), true);
    const extra = loadExtra();
    // Campos que antes ficavam só neste navegador: usa como reserva e sobe para a conta.
    const server = cleanProfile(p.data || {});
    const local = extra.profile || {};
    const merged = { ...server };
    let migrate = false;
    ["owner_name", "cnpj", "address_line", "email", "logo_data"].forEach((k) => {
      if (!merged[k] && local[k]) { merged[k] = String(local[k]); migrate = true; }
    });
    if (migrate && !err) {
      const { error: upErr } = await sb.from("profiles").upsert({ id: user.id, ...merged });
      if (!upErr) say("Os dados da empresa que estavam só neste aparelho agora estão salvos na sua conta.");
    }
    setData({
      profile: merged,
      services: s.data || [],
      photos: f.data || [],
      quotes: (q.data || []).map((row) => {
        const old = extra.quotes?.[row.token] || {};
        return { ...row, deadline: row.deadline || old.deadline || "", payment: row.payment || old.payment || "" };
      })
    });
  }

  function persist(next) {
    setData(next);
    if (!live) saveDemo(next);
  }

  function readCreds(e) {
    const form = e?.currentTarget?.form || e?.currentTarget;
    const em = String(form?.elements?.email?.value ?? email).trim();
    const pw = String(form?.elements?.password?.value ?? password);
    const hp = String(form?.elements?.website?.value ?? website);
    return { em, pw, hp };
  }

  async function signIn(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    const { em, pw } = readCreds(e);
    if (!em || !pw) return setError("Preencha o e-mail e a senha.");
    setAuthBusy(true);
    const { error: err } = await getSupabase().auth.signInWithPassword({ email: em, password: pw });
    setAuthBusy(false);
    if (err) setError(traduz(err.message));
  }

  async function signUp(e) {
    e.preventDefault();
    setError("");
    setInfo("");
    const { em, pw, hp } = readCreds(e);
    if (!em || !pw) return setError("Preencha o e-mail e a senha para criar a conta.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return setError("Esse e-mail não parece válido.");
    if (pw.length < 6) return setError("A senha precisa ter pelo menos 6 caracteres.");
    setAuthBusy(true);
    const sb = getSupabase();
    const { data: res, error: err } = await sb.functions.invoke("criar-conta", { body: { email: em, password: pw, website: hp } });
    if (err || res?.error) {
      setAuthBusy(false);
      return setError(res?.error || "Não consegui criar a conta agora. Tenta de novo em alguns minutos.");
    }
    setInfo("Conta criada. Entrando.");
    const { error: inErr } = await sb.auth.signInWithPassword({ email: em, password: pw });
    setAuthBusy(false);
    if (inErr) setError(traduz(inErr.message));
  }

  async function saveProfile(profile) {
    say("");
    let logo_data = profile.logo_data || "";
    if (logo_data.startsWith("data:") && !logo_data.startsWith("data:image/jpeg")) logo_data = await shrinkLogo(logo_data);
    if (logo_data.length > 200000) logo_data = await shrinkLogo(logo_data);
    const next = cleanProfile({ ...profile, logo_data, phone: normalizePhone(profile.phone) || profile.phone });
    const extra = loadExtra();
    extra.profile = next;
    saveExtra(extra);
    persist({ ...data, profile: next });
    if (!live) return say("Salvo neste aparelho.");
    const { error: err } = await getSupabase().from("profiles").upsert({ id: session.user.id, ...next });
    if (err) say("Salvo só neste aparelho. O servidor recusou: " + traduz(err.message), true);
    else say("Salvo na sua conta.");
  }

  async function addQuote(payload) {
    const token = uid();
    const row = { ...payload, token, status: "sent" };
    if (!live) {
      persist({ ...data, quotes: [row, ...data.quotes] });
      return { link: `${window.location.origin}/o/${encodeQuote(row, data.profile)}`, quote: row };
    }
    const { error: err } = await getSupabase().from("quotes").insert({ ...payload, token, status: "sent", user_id: session.user.id });
    if (err) return { error: "Não gravei o orçamento: " + traduz(err.message) };
    await refresh();
    return { link: `${window.location.origin}/o/${token}`, quote: row };
  }

  async function updateQuote(token, patch) {
    if (!live) {
      persist({ ...data, quotes: data.quotes.map((q) => q.token === token ? { ...q, ...patch } : q) });
      return {};
    }
    const { error: err } = await getSupabase().from("quotes").update({ ...patch, updated_at: new Date().toISOString() }).eq("token", token);
    if (err) return { error: "Não salvei: " + traduz(err.message) };
    await refresh();
    return {};
  }

  async function setStatus(token, status) {
    const res = await updateQuote(token, { status });
    if (res.error) say(res.error, true);
  }

  async function addService(service) {
    if (!live) {
      persist({ ...data, services: [...data.services, { ...service, id: uid(), active: true }] });
      return {};
    }
    const { error: err } = await getSupabase().from("services").insert({ ...service, user_id: session.user.id });
    if (err) return { error: "Não salvei o serviço: " + traduz(err.message) };
    await refresh();
    return {};
  }

  async function updateService(id, patch) {
    if (!live) {
      persist({ ...data, services: data.services.map((s) => s.id === id ? { ...s, ...patch } : s) });
      return {};
    }
    const { error: err } = await getSupabase().from("services").update(patch).eq("id", id);
    if (err) return { error: "Não salvei o serviço: " + traduz(err.message) };
    await refresh();
    return {};
  }

  function linkFor(q) {
    return live ? `${window.location.origin}/o/${q.token}` : `${window.location.origin}/o/${encodeQuote(q, data.profile)}`;
  }

  function duplicate(q) {
    setDraft({ ...q, token: undefined, status: "sent", scheduled_at: null });
    setDraftKey((k) => k + 1);
    setTab("novo");
  }

  if (!session) {
    return (
      <main className="auth">
        <div className="auth-box">
          <div className="auth-head">
            <Brand />
            <h1>Seu orçamento aprovado pelo WhatsApp</h1>
            <p>Entre pra montar orçamentos, mandar o link pro cliente e acompanhar quem aprovou e quem já pagou.</p>
          </div>
          <form className="card" onSubmit={signIn} noValidate>
            <label htmlFor="email">E-mail</label>
            <input id="email" name="email" autoComplete="email" inputMode="email" placeholder="voce@email.com" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
            <label htmlFor="password">Senha</label>
            <input id="password" name="password" autoComplete="current-password" placeholder="Pelo menos 6 caracteres" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={6} />
            <div className="hp" aria-hidden="true">
              <label htmlFor="website">Site</label>
              <input id="website" name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            {info && <p className="muted" role="status">{info}</p>}
            <div className="stack" style={{ marginTop: 20, gap: 10 }}>
              <button className="btn btn-lg btn-block" type="submit" disabled={authBusy}>Entrar</button>
              <button className="btn-ghost btn-lg btn-block" type="button" disabled={authBusy} onClick={signUp}>Criar conta</button>
            </div>
            <p className="small muted" style={{ marginBottom: 0, textAlign: "center" }}>Primeira vez? Coloque e-mail e senha e toque em Criar conta.</p>
          </form>
          <div className="auth-perks">
            <span><Icon name="check" /> Sem app pro cliente</span>
            <span><Icon name="check" /> PIX direto pra você</span>
            <span><Icon name="check" /> PDF com sua logo</span>
          </div>
        </div>
      </main>
    );
  }

  if (!data) return <main className="auth"><p className="muted">Carregando…</p></main>;

  const tabs = [
    ["hoje", "Hoje", "today"],
    ["relatorio", "Relatório", "chart"],
    ["novo", "Novo", "plus"],
    ["servicos", "Serviços", "wrench"],
    ["ajustes", "Ajustes", "gear"]
  ];

  return (
    <div className="app">
      <header className="appbar">
        <div className="appbar-in">
          <div className="row" style={{ flexWrap: "nowrap", minWidth: 0 }}>
            {data.profile.logo_data
              ? <img src={data.profile.logo_data} alt="" style={{ width: 34, height: 34, borderRadius: 9, objectFit: "contain", background: "#fff", flex: "none" }} />
              : <BrandMark />}
            <div className="biz">
              <b>{data.profile.business_name || "Meu serviço"}</b>
              <span>Visita · painel do técnico</span>
            </div>
          </div>
          <span className={"mode" + (live ? " on" : "")}>{live ? "Online" : "Ensaio"}</span>
        </div>
      </header>
      <main className="content">
        {notice.text && (
          <div className={"notice" + (notice.bad ? " bad" : "")} role={notice.bad ? "alert" : "status"}>
            <span>{notice.text}</span>
            <button className="link" onClick={() => say("")}>fechar</button>
          </div>
        )}
        {tab === "hoje" && <Hoje data={data} live={live} userId={session?.user?.id} refresh={refresh} setStatus={setStatus} updateQuote={updateQuote} linkFor={linkFor} duplicate={duplicate} goNovo={() => setTab("novo")} />}
        {tab === "relatorio" && <Relatorio quotes={data.quotes} />}
        {tab === "novo" && (
          <Novo key={draftKey} data={data} initial={draft} addQuote={addQuote} onDone={() => setDraft(null)} goHoje={() => setTab("hoje")} />
        )}
        {tab === "servicos" && <Servicos data={data} addService={addService} updateService={updateService} />}
        {tab === "ajustes" && <Ajustes data={data} saveProfile={saveProfile} live={live} onOut={() => live ? getSupabase().auth.signOut() : null} />}
      </main>
      <nav className="bottomnav" aria-label="Seções do painel">
        <div className="bottomnav-in">
          {tabs.map(([id, label, icon]) => (
            <button key={id} className={tab === id ? "on" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => { setTab(id); window.scrollTo(0, 0); }}>
              {id === "novo" ? <span className="plus"><Icon name="plus" /></span> : <Icon name={icon} />}
              {label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

function shareText(q, link) {
  return `Olá${q.client_name ? ", " + q.client_name.split(" ")[0] : ""}! Segue o orçamento de ${q.service_name} (${money(q.price_cents)}): ${link}`;
}

function PageTitle({ title, sub, children }) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function Empty({ icon, title, text, action, onAction }) {
  return (
    <div className="empty">
      <div className="ico"><Icon name={icon} /></div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && <button className="btn" onClick={onAction}><Icon name="plus" />{action}</button>}
    </div>
  );
}

function Hoje({ data, live, userId, refresh, setStatus, updateQuote, linkFor, duplicate, goNovo }) {
  const [filter, setFilter] = useState("proximos");
  const [editing, setEditing] = useState("");
  const [photosOf, setPhotosOf] = useState("");
  const photos = data.photos || [];
  const [copied, setCopied] = useState("");
  const today = dayKey(new Date());

  async function copy(q) {
    try {
      await navigator.clipboard.writeText(linkFor(q));
      setCopied(q.token);
    } catch {
      window.prompt("Copie o link:", linkFor(q));
    }
  }

  const open = (q) => ["sent", "approved", "done"].includes(q.status);
  let list = data.quotes.filter((q) => {
    if (filter === "todos") return true;
    if (filter === "hoje") return q.scheduled_at && dayKey(q.scheduled_at) === today;
    return open(q) && (!q.scheduled_at || dayKey(q.scheduled_at) >= today);
  });
  const ts = (q) => (q.scheduled_at ? new Date(q.scheduled_at).getTime() : null);
  list = [...list].sort((a, b) => {
    if (filter === "todos") return (ts(b) ?? new Date(b.created_at || 0).getTime()) - (ts(a) ?? new Date(a.created_at || 0).getTime());
    if (ts(a) === null && ts(b) === null) return 0;
    if (ts(a) === null) return 1;
    if (ts(b) === null) return -1;
    return ts(a) - ts(b);
  });

  const receber = data.quotes.filter((q) => ["approved", "done"].includes(q.status)).reduce((s, q) => s + (Number(q.price_cents) || 0), 0);
  const aprovados = data.quotes.filter((q) => q.status === "approved").length;
  const visitasHoje = data.quotes.filter((q) => q.scheduled_at && dayKey(q.scheduled_at) === today && q.status !== "rejected").length;

  function cancel(q) {
    if (window.confirm(`Cancelar o orçamento de ${q.client_name}? No link do cliente ele aparece como recusado/cancelado.`)) setStatus(q.token, "rejected");
  }

  const next = {
    sent: ["Cliente aprovou", "approved", "check"],
    approved: ["Marcar feito", "done", "check"],
    done: ["Marcar pago", "paid", "money"],
    rejected: ["Reabrir", "sent", "undo"]
  };

  return (
    <div>
      <PageTitle title="Hoje" sub={new Date().toLocaleDateString("pt-BR", { timeZone: "America/Fortaleza", weekday: "long", day: "numeric", month: "long" })} />
      <div className="stats">
        <div className="stat main"><span>A receber</span><b>{money(receber)}</b></div>
        <div className="stat"><span>Aprovados</span><b>{aprovados}</b></div>
        <div className="stat"><span>Visitas hoje</span><b>{visitasHoje}</b></div>
      </div>
      <div className="chips" role="tablist" aria-label="Filtro">
        {[["hoje", "Hoje"], ["proximos", "Próximos"], ["todos", "Todos"]].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={filter === id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      <div className="list">
        {list.length === 0 && (
          data.quotes.length === 0
            ? <Empty icon="file" title="Nenhum orçamento ainda" text="Monte o primeiro em menos de um minuto e mande o link pelo WhatsApp." action="Novo orçamento" onAction={goNovo} />
            : filter === "hoje"
              ? <Empty icon="today" title="Nada marcado pra hoje" text="As visitas com data de hoje aparecem aqui." action="Novo orçamento" onAction={goNovo} />
              : <Empty icon="check" title="Tudo em dia" text="Nenhum orçamento em aberto. Toque em Todos pra ver o histórico." />
        )}
        {list.map((q) => {
          if (editing === q.token) {
            return (
              <QuoteForm
                key={q.token}
                services={data.services}
                initial={q}
                submitLabel="Salvar alterações"
                onCancel={() => setEditing("")}
                onSubmit={async (payload) => {
                  const res = await updateQuote(q.token, payload);
                  if (!res.error) setEditing("");
                  return res;
                }}
              />
            );
          }
          const wa = whatsAppLink(q.client_phone, shareText(q, linkFor(q)));
          const step = next[q.status];
          const isToday = q.scheduled_at && dayKey(q.scheduled_at) === today;
          const primaryCount = (wa ? 1 : 0) + (step ? 1 : 0);
          const remLabel = reminderLabel(q);
          const remText = remLabel ? reminderText(q, linkFor(q), data.profile) : "";
          const remLink = remText ? whatsAppLink(q.client_phone, remText) : "";
          const nPhotos = photos.filter((p) => p.quote_token === q.token).length;
          const copyBtn = (cls) => (
            <button className={cls} onClick={() => copy(q)}><Icon name={copied === q.token ? "check" : "link"} />{copied === q.token ? "Copiado" : "Copiar link"}</button>
          );
          return (
            <article key={q.token} className="qcard">
              <div className="qcard-main">
                <div className="qcard-head">
                  <div style={{ minWidth: 0 }}>
                    <h3>{q.client_name}</h3>
                    <div className="svc">{q.service_name}</div>
                  </div>
                  <div className="qcard-total">
                    <b>{money(q.price_cents)}</b>
                    <span className={"pill " + q.status}>{STATUS[q.status]}</span>
                  </div>
                </div>
                <div className="meta">
                  <span className={isToday ? "when-today" : ""}><Icon name="clock" />{isToday ? "Hoje, " + new Date(q.scheduled_at).toLocaleTimeString("pt-BR", { timeZone: "America/Fortaleza", hour: "2-digit", minute: "2-digit" }) : when(q.scheduled_at)}</span>
                  {q.address && <span><Icon name="pin" />{q.address}</span>}
                  {q.client_phone && <span><Icon name="phone" />{formatPhone(q.client_phone)}</span>}
                </div>
                {itemsOf(q).length > 1 && (
                  <div className="lines-mini">{itemsOf(q).map((item) => (lineQty(item) > 1 ? `${lineQty(item)}× ` : "") + item.name).join(" · ")}</div>
                )}
                <div className="qcard-actions">
                  {wa && <a className="btn-wa" href={wa} target="_blank" rel="noreferrer"><WhatsAppIcon />WhatsApp</a>}
                  {step && <button className={q.status === "rejected" ? "btn-ghost" : "btn"} onClick={() => setStatus(q.token, step[1])}><Icon name={step[2]} />{step[0]}</button>}
                  {primaryCount < 2 && copyBtn("btn-ghost")}
                </div>
              </div>
              <details className="qcard-more">
                <summary>Mais opções <Icon name="chevron" /></summary>
                {remLabel && !remLink && (
                  <p className="wa-hint">{q.client_phone ? "O telefone do cliente não parece válido pro WhatsApp." : "Sem WhatsApp do cliente."} Toque em Editar e coloque com DDD pra mandar lembrete.</p>
                )}
                <div className="row">
                  {remLink && <a className="btn-wa small" href={remLink} target="_blank" rel="noreferrer"><Icon name="bell" />{remLabel}</a>}
                  {primaryCount >= 2 && copyBtn("btn-ghost small")}
                  <button className="btn-ghost small" onClick={() => openPaper("orcamento", q, data.profile)}><Icon name="file" />PDF orçamento</button>
                  <button className="btn-ghost small" onClick={() => openPaper("recibo", q, data.profile)}><Icon name="receipt" />PDF recibo</button>
                  <button className="btn-ghost small" onClick={() => setEditing(q.token)}><Icon name="edit" />Editar</button>
                  <button className="btn-ghost small" onClick={() => duplicate(q)}><Icon name="dup" />Duplicar</button>
                  {live && <button className={(photosOf === q.token ? "btn-soft" : "btn-ghost") + " small"} aria-expanded={photosOf === q.token} onClick={() => setPhotosOf(photosOf === q.token ? "" : q.token)}><Icon name="camera" />Fotos{nPhotos ? ` (${nPhotos}/${MAX_PHOTOS})` : ""}</button>}
                  {["sent", "approved"].includes(q.status) && <button className="btn-danger small" onClick={() => cancel(q)}><Icon name="x" />Cancelar</button>}
                </div>
                {live && photosOf === q.token && <PhotoBox quote={q} userId={userId} photos={photos} onChange={refresh} />}
              </details>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function blankLine() {
  return { key: uid(), name: "", qty: "1", price: "" };
}

function formFrom(q) {
  if (!q) {
    return { client_name: "", client_phone: "", address: "", service_name: "", description: "", when: "", deadline: "A combinar", payment: "À vista, PIX", items: [blankLine()] };
  }
  const items = Array.isArray(q.items) && q.items.length ? q.items : (q.service_name ? itemsOf(q) : []);
  return {
    client_name: q.client_name || "",
    client_phone: q.client_phone ? formatPhone(q.client_phone) : "",
    address: q.address || "",
    service_name: q.service_name || "",
    description: q.description || "",
    when: toLocalInput(q.scheduled_at),
    deadline: q.deadline || "A combinar",
    payment: q.payment || "À vista, PIX",
    items: items.length
      ? items.map((i) => ({ key: uid(), name: i.name || "", qty: String(lineQty(i)), price: centsToInput(i.price_cents) }))
      : [blankLine()]
  };
}

function Section({ n, title, hint, children }) {
  return (
    <section className="section">
      <div className="section-h">
        <span className="n">{n}</span>
        <div><h2>{title}</h2>{hint && <p>{hint}</p>}</div>
      </div>
      {children}
    </section>
  );
}

function QuoteForm({ services, initial, onSubmit, submitLabel, onCancel }) {
  const [form, setForm] = useState(() => formFrom(initial));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const active = services.filter((s) => s.active !== false);
  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  function setItem(key, k, v) {
    setForm((f) => ({ ...f, items: f.items.map((item) => item.key === key ? { ...item, [k]: v } : item) }));
  }
  function removeItem(key) {
    setForm((f) => ({ ...f, items: f.items.length > 1 ? f.items.filter((item) => item.key !== key) : [blankLine()] }));
  }
  const qtyOf = (item) => Math.max(1, Math.round(Number(String(item.qty).replace(",", ".")) || 1));
  const total = form.items.reduce((sum, item) => sum + (parseBRL(item.price) || 0) * qtyOf(item), 0);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    const filled = form.items.filter((item) => item.name.trim() || item.price.trim());
    if (!form.client_name.trim()) return setErr("Coloque o nome do cliente.");
    if (!filled.length) return setErr("Coloque pelo menos um serviço com valor.");
    for (const item of filled) {
      if (!item.name.trim()) return setErr("Tem uma linha com valor e sem nome do serviço.");
      if (!Number.isFinite(parseBRL(item.price))) return setErr(`Não entendi o valor de "${item.name}". Use, por exemplo, 180 ou 1.200,50.`);
    }
    if (total <= 0) return setErr("O total está zerado. Confere os valores.");
    const phone = form.client_phone.trim();
    const normalized = normalizePhone(phone);
    if (phone && !normalized) return setErr("Telefone do cliente com DDD, por exemplo (85) 99999-0000.");
    const items = filled.map((item) => ({ name: item.name.trim(), qty: qtyOf(item), price_cents: parseBRL(item.price) }));
    const payload = {
      client_name: form.client_name.trim(),
      client_phone: normalized,
      address: form.address.trim(),
      service_name: form.service_name.trim() || (items.length === 1 ? items[0].name : `${items[0].name} e mais ${items.length - 1}`),
      description: form.description.trim(),
      deadline: form.deadline.trim() || "A combinar",
      payment: form.payment.trim() || "À vista, PIX",
      items,
      price_cents: total,
      scheduled_at: fromLocalInput(form.when)
    };
    setBusy(true);
    const res = (await onSubmit(payload)) || {};
    setBusy(false);
    if (res.error) setErr(res.error);
  }

  return (
    <form onSubmit={submit} noValidate>
      <Section n="1" title="Cliente" hint="Quem vai receber o orçamento.">
        <label htmlFor="q-client">Nome do cliente</label>
        <input id="q-client" value={form.client_name} autoComplete="off" onChange={(e) => set("client_name", e.target.value)} placeholder="Maria Oliveira" required />
        <label htmlFor="q-phone">WhatsApp do cliente</label>
        <input id="q-phone" value={form.client_phone} inputMode="tel" autoComplete="tel" onChange={(e) => set("client_phone", e.target.value)} onBlur={(e) => set("client_phone", formatPhone(e.target.value))} placeholder="(85) 99999-0000" />
        <label htmlFor="q-address">Endereço</label>
        <input id="q-address" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Rua, número, bairro" />
      </Section>

      <Section n="2" title="Serviços" hint="Quantidade × valor unitário.">
        <label htmlFor="q-object">Objeto (opcional)</label>
        <input id="q-object" value={form.service_name} onChange={(e) => set("service_name", e.target.value)} placeholder="Split 12.000 BTU da sala" />
        {active.length > 0 && (
          <>
            <label htmlFor="q-pick">Adicionar serviço cadastrado</label>
            <select id="q-pick" value="" onChange={(e) => {
              const service = active.find((s) => s.id === e.target.value);
              if (!service) return;
              setForm((f) => ({ ...f, items: [...f.items.filter((item) => item.name || item.price), { key: uid(), name: service.name, qty: "1", price: centsToInput(service.price_cents) }] }));
            }}>
              <option value="">Escolher da lista…</option>
              {active.map((s) => <option key={s.id} value={s.id}>{s.name} · {money(s.price_cents)}</option>)}
            </select>
          </>
        )}
        {form.items.map((item, idx) => {
          const sub = (parseBRL(item.price) || 0) * qtyOf(item);
          return (
            <div className="lineitem" key={item.key}>
              <div className="lineitem-top">
                <input placeholder="Serviço" aria-label={`Serviço ${idx + 1}`} value={item.name} onChange={(e) => setItem(item.key, "name", e.target.value)} />
                <button type="button" className="icon-btn" aria-label="Tirar linha" title="Tirar linha" onClick={() => removeItem(item.key)}><Icon name="trash" /></button>
              </div>
              <div className="lineitem-bottom">
                <div className="stepper">
                  <button type="button" aria-label="Diminuir quantidade" onClick={() => setItem(item.key, "qty", String(Math.max(1, qtyOf(item) - 1)))}>−</button>
                  <input className="qty" aria-label="Quantidade" inputMode="numeric" value={item.qty} onChange={(e) => setItem(item.key, "qty", e.target.value)} />
                  <button type="button" aria-label="Aumentar quantidade" onClick={() => setItem(item.key, "qty", String(qtyOf(item) + 1))}>+</button>
                </div>
                <div className="money-in">
                  <span>R$</span>
                  <input placeholder="Valor" aria-label="Valor unitário" inputMode="decimal" value={item.price} onChange={(e) => setItem(item.key, "price", e.target.value)} />
                </div>
                {qtyOf(item) > 1 && sub > 0 && <span className="line-sub">{money(sub)}</span>}
              </div>
            </div>
          );
        })}
        <button className="btn-ghost add-line" type="button" onClick={() => set("items", [...form.items, blankLine()])}><Icon name="plus" />Mais uma linha</button>
      </Section>

      <Section n="3" title="Quando e pagamento">
        <label htmlFor="q-when">Data da visita</label>
        <input id="q-when" type="datetime-local" value={form.when} onChange={(e) => set("when", e.target.value)} />
        <div className="field-row">
          <div>
            <label htmlFor="q-deadline">Prazo</label>
            <input id="q-deadline" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} placeholder="No dia" />
          </div>
          <div>
            <label htmlFor="q-payment">Pagamento</label>
            <input id="q-payment" value={form.payment} onChange={(e) => set("payment", e.target.value)} />
          </div>
        </div>
        <label htmlFor="q-note">Observação</label>
        <textarea id="q-note" value={form.description} onChange={(e) => set("description", e.target.value)} placeholder="Peças à parte, garantia, etc." />
      </Section>

      {err && <div className="notice bad" role="alert"><span>{err}</span></div>}
      <div className="formbar">
        <div className="tot"><span>Total</span><b>{money(total)}</b></div>
        <div className="row">
          {onCancel && <button className="btn-ghost" type="button" onClick={onCancel}>Voltar</button>}
          <button className="btn btn-lg" type="submit" disabled={busy}>{busy ? "Salvando…" : submitLabel}</button>
        </div>
      </div>
    </form>
  );
}

function Novo({ data, initial, addQuote, onDone, goHoje }) {
  const [result, setResult] = useState(null);
  const [formKey, setFormKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const wa = result ? whatsAppLink(result.quote.client_phone, shareText(result.quote, result.link)) : "";
  if (result) {
    return (
      <div>
        <PageTitle title="Orçamento pronto" />
        <article className="card success">
          <div className="ico"><Icon name="check" /></div>
          <h2>{result.quote.client_name} · {money(result.quote.price_cents)}</h2>
          <p className="muted" style={{ margin: "6px 0 0" }}>Agora é só mandar o link. O cliente aprova por ele.</p>
          <div className="linkbox">Link do cliente:<br /><a href={result.link}>{result.link}</a></div>
          <div className="stack" style={{ gap: 10 }}>
            {wa
              ? <a className="btn-wa btn-lg btn-block" href={wa} target="_blank" rel="noreferrer"><WhatsAppIcon />Mandar no WhatsApp</a>
              : <p className="small muted" style={{ margin: 0 }}>Sem telefone do cliente: copie o link e mande por onde preferir.</p>}
            <button className={(wa ? "btn-ghost" : "btn") + " btn-lg btn-block"} type="button" onClick={async () => { try { await navigator.clipboard.writeText(result.link); setCopied(true); } catch { window.prompt("Copie o link:", result.link); } }}><Icon name={copied ? "check" : "copy"} />{copied ? "Copiado" : "Copiar link"}</button>
            <div className="row" style={{ justifyContent: "center" }}>
              <button className="btn-soft" type="button" onClick={() => { setResult(null); setFormKey((k) => k + 1); }}><Icon name="plus" />Novo orçamento</button>
              <button className="btn-ghost" type="button" onClick={goHoje}>Ver na agenda</button>
            </div>
          </div>
        </article>
      </div>
    );
  }
  return (
    <div>
      <PageTitle title={initial ? "Duplicar orçamento" : "Novo orçamento"} sub="Preencha e gere o link pro cliente." />
      <QuoteForm
        key={formKey}
        services={data.services}
        initial={initial}
        submitLabel="Gerar link"
        onSubmit={async (payload) => {
          const res = await addQuote(payload);
          if (!res.error) { setResult(res); setCopied(false); onDone?.(); }
          return res;
        }}
      />
    </div>
  );
}

function ServiceForm({ initial, onSubmit, onCancel, label }) {
  const [name, setName] = useState(initial?.name || "");
  const [price, setPrice] = useState(initial ? centsToInput(initial.price_cents) : "");
  const [description, setDescription] = useState(initial?.description || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setErr("");
    const cents = parseBRL(price);
    if (!name.trim()) return setErr("Coloque o nome do serviço.");
    if (!Number.isFinite(cents) || cents <= 0) return setErr("Preço inválido. Use, por exemplo, 180 ou 1.200,50.");
    setBusy(true);
    const res = (await onSubmit({ name: name.trim(), description: description.trim(), price_cents: cents })) || {};
    setBusy(false);
    if (res.error) return setErr(res.error);
    if (!initial) { setName(""); setPrice(""); setDescription(""); }
  }
  return (
    <form className="card" style={{ marginTop: initial ? 0 : 16 }} onSubmit={submit} noValidate>
      <h3>{label}</h3>
      <label htmlFor={"s-name-" + (initial?.id || "new")}>Nome</label>
      <input id={"s-name-" + (initial?.id || "new")} placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} required />
      <label htmlFor={"s-price-" + (initial?.id || "new")}>Preço</label>
      <div className="money-in"><span>R$</span><input id={"s-price-" + (initial?.id || "new")} placeholder="Preço (R$)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required /></div>
      <label htmlFor={"s-desc-" + (initial?.id || "new")}>O que está incluso</label>
      <textarea id={"s-desc-" + (initial?.id || "new")} placeholder="Incluso" value={description} onChange={(e) => setDescription(e.target.value)} />
      {err && <p className="error" role="alert">{err}</p>}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar serviço"}</button>
        {onCancel && <button className="btn-ghost" type="button" onClick={onCancel}>Voltar</button>}
      </div>
    </form>
  );
}

function Servicos({ data, addService, updateService }) {
  const [editing, setEditing] = useState("");
  const [err, setErr] = useState("");
  const active = data.services.filter((s) => s.active !== false);
  const archived = data.services.filter((s) => s.active === false);
  async function toggle(s, value) {
    setErr("");
    const res = await updateService(s.id, { active: value });
    if (res.error) setErr(res.error);
  }
  function row(s) {
    if (editing === s.id) {
      return (
        <ServiceForm key={s.id} initial={s} label="Editar serviço" onCancel={() => setEditing("")}
          onSubmit={async (patch) => { const res = await updateService(s.id, patch); if (!res.error) setEditing(""); return res; }} />
      );
    }
    return (
      <article key={s.id} className={"svc-card" + (s.active === false ? " archived" : "")}>
        <div className="split" style={{ alignItems: "flex-start" }}>
          <div><b>{s.name}</b>{s.description && <span className="desc">{s.description}</span>}</div>
          <span className="price">{money(s.price_cents)}</span>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn-ghost small" onClick={() => setEditing(s.id)}><Icon name="edit" />Editar</button>
          {s.active !== false
            ? <button className="btn-ghost small" onClick={() => toggle(s, false)}><Icon name="archive" />Arquivar</button>
            : <button className="btn-soft small" onClick={() => toggle(s, true)}><Icon name="undo" />Reativar</button>}
        </div>
      </article>
    );
  }
  return (
    <div>
      <PageTitle title="Serviços" sub="Cadastre uma vez, use em todo orçamento." />
      {err && <div className="notice bad" role="alert"><span>{err}</span></div>}
      <div className="list">
        {active.length === 0 && <Empty icon="wrench" title="Nenhum serviço ainda" text="Cadastre os serviços que você faz sempre, com o preço. Eles aparecem pra escolher no Novo." />}
        {active.map(row)}
      </div>
      <ServiceForm label="Novo serviço" onSubmit={addService} />
      {archived.length > 0 && (
        <>
          <p className="kicker" style={{ marginTop: 24 }}>Arquivados</p>
          <div className="list">{archived.map(row)}</div>
        </>
      )}
    </div>
  );
}

function Ajustes({ data, saveProfile, live, onOut }) {
  const [profile, setProfile] = useState({ ...data.profile, phone: formatPhone(data.profile.phone) });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const set = (k, v) => setProfile((p) => ({ ...p, [k]: v }));
  return (
    <form onSubmit={async (e) => { e.preventDefault(); setSaving(true); await saveProfile(profile); setSaving(false); }}>
      <PageTitle title="Ajustes" sub="Como sua empresa aparece no link e no PDF." />
      <section className="section">
        <div className="section-h"><span className="n"><Icon name="file" width="16" height="16" /></span><div><h2>Empresa</h2></div></div>
        <label>Nome no papel</label>
        <input value={profile.business_name || ""} onChange={(e) => set("business_name", e.target.value)} />
        <label>Responsável</label>
        <input value={profile.owner_name || ""} onChange={(e) => set("owner_name", e.target.value)} />
        <label>CNPJ</label>
        <input value={profile.cnpj || ""} inputMode="numeric" onChange={(e) => set("cnpj", e.target.value)} />
        <label>Endereço da empresa</label>
        <input value={profile.address_line || ""} onChange={(e) => set("address_line", e.target.value)} />
        <label>Cidade</label>
        <input value={profile.city || ""} onChange={(e) => set("city", e.target.value)} />
      </section>
      <section className="section">
        <div className="section-h"><span className="n"><Icon name="money" width="16" height="16" /></span><div><h2>Contato e PIX</h2><p>O cliente vê depois de aprovar.</p></div></div>
        <label>Telefone (WhatsApp)</label>
        <input value={profile.phone || ""} inputMode="tel" onChange={(e) => set("phone", e.target.value)} onBlur={(e) => set("phone", formatPhone(e.target.value))} placeholder="(85) 99999-0000" />
        <label>E-mail</label>
        <input value={profile.email || ""} type="email" inputMode="email" onChange={(e) => set("email", e.target.value)} />
        <label>Chave PIX</label>
        <input value={profile.pix_key || ""} onChange={(e) => set("pix_key", e.target.value)} />
      </section>
      <section className="section">
        <div className="section-h"><span className="n"><Icon name="image" width="16" height="16" /></span><div><h2>Logo</h2><p>Aparece no topo do PDF e no link do cliente.</p></div></div>
        <label>Logo</label>
        <input type="file" accept="image/*" onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setMsg("");
          const reader = new FileReader();
          reader.onload = async () => {
            const small = await shrinkLogo(reader.result);
            if (!small) return setMsg("Não consegui ler essa imagem. Tenta um JPG ou PNG.");
            set("logo_data", small);
          };
          reader.readAsDataURL(file);
        }} />
        {msg && <p className="error">{msg}</p>}
        {profile.logo_data && (
          <div className="row" style={{ marginTop: 12 }}>
            <img src={profile.logo_data} alt="Logo" style={{ height: 64, borderRadius: 10, background: "#fff", border: "1px solid var(--line)" }} />
            <button className="btn-ghost small" type="button" onClick={() => set("logo_data", "")}><Icon name="trash" />Tirar logo</button>
          </div>
        )}
      </section>
      <button className="btn btn-lg btn-block" type="submit" disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button>
      <p className="small muted">{live ? "Tudo aqui fica salvo na sua conta, inclusive a logo (reduzida)." : "Sem Supabase: os dados ficam neste navegador. O link do cliente funciona em outro celular porque o orçamento vai dentro do próprio link."}</p>
      <p className="small muted">O PDF deixa o campo de assinatura em branco. Assine à mão ou digitalmente.</p>
      {live && <button className="btn-ghost btn-block" type="button" onClick={onOut} style={{ marginTop: 8 }}><Icon name="out" />Sair da conta</button>}
    </form>
  );
}
