import { NextResponse } from 'next/server';
import { COOKIE, tokenValido } from '../../../../lib/painel-auth.js';
import { listarPremios, sb } from '../../../../lib/supabase.js';

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
      leads: leads || [],
      premios,
    });
  } catch (e) {
    console.error('[painel/dados]', e);
    return NextResponse.json({ erro: 'falha_interna' }, { status: 500 });
  }
}
