-- Acha o cliente pela MESMA chave que o resto do sistema usa: tel_chave =
-- DDD + últimos 8 dígitos. Isso torna o casamento imune à ambiguidade do
-- nono dígito (554491234567 vs 5544991234567), que é como o WhatsApp grava
-- uns números e o formulário da roleta manda outros.
--
-- Sem isso, um cliente antigo poderia ganhar uma linha DUPLICADA em
-- `clientes`: o cupom ficaria preso na linha nova e o agente de atendimento
-- continuaria consultando a antiga pelo JID. O prêmio sumiria sem erro
-- nenhum — nem no log, nem pro cliente, nem pro atendente.
--
-- Usa idx_clientes_tel_chave. Ordena por total_pedidos pra, num empate de
-- chave, ficar com o cadastro que tem histórico de compra.
create or replace function public.roleta_achar_cliente(p_telefone text)
returns table (id uuid, nome text, telefone text, tags text[],
               demonstrou_interesse_em timestamptz, total_pedidos int)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.nome, c.telefone, c.tags, c.demonstrou_interesse_em, c.total_pedidos
  from public.clientes c
  where public.tel_chave(c.telefone) = public.tel_chave(p_telefone)
  order by coalesce(c.total_pedidos, 0) desc, c.created_at asc
  limit 1;
$$;

-- Só a landing (service_role) chama isso. Exposta pra anon, viraria um jeito
-- de qualquer pessoa procurar cliente por telefone na base inteira.
revoke execute on function public.roleta_achar_cliente(text) from public, anon, authenticated;
grant  execute on function public.roleta_achar_cliente(text) to service_role;
