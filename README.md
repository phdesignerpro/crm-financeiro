# Meu Caixa — CRM financeiro pessoal e profissional

Sistema web de gestão financeira (Next.js + React + TypeScript + Tailwind + Recharts + Lucide), pronto para Supabase
(Auth + PostgreSQL + Row Level Security). Interface em português do Brasil, valores em R$ e datas `dd/mm/aaaa`.

## Como rodar

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # regras financeiras (Vitest)
npm run typecheck && npm run build
```

**Modo demonstração (padrão):** sem variáveis de ambiente o sistema abre direto com dados fictícios realistas, salvos
apenas no `localStorage` do navegador. Não há login nesse modo (não existe usuário a proteger). Em *Configurações* dá
para recarregar a demo ou apagar tudo.

**Modo Supabase (produção):**

1. Crie um projeto no Supabase e rode `supabase/migrations/0001_init.sql` (SQL Editor ou `supabase db push`).
2. Copie `.env.example` para `.env.local` e preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Com isso: login/cadastro reais, `src/proxy.ts` protege todas as rotas e os dados passam a ser lidos/gravados no Postgres.

> A chave `service_role` **nunca** é usada nem deve ser exposta. O navegador só usa a chave `anon`; o isolamento é feito
> por RLS (`user_id = auth.uid()` em todas as tabelas + trigger que impede referenciar linhas de outro usuário).
> O caminho Supabase foi escrito contra a API oficial mas **não foi exercitado contra um projeto real neste ambiente** —
> valide o schema e o login no seu projeto antes de usar dados reais.

## Arquitetura

```
src/
  app/            rotas (App Router): login + (app)/{dashboard,movimentacoes,contas,cartoes,...}
  components/
    ui/           Card, Button, Modal, Form (MoneyInput, TagsInput...), Tabs, StatCard, ProgressBar, Confirm
    charts/       ChartKit (Recharts: barras, área, rosca, empilhado)
    forms/        EntryModal (nova movimentação), EntityForm (formulário guiado por configuração)
    layout/       AppShell, sidebar, menu de "Nova movimentação", notificações, tema
    dashboard/    AvailableCard, Upcoming, CustomizeModal
    transactions/ TransactionList (editar, duplicar, excluir, marcar pago)
  services/       regras de negócio PURAS (sem React): finance, commitments, schedule, cashflow, health, insights,
                  assistant, simulator, reports, notifications, planning, professional, networth, commands
  hooks/          useStore (store externo + useSyncExternalStore), useData/useToday/useActions
  database/       repository (interface), local-repository, supabase-repository, seed (demo), defaults
  types/          modelo de domínio
  utils/          money (centavos), date, labels, csv
supabase/migrations/0001_init.sql   schema + RLS
```

**Camadas:** `pages → hooks/store → services (puros) → database (repositório)`. O store persiste por operações
(`upsert/delete`), então trocar `LocalRepository` por `SupabaseRepository` não altera nenhuma tela. Integração bancária
futura: basta um importador que gere `Transaction`s (já têm conta, status e origem).

**Dinheiro:** sempre inteiro em centavos no app e `numeric(14,2)` no banco — nunca `float`.

## Regras de contabilização (testadas em `finance.test.ts`)

| Operação | Receita/Despesa | Saldo da conta |
|---|---|---|
| Entrada / Saída | conta | muda |
| **Transferência** | **não conta** | origem −, destino + |
| **Compra no cartão** | conta como despesa (na data da compra/parcela) | **não muda** |
| **Pagamento de fatura** | **não conta** (evita dupla contagem) | conta −, fatura quitada |
| Aporte em investimento | não é despesa; vira patrimônio | conta − |

- **Fatura:** compra até o dia de fechamento entra na fatura do mês; depois, na seguinte. Vencimento = próximo dia de vencimento após o fechamento.
- **Parcelas:** compra parcelada gera N lançamentos (resto de centavos na 1ª); é possível antecipar (com desconto) ou cancelar as futuras.
- **Recorrências/assinaturas:** ocorrências vencidas viram lançamentos ao abrir o app (idempotente); as futuras são
  projetadas (calendário, fluxo de caixa, faturas, "Disponível de verdade").

## "Disponível de verdade"

`saldo em contas (sem investimentos) − contas a pagar − despesas programadas − faturas − parcelas − aportes programados
restantes do mês − reserva − impostos reservados`, no horizonte configurável (30 dias).

## Fluxo das principais entidades

`Conta` ← `Movimentação` → `Categoria/Subcategoria` · `Cartão` ← `Compra` (parcelada → `Plano de parcelas`) →
`Fatura` (calculada) ← `Pagamento de fatura` → `Conta` · `Assinatura/Recorrência` → lançamentos reais + projeção ·
`Cliente` → `Cobrança` → (recebida) → `Entrada profissional` na conta · `Investimento` → aportes/resgates →
`Patrimônio` (+ contas + bens − passivos − faturas) → fechamento mensal (`snapshots`).

## Telas

Dashboard · Movimentações · Contas · Cartões de Crédito · Assinaturas · Planejamento (orçamento, fluxo de caixa,
calendário, fixas × variáveis) · Metas · Reserva de Emergência · Investimentos · Patrimônio · Finanças Profissionais ·
Relatórios (CSV/PDF via impressão) · Insights (insights, saúde financeira, assistente) · Simulador "E se?" ·
Configurações (categorias, parâmetros, dados) · Notificações · Login.

## Limitações conhecidas

- O **Assistente** é baseado em regras: entende as perguntas do escopo (gastos por categoria/período, assinaturas,
  parcelas, economia, projeção, "posso gastar R$ X?") e responde com cálculos reais, mas não é um LLM.
- Exportação: CSV e impressão/PDF do navegador (PDF/Excel nativos ficam para uma próxima etapa).
- Investimentos: conteúdo educativo; não recomenda produtos nem garante retorno.
- Valores de patrimônio de meses anteriores vêm de fechamentos salvos (não são reconstruídos retroativamente).
