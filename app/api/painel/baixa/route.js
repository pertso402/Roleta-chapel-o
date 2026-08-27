import { NextResponse } from 'next/server';
import { COOKIE, tokenValido } from '../../../../lib/painel-auth.js';
import { sb } from '../../../../lib/supabase.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Baixa MANUAL do cupom — a exceção, não a regra.
//
// No caminho normal ninguém aperta este botão: quando o pedido fecha pelo
// agente de atendimento, ele mesmo chama darBaixaCupom() e grava o pedido_id,
// que é de onde sai o valor do pedido na métrica. Isto aqui existe pro caso
// de o cliente resgatar por fora do agente (balcão, telefone) — aí o cupom
// precisa sair de circulação de algum jeito, senão ele fica valendo.
//
// Por isso não há campo de valor do pedido: sem pedido no ERP não existe
// valor pra registrar, e inventar um sujaria o ticket médio da métrica.
export async function POST(req) {
  if (!tokenValido(req.cookies.get(COOKIE)?.value)) {
    return NextResponse.json({ erro: 'nao_autorizado' }, { status: 401 });
  }

  try {
    const { codigo } = await req.json().catch(() => ({}));
    if (!codigo) return NextResponse.json({ erro: 'codigo_ausente' }, { status: 400 });

    const { data: resgate, error: errBusca } = await sb
      .from('roleta_resgates')
      .select('cupom_id')
      .ilike('codigo', String(codigo).trim())
      .maybeSingle();
    if (errBusca) throw new Error(errBusca.message);
    if (!resgate) return NextResponse.json({ erro: 'nao_encontrado' }, { status: 404 });

    // `.eq('usado', false)` evita dar baixa duas vezes numa corrida entre o
    // atendente e o agente fechando o pedido ao mesmo tempo.
    const { error } = await sb
      .from('cupons')
      .update({ usado: true })
      .eq('id', resgate.cupom_id)
      .eq('usado', false);
    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[painel/baixa]', e);
    return NextResponse.json({ erro: 'falha_interna' }, { status: 500 });
  }
}
