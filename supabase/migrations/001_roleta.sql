-- ═══════════════════════════════════════════════════════════════════════════
-- ROLETA DE RESGATE — Restaurante Chapelão
-- ═══════════════════════════════════════════════════════════════════════════
-- Captura contato de quem só existe dentro do iFood e traz pro WhatsApp.
--
-- DECISÃO CENTRAL: a roleta NÃO tem tabela própria de prêmio resgatado. O
-- prêmio vira uma linha em `cupons` com tipo='brinde', exatamente igual ao
-- brinde de anúncio que já existe. Motivo: o agente de atendimento já sabe
-- ler esse cupom (buscarCupomAtivoPorTelefone), oferecer a cortesia, zerar o
-- preço só dos itens de itens_permitidos e dar baixa no pedido. E a RPC
-- campanha_selecionar_leads já pula quem tem brinde ativo, então o agente de
-- recompra não atropela a roleta — e recupera o lead quando o cupom expira.
--
-- Consequência: nenhuma linha de código muda nos dois agentes em produção.
-- As tabelas abaixo existem só pra medir o funil (as quatro taxas) e pra
-- configurar as fatias sem deploy.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── PRÊMIOS (fatias configuráveis pelo dono) ──────────────────────────────
-- Peso é probabilidade relativa, não percentual: o sorteio normaliza pela
-- soma dos ativos. Assim dá pra desativar uma fatia sem recalcular as outras.
create table if not exists public.roleta_premios (
  id                uuid primary key default gen_random_uuid(),
  prefixo           text not null unique,        -- "BEB" → código BEB-4821
  nome              text not null,               -- rótulo curto na fatia
  descricao         text not null,               -- texto da revelação e do cupom
  peso              int  not null default 10 check (peso >= 0),
  -- Nomes EXATOS do catálogo (public.produtos.nome). O agente compara por
  -- nome normalizado contra esta lista e recusa qualquer item fora dela —
  -- é isso que impede a LLM de dar comida de graça por conta própria.
  -- Vários itens do MESMO preço = cliente escolhe, margem não varia.
  itens_permitidos  text[] not null,
  validade_dias     int  not null default 7,
  cor               text not null default '#C8102E',
  ordem             int  not null default 0,
  ativo             boolean not null default true,
  created_at        timestamptz not null default now()
);

-- ─── SESSÕES (mede abandono entre escanear e preencher) ────────────────────
-- `premio_sorteado_id` é a trava antifraude principal: o prêmio é decidido no
-- servidor no momento do giro e fica preso à sessão. Se o resgate mandasse o
-- prêmio pelo corpo da requisição, bastava abrir o DevTools e pedir o raro.
create table if not exists public.roleta_sessoes (
  id                 uuid primary key default gen_random_uuid(),
  origem             text not null default 'ifood',
  utm_source         text,
  utm_campaign       text,
  lote               text,
  girou              boolean not null default false,
  preencheu          boolean not null default false,
  premio_sorteado_id uuid references public.roleta_premios(id),
  girou_em           timestamptz,
  -- Hash, não o IP cru: serve pra rate limit sem guardar dado pessoal (LGPD).
  ip_hash            text,
  user_agent         text,
  created_at         timestamptz not null default now()
);

create index if not exists idx_roleta_sessoes_created on public.roleta_sessoes(created_at desc);
create index if not exists idx_roleta_sessoes_ip     on public.roleta_sessoes(ip_hash, created_at desc);
create index if not exists idx_roleta_sessoes_lote   on public.roleta_sessoes(lote);

-- ─── RESGATES (o lead capturado) ───────────────────────────────────────────
-- Não guarda status próprio: quem manda em usado/expirado é `cupons`, que é
-- o que o agente de fato lê e escreve. Duplicar status aqui criaria duas
-- verdades e uma delas ficaria velha. Ver a view roleta_funil.
create table if not exists public.roleta_resgates (
  id                  uuid primary key default gen_random_uuid(),
  sessao_id           uuid references public.roleta_sessoes(id),
  premio_id           uuid not null references public.roleta_premios(id),
  cliente_id          uuid not null references public.clientes(id),
  cupom_id            uuid not null references public.cupons(id),
  codigo              text not null unique,      -- espelha cupons.codigo
  nome                text not null,
  -- UNIQUE = um giro por telefone. É a regra antifraude nº 1 da spec, e
  -- aplicada no banco em vez de no código: constraint não tem race condition.
  telefone            text not null unique,
  origem              text not null default 'ifood',
  utm_source          text,
  utm_campaign        text,
  lote                text,
  consentimento_lgpd  boolean not null default false,
  clicou_whatsapp     boolean not null default false,
  clicou_whatsapp_em  timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists idx_roleta_resgates_telefone on public.roleta_resgates(telefone);
create index if not exists idx_roleta_resgates_codigo   on public.roleta_resgates(codigo);
create index if not exists idx_roleta_resgates_created  on public.roleta_resgates(created_at desc);
create index if not exists idx_roleta_resgates_lote     on public.roleta_resgates(lote);

-- ─── VIEW DO FUNIL ─────────────────────────────────────────────────────────
-- Junta resgate + cupom pra o painel não precisar saber que a verdade do
-- status mora em `cupons`. Status derivado, nunca gravado.
-- security_invoker: a view roda com a permissão de quem consulta, não do dono.
-- Sem isso ela viraria um furo por onde a anon key leria telefone de lead.
create or replace view public.roleta_funil
with (security_invoker = on) as
select
  r.id,
  r.codigo,
  r.nome,
  r.telefone,
  r.origem,
  r.lote,
  r.clicou_whatsapp,
  r.created_at,
  p.prefixo,
  p.nome            as premio,
  p.descricao       as premio_descricao,
  k.valido_ate,
  k.usado,
  k.pedido_id,
  case
    when k.usado then 'resgatado'
    when k.valido_ate < (now() at time zone 'America/Sao_Paulo')::date then 'expirado'
    else 'gerado'
  end as status,
  c.total_pedidos,
  c.total_gasto,
  ped.total         as valor_pedido_resgate
from public.roleta_resgates r
join public.roleta_premios  p   on p.id = r.premio_id
join public.cupons          k   on k.id = r.cupom_id
join public.clientes        c   on c.id = r.cliente_id
left join public.pedidos    ped on ped.id = k.pedido_id;

-- ─── RLS ───────────────────────────────────────────────────────────────────
-- Ligado e SEM POLICY nenhuma, de propósito. Todo acesso da landing passa por
-- rota serverless com service_role (que ignora RLS). A anon key nunca recebe
-- permissão de inserir em `cupons` — se recebesse, qualquer pessoa emitiria
-- cortesia de graça com um fetch.
alter table public.roleta_premios  enable row level security;
alter table public.roleta_sessoes  enable row level security;
alter table public.roleta_resgates enable row level security;

-- ─── SEED DAS 5 FATIAS ─────────────────────────────────────────────────────
-- Pesos da spec (35/25/20/15/5) mapeados em faixas de valor REAIS do catálogo.
-- A raridade vem do valor do item (R$4,00 → R$11,90), não de um tipo de
-- prêmio diferente. Nenhum prêmio abate o preço da marmita (regra de margem)
-- nem zera a taxa de entrega — o motor de preço atual não faz isso.
insert into public.roleta_premios (prefixo, nome, descricao, peso, itens_permitidos, cor, ordem) values
  ('BEB', 'Bebida grátis',     '1 refrigerante mini de 200ml (qualquer sabor), por nossa conta',              35, array['Refrigerante 200ml Pet'],                                                                      '#C8102E', 1),
  ('SOB', 'Sobremesa grátis',  '1 sobremesa de 75ml ou 1 chocolate, por nossa conta',                         25, array['Sobremesa 75ml','Chocolate Diversos'],                                                         '#1B4D3E', 2),
  ('LAT', 'Refri lata grátis', '1 refrigerante em lata de 350ml (você escolhe o sabor), por nossa conta',     20, array['Refrigerante Lata','Coca-Cola Lata 350ml','Guaraná Antarctica Lata 350ml'],                    '#1D3557', 3),
  ('SUN', 'Sorvete grátis',    '1 sorvete Guri (sundae, doce de leite ou tablete), por nossa conta',          15, array['Sorvete Guri Sundae','Sorvete Doce de Leite','Sorvete Guri Tablete/Shimo/Brigadeiro/Alfajor'], '#E8A33D', 4),
  ('TOP', 'Sorvete premium',   '1 sorvete premium Guri (Nero, Cookie Croc ou Leite Trufado) — o prêmio raro', 5,  array['Sorvete Guri Nero','Sorvete Guri Cookie Croc','Sorvete Guri Leite Trufado 190g'],              '#8B0000', 5)
on conflict (prefixo) do nothing;
