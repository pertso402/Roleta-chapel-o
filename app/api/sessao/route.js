import { NextResponse } from 'next/server';
import { criarSessao, excedeuLimite, hashIp, idDoPremioRaro, listarPremios, premioPublico } from '../../../lib/supabase.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ipDaRequisicao(req) {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip') || '').trim();
}

// Abre a sessão e devolve as fatias. É a métrica 1 do funil ("escaneou"):
// uma linha aqui = um QR lido, mesmo que a pessoa nunca gire.
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const ipHash = hashIp(ipDaRequisicao(req));

    // Limite folgado: só existe pra barrar script, não gente.
    if (await excedeuLimite(ipHash, { tabela: 'roleta_sessoes', limite: 40, janelaMin: 60 })) {
      return NextResponse.json({ erro: 'muitas_tentativas' }, { status: 429 });
    }

    const premios = await listarPremios();
    if (!premios.length) {
      return NextResponse.json({ erro: 'sem_premios' }, { status: 503 });
    }

    const sessao = await criarSessao({
      origem: body.origem,
      utmSource: body.utm_source,
      utmCampaign: body.utm_campaign,
      lote: body.lote,
      ipHash,
      userAgent: req.headers.get('user-agent'),
    });

    const raroId = idDoPremioRaro(premios);
    return NextResponse.json({
      sessao_id: sessao.id,
      premios: premios.map((p) => premioPublico(p, raroId)),
    });
  } catch (e) {
    console.error('[sessao]', e);
    return NextResponse.json({ erro: 'falha_interna' }, { status: 500 });
  }
}
