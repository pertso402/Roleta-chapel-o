-- A roleta passa a ter dois tipos de premio: brinde (item de cortesia) e
-- desconto percentual. Os dois ja existiam em `cupons` e o agente de
-- atendimento ja sabe ler ambos - brinde zera o preco dos itens de
-- itens_permitidos, desconto aplica subtotal * (desconto_percentual/100).
-- Faltava a roleta saber emitir o segundo.
alter table public.roleta_premios
  add column if not exists tipo text not null default 'brinde',
  add column if not exists desconto_percentual int not null default 0;

-- Trava de coerencia. Sem ela da pra cadastrar um brinde sem item nenhum
-- (o agente recusaria a cortesia em silencio e o cliente ficaria sem premio)
-- ou um desconto de 0% (o cliente ganharia nada e ninguem veria o erro).
alter table public.roleta_premios drop constraint if exists roleta_premios_coerencia;
alter table public.roleta_premios add constraint roleta_premios_coerencia check (
  (tipo = 'brinde'
     and coalesce(array_length(itens_permitidos, 1), 0) >= 1
     and desconto_percentual = 0)
  or
  (tipo = 'desconto_percentual'
     and desconto_percentual between 1 and 100)
);

-- Os premios antigos sao DESATIVADOS, nunca apagados: roleta_resgates
-- referencia premio_id e ja existe lead real emitido com eles.
update public.roleta_premios set ativo = false;

insert into public.roleta_premios
  (prefixo, nome, descricao, tipo, desconto_percentual, peso, itens_permitidos, cor, ordem, ativo) values
  ('DOC', 'Sobremesa gratis', '1 sobremesa de 75ml ou 1 chocolate, por nossa conta',
   'brinde', 0, 15, array['Sobremesa 75ml','Chocolate Diversos'], '#1B4D3E', 0, true),
  ('COC', 'Coca mini gratis', '1 Coca-Cola mini de 200ml, por nossa conta',
   'brinde', 0, 20, array['Refrigerante 200ml Pet'], '#C8102E', 1, true),
  ('D15', '15% de desconto', '15% de desconto no seu proximo pedido pelo WhatsApp',
   'desconto_percentual', 15, 25, array[]::text[], '#1D3557', 2, true),
  ('D10', '10% de desconto', '10% de desconto no seu proximo pedido pelo WhatsApp',
   'desconto_percentual', 10, 30, array[]::text[], '#C8102E', 3, true),
  ('D20', '20% de desconto', '20% de desconto no seu proximo pedido pelo WhatsApp',
   'desconto_percentual', 20, 10, array[]::text[], '#E8A33D', 4, true)
on conflict (prefixo) do update set
  nome = excluded.nome, descricao = excluded.descricao, tipo = excluded.tipo,
  desconto_percentual = excluded.desconto_percentual, peso = excluded.peso,
  itens_permitidos = excluded.itens_permitidos, cor = excluded.cor,
  ordem = excluded.ordem, ativo = true;

-- A view expoe tipo e percentual NO FIM da lista: create or replace view nao
-- deixa inserir coluna no meio.
create or replace view public.roleta_funil
with (security_invoker = on) as
select
  r.id, r.codigo, r.nome, r.telefone, r.origem, r.lote,
  r.clicou_whatsapp, r.created_at,
  p.prefixo, p.nome as premio, p.descricao as premio_descricao,
  k.valido_ate, k.usado, k.pedido_id,
  case
    when k.usado then 'resgatado'
    when k.valido_ate < (now() at time zone 'America/Sao_Paulo')::date then 'expirado'
    else 'gerado'
  end as status,
  c.total_pedidos, c.total_gasto,
  ped.total as valor_pedido_resgate,
  p.tipo,
  p.desconto_percentual
from public.roleta_resgates r
join public.roleta_premios  p   on p.id = r.premio_id
join public.cupons          k   on k.id = r.cupom_id
join public.clientes        c   on c.id = r.cliente_id
left join public.pedidos    ped on ped.id = k.pedido_id;
