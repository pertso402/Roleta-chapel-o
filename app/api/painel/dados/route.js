import { NextResponse } from 'next/server';
import { COOKIE, tokenValido } from '../../../../lib/painel-auth.js';
import { listarPremios, sb } from '../../../../lib/supabase.js';
import { VIDEO_DURACAO_SEG } from '../../../../lib/video.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function autorizado(req) {
  return tokenValido(req.cookies.get(COOKIE)?.value);
}

async function contar(tabela, filtros = (q) => q) {
  const { count, error } = await filtros(sb.from(tabela).select('id', { count: 'exact', head: true }));
  if (error) throw new Error(`${tabela}: ${error.message}`);
  return count || 0;
}

// ─── FUNIL DA VSL DO CONVÊNIO ────────────────────────────────────────────────
// Conta só quem VIU a oferta: prêmio de desconto ou cupom vencido nunca recebe
// a oferta, e entrar no denominador puxaria todas as taxas pra baixo.
//
// A retenção sai do ponto mais longe de cada pessoa: em cada marca de 5s, a
// fração dos que deram play que chegaram até ali. É onde a VSL perde gente.
async function funilDoVideo(desde) {
  const { data, error } = await sb
    .from('roleta_resgates')
    .select('video_oferta_em, video_play_em, video_max_seg, video_concluiu_em, clicou_whatsapp, clicou_convenio')
    .gte('created_at', desde)
    .not('video_oferta_em', 'is', null)
    .limit(5000);
  if (error) throw new Error(`video: ${error.message}`);

  const linhas = data || [];
  const play = linhas.filter((l) => l.video_play_em);
  const chegou = (seg) => play.filter((l) => l.video_max_seg >= seg).length;
  const concluiu = linhas.filter((l) => l.video_concluiu_em);
  const semPlay = linhas.filter((l) => !l.video_play_em);
  const zap = (ls) => ls.filter((l) => l.clicou_whatsapp).length;

  const retencao = [];
  for (let s = 0; s <= VIDEO_DURACAO_SEG; s += 5) retencao.push({ seg: s, pessoas: chegou(s) });

  return {
    duracao: VIDEO_DURACAO_SEG,
    oferta: linhas.length,
    play: play.length,
    p25: chegou(VIDEO_DURACAO_SEG * 0.25),
    p50: chegou(VIDEO_DURACAO_SEG * 0.5),
    p75: chegou(VIDEO_DURACAO_SEG * 0.75),
    concluiu: concluiu.length,
    convenio: linhas.filter((l) => l.clicou_convenio).length,
    // Efeito no funil principal: o vídeo não pode estar custando o WhatsApp.
    zap_concluiu: zap(concluiu),
    zap_sem_play: zap(semPlay),
    sem_play: semPlay.length,
    retencao,
  };
}

export async function GET(req) {
  if (!autorizado(req)) return NextResponse.json({ erro: 'nao_autorizado' }, { status: 401 });

  try {
    const url = new URL(req.url);
    const codigo = (url.searchParams.get('codigo') || '').trim().toUpperCase();
    const status = url.searchParams.get('status') || '';
    const dias = Math.min(Number(url.searchParams.get('dias')) || 30, 365);
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString();

    // ─── BUSCA POR CÓDIGO ───────────────────────────────────────────────────
    // A tela que o atendente usa no balcão. Vem primeiro e sai cedo: quando
    // ele está com o cliente na linha, nada mais na página importa.
    if (codigo) {
      const { data, error } = await sb
        .from('roleta_funil')
        .select('*')
        .ilike('codigo', codigo)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`busca: ${error.message}`);
      return NextResponse.json({ busca: data || null });
    }

    // ─── DENOMINADOR DAS QUATRO TAXAS ───────────────────────────────────────
    // Vem do relatório do iFood já importado no ERP, em vez de digitação
    // manual: um número digitado à mão envelhece e ninguém percebe.
    const { data: ifood } = await sb
      .from('ifood_relatorio')
      .select('pedidos, periodo_inicio, periodo_fim')
      .order('periodo_fim', { ascending: false })
      .limit(1)
      .maybeSingle();

    const [sessoes, giros, resgates, cliques] = await Promise.all([
      contar('roleta_sessoes',  (q) => q.gte('created_at', desde)),
      contar('roleta_sessoes',  (q) => q.gte('created_at', desde).eq('girou', true)),
      contar('roleta_resgates', (q) => q.gte('created_at', desde)),
      contar('roleta_resgates', (q) => q.gte('created_at', desde).eq('clicou_whatsapp', true)),
    ]);

    // Resgatado de verdade = cupom usado. A verdade mora em `cupons`, então
    // conta pela view em vez de por uma coluna espelhada que envelheceria.
    const { data: linhasStatus, error: errStatus } = await sb
      .from('roleta_funil')
      .select('status')
      .gte('created_at', desde);
    if (errStatus) throw new Error(`status: ${errStatus.message}`);
    const resgatados = (linhasStatus || []).filter((l) => l.status === 'resgatado').length;

    // ─── LISTAGEM ───────────────────────────────────────────────────────────
    let q = sb.from('roleta_funil').select('*').gte('created_at', desde)
      .order('created_at', { ascending: false }).limit(300);
    if (status) q = q.eq('status', status);
    const { data: leads, error: errLeads } = await q;
    if (errLeads) throw new Error(`leads: ${errLeads.message}`);

    const premios = await listarPremios({ apenasAtivos: false });
    const video = await funilDoVideo(desde);

    const ticket = (leads || [])
      .filter((l) => l.status === 'resgatado' && l.valor_pedido_resgate)
      .map((l) => Number(l.valor_pedido_resgate));
    const ticketMedio = ticket.length ? ticket.reduce((a, b) => a + b, 0) / ticket.length : null;

    return NextResponse.json({
      periodo_dias: dias,
      denominador: {
        pedidos_ifood: ifood?.pedidos ?? null,
        periodo_inicio: ifood?.periodo_inicio ?? null,
        periodo_fim: ifood?.periodo_fim ?? null,
      },
      funil: { sessoes, giros, resgates, cliques, resgatados },
      ticket_medio: ticketMedio,
      video,
      leads: leads || [],
      premios,
    });
  } catch (e) {
    console.error('[painel/dados]', e);
    return NextResponse.json({ erro: 'falha_interna' }, { status: 500 });
  }
}
