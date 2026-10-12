import Link from "next/link";
import { Brand, Icon, WhatsAppIcon } from "../lib/icons";

export default function Home() {
  return (
    <main>
      <div className="wrap">
        <header className="top">
          <Brand />
          <Link className="btn" href="/painel">Entrar</Link>
        </header>

        <section className="hero">
          <div className="stack" style={{ gap: 20 }}>
            <span className="hero-badge"><Icon name="snow" width="16" height="16" /> Para técnico de ar-condicionado e serviços em casa</span>
            <h1>Orçamento no WhatsApp, <em>aprovado em um toque.</em></h1>
            <p>Monte o orçamento no celular, mande o link pro cliente e receba a aprovação e o PIX. Sem app pro cliente baixar, sem planilha, sem ERP.</p>
            <div className="row">
              <Link className="btn" href="/painel">Criar minha conta</Link>
              <Link className="btn-ghost" href="/o/demo">Ver orçamento de exemplo</Link>
            </div>
          </div>

          <div className="preview" aria-hidden="true">
            <div className="split">
              <div>
                <div className="kicker">Orçamento</div>
                <b style={{ fontSize: 18 }}>Limpeza de split</b>
              </div>
              <span className="pill approved">Aprovado</span>
            </div>
            <div className="meta">
              <span><Icon name="clock" /> Amanhã, 9:00</span>
              <span><Icon name="pin" /> Aldeota, Fortaleza</span>
            </div>
            <div className="lines-mini" style={{ marginTop: 12 }}>
              <div className="split"><span>2× Limpeza de split</span><b>R$ 360,00</b></div>
              <div className="split"><span>Troca de filtro</span><b>R$ 40,00</b></div>
            </div>
            <div className="split" style={{ marginTop: 12 }}>
              <span className="muted">Total</span>
              <b className="price" style={{ fontSize: 24, color: "var(--brand-strong)" }}>R$ 400,00</b>
            </div>
            <div className="btn-wa btn-block" style={{ marginTop: 12 }}><WhatsAppIcon width="18" height="18" /> Mandar no WhatsApp</div>
          </div>
        </section>

        <section className="benefits">
          <article className="card benefit">
            <div className="ico"><Icon name="bolt" /></div>
            <h3>Orçamento em 1 minuto</h3>
            <p>Cadastre seus serviços com preço uma vez. Depois é só escolher, ajustar a quantidade e gerar o link.</p>
          </article>
          <article className="card benefit">
            <div className="ico"><Icon name="check" /></div>
            <h3>O cliente aprova pelo link</h3>
            <p>Ele vê os itens, o total e a data, aprova ou recusa e já recebe a sua chave PIX. Você vê na hora no painel.</p>
          </article>
          <article className="card benefit">
            <div className="ico"><Icon name="file" /></div>
            <h3>PDF de orçamento e recibo</h3>
            <p>Papel com sua logo, CNPJ e assinatura. Agenda do dia e quanto falta receber, tudo no celular.</p>
          </article>
        </section>
      </div>
      <footer className="footer">
        <div className="wrap split">
          <span>Visita · feito em Fortaleza</span>
          <Link href="/painel">Abrir painel</Link>
        </div>
      </footer>
    </main>
  );
}
