import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { gerarCodigo, sortearPremio } from './sorteio.js';
import { telefoneCanonico, validarTelefoneBR, variantesTelefone } from './telefone.js';

// service_role: ignora RLS. Só existe aqui, nunca no bundle do browser.
//
// O cliente é criado na PRIMEIRA USADA, não na importação do módulo. Motivo
// concreto: `next build` avalia os módulos das rotas pra coletar configuração,
// e o createClient estoura "supabaseUrl is required" se as variáveis ainda não
// existirem. Numa Vercel recém-criada elas não existem — o build falharia
// antes de alguém ter chance de preencher.
//
// Além disso, o erro passa a aparecer em runtime com nome e recado claros, em
// vez de um stack trace de build apontando pra uma linha de import.
let _cliente = null;

// Diz quais variáveis estão faltando, sem revelar valor nenhum. Existe pra
// transformar "não consegui carregar a roleta" — que não ajuda ninguém — num
// diagnóstico de uma olhada. Ver /api/saude.
export function faltandoConfig() {
  const faltando = [];
  if (!process.env.SUPABASE_URL) faltando.push('SUPABASE_URL');
  if (!process.env.SUPABASE_SERVICE_KEY) faltando.push('SUPABASE_SERVICE_KEY');
  return faltando;
}

function conectar() {
  if (_cliente) return _cliente;

  const url = process.env.SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !chave) {
    throw new Error(
      'Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_KEY nas variáveis de ambiente do projeto.',
    );
  }

  _cliente = createClient(url, chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _cliente;
}

// Proxy pra o resto do código continuar escrevendo `sb.from(...)` sem saber
// que a conexão é preguiçosa.
export const sb = new Proxy({}, {
  get(_alvo, prop) {
    const c = conectar();
    const valor = c[prop];
    return typeof valor === 'function' ? valor.bind(c) : valor;
  },
});

// Data de hoje em São Paulo. Em UTC, às 21h de Brasília já virou o dia
// seguinte — a validade do cupom sairia um dia curta. Mesmo cuidado que o
// agente de recompra já toma.
export function hojeSaoPaulo() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function emDias(dias) {
  const d = new Date(Date.now() + dias * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

// ─── RATE LIMIT ──────────────────────────────────────────────────────────────
// Hash com sal: dá pra contar requisições do mesmo IP sem guardar o IP, que é
// dado pessoal sob a LGPD. O limite é folgado de propósito — operadora móvel
// coloca muita gente atrás do mesmo IP (CGNAT), e barrar cliente real custa
// mais caro que barrar script. A trava séria contra fraude é o UNIQUE no
// telefone, não isto aqui.
export function hashIp(ip) {
  return createHash('sha256').update(`${process.env.IP_SALT || ''}:${ip || ''}`).digest('hex').slice(0, 32);
}

export async function excedeuLimite(ipHash, { tabela, limite, janelaMin }) {
  const desde = new Date(Date.now() - janelaMin * 60_000).toISOString();
  const { count, error } = await sb
    .from(tabela)
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', desde);
  if (error) throw new Error(`rate-limit/${tabela}: ${error.message}`);
  return (count || 0) >= limite;
}

// Só tentativa ERRADA de login entra aqui. Best-effort: se a gravação falhar,
// o login segue o fluxo normal — perder um registro de contagem é melhor que
// derrubar o painel na cara do atendente durante o almoço.
export async function registrarTentativaLogin(ipHash) {
  const { error } = await sb.from('roleta_painel_tentativas').insert({ ip_hash: ipHash });
  if (error) console.error('[registrarTentativaLogin]', error.message);
}

// ─── PRÊMIOS ─────────────────────────────────────────────────────────────────

export async function listarPremios({ apenasAtivos = true } = {}) {
  let q = sb.from('roleta_premios').select('*').order('ordem');
  if (apenasAtivos) q = q.eq('ativo', true);
  const { data, error } = await q;
  if (error) throw new Error(`listarPremios: ${error.message}`);
  return data || [];
}

// O que o browser pode ver de um prêmio. `peso` e `itens_permitidos` ficam de
// fora: peso entrega a probabilidade e itens_permitidos é regra de negócio.
//
// `raro` é a exceção deliberada: a animação precisa saber qual fatia namorar
// antes de parar, e isso já é visível a olho nu (é a fatia dourada). Saber
// qual é a rara não ajuda ninguém a ganhá-la — o sorteio é servidor.
export function premioPublico(p, raroId) {
  return {
    id: p.id, nome: p.nome, descricao: p.descricao,
    cor: p.cor, ordem: p.ordem, raro: p.id === raroId,
  };
}

// A fatia de menor peso entre as ativas. Empate resolve pelo primeiro.
export function idDoPremioRaro(premios) {
  const ativos = premios.filter((p) => p.ativo && p.peso > 0);
  if (!ativos.length) return null;
  return ativos.reduce((min, p) => (p.peso < min.peso ? p : min), ativos[0]).id;
}

// ─── SESSÕES ─────────────────────────────────────────────────────────────────

// Recupera uma sessão que o navegador já tem. Serve pra recarga da página não
// virar um "QR escaneado" novo: sem isto, cada F5 criava outra linha e a taxa
// 1 — justamente a que mede se o adesivo funciona — saía inflada.
export async function buscarSessao(id) {
  if (!id) return null;
  const { data, error } = await sb
    .from('roleta_sessoes')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (error) return null;
  return data || null;
}

export async function criarSessao({ origem, utmSource, utmCampaign, lote, ipHash, userAgent }) {
  const { data, error } = await sb
    .from('roleta_sessoes')
    .insert({
      origem: origem || 'ifood',
      utm_source: utmSource || null,
      utm_campaign: utmCampaign || null,
      lote: lote || null,
      ip_hash: ipHash,
      user_agent: (userAgent || '').slice(0, 400) || null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`criarSessao: ${error.message}`);
  return data;
}

// Sorteia e PRENDE o prêmio na sessão. O resgate depois lê o prêmio daqui e
// ignora qualquer prêmio que venha no corpo da requisição — é essa amarração
// que impede alguém de pedir o prêmio raro direto na API.
//
// Idempotente: girar duas vezes na mesma sessão devolve o mesmo prêmio, em
// vez de deixar o cliente girar de novo até tirar o que quer.
export async function registrarGiro(sessaoId) {
  const { data: sessao, error: errSessao } = await sb
    .from('roleta_sessoes')
    .select('id, girou, premio_sorteado_id')
    .eq('id', sessaoId)
    .maybeSingle();
  if (errSessao) throw new Error(`registrarGiro/sessao: ${errSessao.message}`);
  if (!sessao) return { erro: 'sessao_invalida' };

  const premios = await listarPremios();

  if (sessao.girou && sessao.premio_sorteado_id) {
    const jaSorteado = premios.find((p) => p.id === sessao.premio_sorteado_id);
    if (jaSorteado) return { premio: jaSorteado, premios, repetido: true };
  }

  const premio = sortearPremio(premios);

  const { error } = await sb
    .from('roleta_sessoes')
    .update({ girou: true, girou_em: new Date().toISOString(), premio_sorteado_id: premio.id })
    .eq('id', sessaoId);
  if (error) throw new Error(`registrarGiro/update: ${error.message}`);

  return { premio, premios, repetido: false };
}

// ─── CLIENTE ─────────────────────────────────────────────────────────────────
// A busca usa `roleta_achar_cliente`, que casa por tel_chave (DDD + últimos 8
// dígitos) — a mesma chave que o resto do sistema usa, e a única imune à
// ambiguidade do nono dígito. Se o cliente já existe, reusamos a linha dele:
// o cupom precisa ficar pendurado no MESMO telefone que o agente consulta
// quando a mensagem chegar, senão o prêmio some sem erro nenhum.

const PLACEHOLDER_NOME = /^cliente\s+whatsapp/i;

async function acharOuCriarCliente(nome, telefoneEntrada) {
  const canonico = telefoneCanonico(telefoneEntrada);

  const { data: achados, error: errBusca } = await sb
    .rpc('roleta_achar_cliente', { p_telefone: telefoneEntrada });
  if (errBusca) throw new Error(`acharCliente: ${errBusca.message}`);
  const existente = achados?.[0] || null;

  const agora = new Date().toISOString();

  if (existente) {
    // Só a tag de origem. As tags de funil ('interessado', 'lead_frio',
    // 'cliente', 'cliente_fiel') são recalculadas pelo trigger
    // sincronizar_tags_cliente a partir de total_pedidos e de
    // demonstrou_interesse_em — mandar elas daqui seria duplicar a regra em
    // dois lugares, e um dos dois envelheceria.
    const tags = [...new Set([...(existente.tags || []), 'roleta'])];

    const patch = { tags, data_ultima_interacao: hojeSaoPaulo() };
    if (!existente.demonstrou_interesse_em) patch.demonstrou_interesse_em = agora;
    // Só sobrescreve o nome se o que está lá é placeholder do WhatsApp.
    // Cliente que já pediu antes tem nome de verdade — o do formulário pode
    // ser um apelido pior que o que já temos.
    if (nome && (!existente.nome || PLACEHOLDER_NOME.test(existente.nome))) patch.nome = nome;

    const { error } = await sb.from('clientes').update(patch).eq('id', existente.id);
    if (error) throw new Error(`atualizarCliente: ${error.message}`);

    return { id: existente.id, telefone: existente.telefone, novo: false };
  }

  const { data: criado, error } = await sb
    .from('clientes')
    .insert({
      nome,
      telefone: canonico,
      // 'interessado' e 'lead_frio' entram pelo trigger, não daqui.
      tags: ['roleta'],
      demonstrou_interesse_em: agora,
      data_ultima_interacao: hojeSaoPaulo(),
      total_pedidos: 0,
      total_gasto: 0,
    })
    .select('id, telefone')
    .single();
  if (error) throw new Error(`criarCliente: ${error.message}`);

  return { id: criado.id, telefone: criado.telefone, novo: true };
}

// ─── CUPOM ───────────────────────────────────────────────────────────────────
// tipo='brinde' + itens_permitidos é exatamente o formato que o agente de
// atendimento já consome. Nada muda naquele repositório.

async function criarCupomBrinde({ clienteId, premio }) {
  const validoAte = emDias(premio.validade_dias);

  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const codigo = gerarCodigo(premio.prefixo);
    const { data, error } = await sb
      .from('cupons')
      .insert({
        cliente_id: clienteId,
        codigo,
        tipo: 'brinde',
        descricao: premio.descricao,
        itens_permitidos: premio.itens_permitidos,
        desconto_percentual: 0,
        valido_ate: validoAte,
        usado: false,
      })
      .select('id, codigo, valido_ate')
      .single();

    if (!error) return data;
    if (error.code !== '23505') throw new Error(`criarCupom: ${error.message}`);
    // 23505 = código sorteado já existe. Tenta outro.
  }
  throw new Error('Não foi possível gerar um código único para o cupom.');
}

// ─── RESGATE (o ponto de captura) ────────────────────────────────────────────

async function buscarResgateExistente(variantes) {
  const { data, error } = await sb
    .from('roleta_funil')
    .select('codigo, premio, premio_descricao, valido_ate, status, telefone, nome')
    .in('telefone', variantes)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`buscarResgate: ${error.message}`);
  return data || null;
}

export async function resgatar({ sessaoId, nome, telefone, consentimento, origem, utmSource, utmCampaign, lote }) {
  const v = validarTelefoneBR(telefone);
  if (!v.ok) return { erro: 'telefone_invalido', mensagem: v.erro };
  if (!nome || nome.trim().length < 2) {
    return { erro: 'nome_invalido', mensagem: 'Digite seu nome.' };
  }
  if (!consentimento) {
    return { erro: 'sem_consentimento', mensagem: 'Precisamos do seu aceite para falar no WhatsApp.' };
  }

  const variantes = variantesTelefone(telefone);

  // Um giro por telefone. Quem já girou vê o código que já tem, não um erro
  // seco — se o cupom dele ainda vale, ele consegue usar; se expirou, ele
  // pelo menos entende o que aconteceu.
  const jaTem = await buscarResgateExistente(variantes);
  if (jaTem) return { repetido: true, ...jaTem };

  const { data: sessao, error: errSessao } = await sb
    .from('roleta_sessoes')
    .select('id, girou, premio_sorteado_id')
    .eq('id', sessaoId)
    .maybeSingle();
  if (errSessao) throw new Error(`resgatar/sessao: ${errSessao.message}`);
  if (!sessao || !sessao.girou || !sessao.premio_sorteado_id) {
    return { erro: 'sem_giro', mensagem: 'Gire a roleta antes de resgatar.' };
  }

  const premios = await listarPremios({ apenasAtivos: false });
  const premio = premios.find((p) => p.id === sessao.premio_sorteado_id);
  if (!premio) return { erro: 'premio_invalido', mensagem: 'Prêmio não encontrado.' };

  const cliente = await acharOuCriarCliente(nome.trim(), telefone);
  const cupom = await criarCupomBrinde({ clienteId: cliente.id, premio });

  const { error: errResgate } = await sb.from('roleta_resgates').insert({
    sessao_id: sessaoId,
    premio_id: premio.id,
    cliente_id: cliente.id,
    cupom_id: cupom.id,
    codigo: cupom.codigo,
    nome: nome.trim(),
    telefone: cliente.telefone,
    origem: origem || 'ifood',
    utm_source: utmSource || null,
    utm_campaign: utmCampaign || null,
    lote: lote || null,
    consentimento_lgpd: true,
  });

  if (errResgate) {
    // Corrida: dois envios do mesmo telefone ao mesmo tempo. O UNIQUE barrou
    // o segundo. Devolve o resgate que venceu em vez de estourar erro.
    if (errResgate.code === '23505') {
      const agora = await buscarResgateExistente(variantes);
      if (agora) return { repetido: true, ...agora };
    }
    throw new Error(`resgatar/insert: ${errResgate.message}`);
  }

  await sb.from('roleta_sessoes').update({ preencheu: true }).eq('id', sessaoId);

  return {
    repetido: false,
    codigo: cupom.codigo,
    premio: premio.nome,
    premio_descricao: premio.descricao,
    valido_ate: cupom.valido_ate,
    status: 'gerado',
    nome: nome.trim(),
  };
}

// Métrica 3 do funil. Gravada ANTES do redirect pro WhatsApp — depois o
// browser já saiu da página e a requisição morre pela metade.
export async function marcarCliqueWhatsapp(codigo) {
  const { error } = await sb
    .from('roleta_resgates')
    .update({ clicou_whatsapp: true, clicou_whatsapp_em: new Date().toISOString() })
    .eq('codigo', codigo)
    .eq('clicou_whatsapp', false);
  if (error) throw new Error(`marcarClique: ${error.message}`);
}
