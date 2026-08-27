-- Trava de forca bruta no login do painel da roleta.
--
-- A senha e de 4 digitos e o painel lista nome e telefone de lead - dado
-- pessoal sob a LGPD - numa URL publica. So com o atraso de 700ms por
-- tentativa, varrer as 10.000 combinacoes levaria umas 2 horas.
--
-- Nao da pra contar tentativas em memoria: cada requisicao pode cair numa
-- instancia serverless diferente, e o contador nasceria zerado toda vez.
--
-- Guarda hash do IP, nunca o IP: contar nao exige identificar.
create table if not exists public.roleta_painel_tentativas (
  id         uuid primary key default gen_random_uuid(),
  ip_hash    text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_roleta_tentativas_ip
  on public.roleta_painel_tentativas(ip_hash, created_at desc);

alter table public.roleta_painel_tentativas enable row level security;
