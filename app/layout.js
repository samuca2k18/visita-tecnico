import "./globals.css";

export const metadata = {
  title: "Visita — orçamento que o cliente aprova",
  description: "Painel do técnico e link do cliente. Orçamento, agenda e PIX, sem ERP."
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
