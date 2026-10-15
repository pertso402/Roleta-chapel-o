-- VSL do Convênio Chapelão: quem assiste o vídeo até o fim tem o prêmio dobrado.
--
-- O dobro é só TEXTO no cupom. O agente de atendimento lança o brinde com a
-- quantidade que a conversa pedir, e quem segura a quantidade é a descrição
-- ("O que ele ganhou: *...*" no prompt). Trocar `cupons.descricao` pelo texto
-- em dobro é tudo que precisa — nenhuma linha muda no motor de preço.
--
-- Prêmio sem `descricao_dobro` não oferece o vídeo: é assim que se desliga a
-- oferta de uma fatia sem deploy.
alter table public.roleta_premios
  add column if not exists nome_dobro      text,
  add column if not exists descricao_dobro text;

update public.roleta_premios set
  nome_dobro = '2 sobremesas grátis',
  descricao_dobro = '2 sobremesas de 75ml ou 2 chocolates (pode misturar), por nossa conta'
where prefixo = 'DOC';

update public.roleta_premios set
  nome_dobro = '2 Coca mini grátis',
  descricao_dobro = '2 refrigerantes mini de 200ml (qualquer sabor), por nossa conta'
where prefixo = 'COC';

update public.roleta_premios set
  nome_dobro = '2 refri lata grátis',
  descricao_dobro = '2 refrigerantes em lata de 350ml (você escolhe os sabores), por nossa conta'
where prefixo = 'LAT';

update public.roleta_premios set
  nome_dobro = '2 almoços grátis',
  descricao_dobro = '2 marmitas Médias por nossa conta — o prêmio raro da roleta, em dobro'
where prefixo = 'ALM';

-- ─── FUNIL DO VÍDEO ────────────────────────────────────────────────────────
-- Uma linha por lead já existe (roleta_resgates), e o vídeo é 1:1 com ela.
-- Colunas em vez de tabela de eventos: o painel lê o funil com um select só.
--
-- `video_max_seg` é o ponto mais longe que a pessoa assistiu. A curva de
-- retenção sai da distribuição dele — onde a VSL perde gente.
-- `video_concluiu_em` é também o momento em que o prêmio dobrou.
alter table public.roleta_resgates
  add column if not exists video_oferta_em    timestamptz,
  add column if not exists video_play_em      timestamptz,
  add column if not exists video_max_seg      int not null default 0,
  add column if not exists video_concluiu_em  timestamptz,
  add column if not exists clicou_convenio    boolean not null default false,
  add column if not exists clicou_convenio_em timestamptz;

-- A view agora diz o que o CUPOM diz. `premio_descricao` vem de
-- cupons.descricao, que é o texto que o agente lê — depois do dobro, o
-- atendente no balcão precisa ver "2 refrigerantes", não "1".
-- Colunas novas no fim: create or replace view não deixa inserir no meio.
-- `oferta_id` existe em produção (veio de fora deste repositório) e fica.
create or replace view public.roleta_funil
with (security_invoker = on) as
select
  r.id, r.codigo, r.nome, r.telefone, r.origem, r.lote,
  r.clicou_whatsapp, r.created_at, r.oferta_id,
  p.prefixo,
  case when r.video_concluiu_em is not null then coalesce(p.nome_dobro, p.nome) else p.nome end as premio,
  coalesce(k.descricao, p.descricao) as premio_descricao,
  k.valido_ate, k.usado, k.pedido_id,
  case
    when k.usado then 'resgatado'
    when k.valido_ate < (now() at time zone 'America/Sao_Paulo')::date then 'expirado'
    else 'gerado'
  end as status,
  c.total_pedidos, c.total_gasto,
  ped.total as valor_pedido_resgate,
  p.tipo,
  p.desconto_percentual,
  r.video_oferta_em,
  r.video_play_em,
  r.video_max_seg,
  r.video_concluiu_em,
  r.clicou_convenio,
  p.nome_dobro is not null and p.descricao_dobro is not null as pode_dobrar
from public.roleta_resgates r
join public.roleta_premios  p   on p.id = r.premio_id
join public.cupons          k   on k.id = r.cupom_id
join public.clientes        c   on c.id = r.cliente_id
left join public.pedidos    ped on ped.id = k.pedido_id;
