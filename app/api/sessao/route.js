import { NextResponse } from 'next/server';
import { buscarSessao, clienteDaSessao, criarSessao, excedeuLimite, faltandoConfig, hashIp, idDoPremioRaro, listarPremios, premioPublico } from '../../../lib/supabase.js';

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

    const raroId = idDoPremioRaro(premios);
    const publicos = premios.map((p) => premioPublico(p, raroId));

    // Recarregar a página não é um QR novo. Se o navegador já tem uma sessão
    // desta aba, ela é reaproveitada — assim a taxa 1 conta pessoas que
    // chegaram pelo adesivo, e não vezes que a página foi carregada.
    // Bônus antifraude: o prêmio fica preso à mesma sessão, então recarregar
    // não sorteia de novo.
    const existente = await buscarSessao(body.sessao_id);
    if (existente) {
      return NextResponse.json({
        sessao_id: existente.id, premios: publicos, reaproveitada: true,
        ja_conhecido: !!(await clienteDaSessao(existente.id)),
      });
    }

    const sessao = await criarSessao({
      origem: body.origem,
      utmSource: body.utm_source,
      utmCampaign: body.utm_campaign,
      lote: body.lote,
      refOfertaId: body.ref,
      ipHash,
      userAgent: req.headers.get('user-agent'),
    });

    // Diz pra página se já sabemos quem é a pessoa (veio da campanha, com ?r=).
    // Nesse caso ela pula o formulário: pedir nome e telefone de quem acabou de
    // responder nosso WhatsApp é atrito no pior momento possível.
    return NextResponse.json({
      sessao_id: sessao.id, premios: publicos,
      ja_conhecido: !!(await clienteDaSessao(sessao.id)),
    });
  } catch (e) {
    console.error('[sessao]', e);
    return NextResponse.json({ erro: 'falha_interna' }, { status: 500 });
  }
}
