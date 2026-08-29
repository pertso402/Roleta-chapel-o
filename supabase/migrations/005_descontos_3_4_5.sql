-- Descontos passam de 10/15/20% para 3/4/5%.
--
-- D10 e D15 sao DESATIVADOS, nunca apagados: ja existem cupons emitidos com
-- eles (Meire e Valdenira). Desativar o premio nao mexe nos cupons delas - o
-- percentual mora em `cupons.desconto_percentual`, entao os 10% e 15% delas
-- continuam valendo normalmente no fechamento do pedido.
update public.roleta_premios set ativo = false where prefixo in ('D10','D15','D20');

-- A fatia rara (dourada) passa a ser a Sobremesa: entre "sobremesa gratis" e
-- "5% de desconto" (R$1,05 numa marmitex de R$21), a sobremesa e a que parece
-- premio. Fatia rara que nao empolga desmonta o formato.
--
-- Ordem na roda: a agulha varre indices decrescentes, entao o raro fica no
-- indice 4 e as fatias mais provaveis logo abaixo dele - e por ali que o
-- "quase ganhou" acontece.
insert into public.roleta_premios
  (prefixo, nome, descricao, tipo, desconto_percentual, peso, itens_permitidos, cor, ordem, ativo) values
  ('COC', 'Coca mini gratis', '1 Coca-Cola mini de 200ml, por nossa conta',
   'brinde', 0, 15, array['Refrigerante 200ml Pet'], '#C8102E', 0, true),
  ('D05', '5% de desconto', '5% de desconto no seu proximo pedido pelo WhatsApp',
   'desconto_percentual', 5, 20, array[]::text[], '#1D3557', 1, true),
  ('D04', '4% de desconto', '4% de desconto no seu proximo pedido pelo WhatsApp',
   'desconto_percentual', 4, 25, array[]::text[], '#1B4D3E', 2, true),
  ('D03', '3% de desconto', '3% de desconto no seu proximo pedido pelo WhatsApp',
   'desconto_percentual', 3, 30, array[]::text[], '#C8102E', 3, true),
  ('DOC', 'Sobremesa gratis', '1 sobremesa de 75ml ou 1 chocolate, por nossa conta',
   'brinde', 0, 10, array['Sobremesa 75ml','Chocolate Diversos'], '#E8A33D', 4, true)
on conflict (prefixo) do update set
  nome = excluded.nome, descricao = excluded.descricao, tipo = excluded.tipo,
  desconto_percentual = excluded.desconto_percentual, peso = excluded.peso,
  itens_permitidos = excluded.itens_permitidos, cor = excluded.cor,
  ordem = excluded.ordem, ativo = true;
