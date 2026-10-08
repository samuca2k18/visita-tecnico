import Link from "next/link";

export default function Home() {
  return (
    <main className="wrap">
      <div className="top">
        <div className="brand">Visi<span>ta</span></div>
        <Link className="btn" href="/painel">Entrar no painel</Link>
      </div>
      <section className="hero">
        <div className="kicker">Prestador pequeno</div>
        <h1>Orçamento no link. Cliente aprova. Horário não some.</h1>
        <p>Feito para quem vive de WhatsApp. Sem nota, sem estoque, sem ERP. Você manda o preço. O cliente aprova. Os dois lembram do dia.</p>
      </section>
      <section className="grid">
        <article className="card">
          <div className="kicker">Técnico</div>
          <h3>Painel no celular</h3>
          <p className="muted">Cadastra o serviço uma vez. Gera o orçamento. Copia o link. Marca feito e pago. Sem o cliente baixar app.</p>
          <Link className="btn" href="/painel">Abrir painel</Link>
        </article>
        <article className="card">
          <div className="kicker">Cliente</div>
          <h3>Link público</h3>
          <p className="muted">Vê o serviço, o preço e o horário. Aprova ou recusa. Se aprovou, aparece a chave PIX.</p>
          <Link className="btn-ghost" href="/o/demo">Ver orçamento de exemplo</Link>
        </article>
      </section>
    </main>
  );
}
