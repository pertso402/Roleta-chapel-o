import { NextResponse } from 'next/server';
import { concluirVideo, registrarEventoVideo } from '../../../lib/supabase.js';
import { tokenConfere } from '../../../lib/video.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Funil da VSL do convênio. Um endpoint só pra todos os eventos, porque o
// client também manda por sendBeacon ao sair da página — e beacon é sempre
// POST pro mesmo lugar, sem chance de tratar resposta.
//
//   oferta    → a pessoa viu a oferta de dobrar
//   play      → deu play pela primeira vez
//   progresso → ponto mais longe assistido (a cada 5s e ao sair)
//   concluir  → terminou; o servidor confere o tempo e dobra o prêmio
export async function POST(req) {
  // sendBeacon manda o corpo como texto; req.json() lê igual.
  const body = await req.json().catch(() => ({}));
  const { codigo, token, evento, segundo } = body;

  if (!tokenConfere(codigo, token)) {
    return NextResponse.json({ erro: 'nao_autorizado' }, { status: 401 });
  }

  try {
    if (evento === 'concluir') {
      const r = await concluirVideo(codigo);
      return NextResponse.json(r, { status: r.erro ? 409 : 200 });
    }
    const r = await registrarEventoVideo(codigo, evento, segundo);
    return NextResponse.json(r, { status: r.erro ? 400 : 200 });
  } catch (e) {
    console.error('[video]', e);
    return NextResponse.json({ erro: 'falha_interna' }, { status: 500 });
  }
}
