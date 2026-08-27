import { NextResponse } from 'next/server';
import { excedeuLimite, hashIp, resgatar } from '../../../lib/supabase.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function ipDaRequisicao(req) {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip') || '').trim();
}

// Ponto de captura: cria/atualiza o cliente e emite o cupom de brinde.
// A partir daqui o lead já é visível pros dois agentes, sem nenhum passo extra.
export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}));
    const ipHash = hashIp(ipDaRequisicao(req));

    // Mais apertado que o de sessão: aqui nasce cupom de valor real.
    if (await excedeuLimite(ipHash, { tabela: 'roleta_sessoes', limite: 40, janelaMin: 60 })) {
      return NextResponse.json({ erro: 'muitas_tentativas' }, { status: 429 });
    }

    const r = await resgatar({
      sessaoId: body.sessao_id,
      nome: body.nome,
      telefone: body.telefone,
      consentimento: body.consentimento === true,
      origem: body.origem,
      utmSource: body.utm_source,
      utmCampaign: body.utm_campaign,
      lote: body.lote,
    });

    if (r.erro) return NextResponse.json(r, { status: 400 });
    return NextResponse.json(r);
  } catch (e) {
    console.error('[resgatar]', e);
    return NextResponse.json({ erro: 'falha_interna' }, { status: 500 });
  }
}
