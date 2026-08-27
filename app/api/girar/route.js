import { NextResponse } from 'next/server';
import { registrarGiro } from '../../../lib/supabase.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Sorteia no servidor e devolve só o ÍNDICE da fatia pra animação parar nela.
// O browser nunca decide o prêmio — ele só descobre onde a agulha para.
export async function POST(req) {
  try {
    const { sessao_id } = await req.json().catch(() => ({}));
    if (!sessao_id) return NextResponse.json({ erro: 'sessao_ausente' }, { status: 400 });

    const { premio, premios, erro } = await registrarGiro(sessao_id);
    if (erro) return NextResponse.json({ erro }, { status: 400 });

    const indice = premios.findIndex((p) => p.id === premio.id);

    return NextResponse.json({
      indice,
      total_fatias: premios.length,
      premio: { id: premio.id, nome: premio.nome, descricao: premio.descricao, cor: premio.cor },
    });
  } catch (e) {
    console.error('[girar]', e);
    return NextResponse.json({ erro: 'falha_interna' }, { status: 500 });
  }
}
