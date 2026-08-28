import { NextResponse } from 'next/server';
import { criarSessao, excedeuLimite, faltandoConfig, hashIp, idDoPremioRaro, listarPremios, premioPublico } from '../../../lib/supabase.js';

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
    // Checa a configuração ANTES de tocar no banco. Sem isso o erro sairia
    // como "falha_interna" genérico, e a causa mais provável de a roleta não
    // abrir — variável de ambiente faltando no deploy — ficaria escondida
    // atrás da mesma mensagem de um erro de rede qualquer.
    const faltando = faltandoConfig();
    if (faltando.length) {
      console.error('[sessao] variáveis de ambiente faltando:', faltando.join(', '));
      return NextResponse.json(
        { erro: 'config_ausente', faltando, veja: '/api/saude' },
        { status: 503 },
      );
    }

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
