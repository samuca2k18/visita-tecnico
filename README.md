# Visita

Orçamento, aprovação e agenda para prestador pequeno. Técnico no painel. Cliente no link. Sem app para o cliente.

## Os dois lados

- `/painel` — técnico cria serviço, gera orçamento, copia o link, marca feito e pago.
- `/o/[token]` — cliente aprova ou recusa. Se aprovou, vê a chave PIX.

Sem as chaves do Supabase o site entra em modo ensaio: os dados do técnico ficam no navegador, e o orçamento vai dentro do link. O cliente abre em outro celular e aprova. A aprovação do ensaio não volta sozinha para o painel. Com Supabase, volta.

## Subir

1. Criar projeto no [Supabase](https://supabase.com). Authentication > Email ligado.
2. Colar `supabase/schema.sql` no SQL Editor e rodar.
3. Na Vercel, importar este repositório.
4. Variáveis:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

5. Deploy.

Preço sugerido, quando tiver 10 técnicos usando: R$ 49/mês. Sem comissão sobre o serviço.
