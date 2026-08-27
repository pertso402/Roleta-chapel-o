import { NextResponse } from 'next/server';
import { COOKIE, tokenValido } from '../../../../lib/painel-auth.js';
import { sb } from '../../../../lib/supabase.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Só peso, ativo e os textos. `itens_permitidos` fica fora de propósito: um
// nome digitado errado ali não dá erro nenhum — o agente simplesmente recusa
// a cortesia em silêncio e o cliente fica sem o prêmio. Mudança de item é
// alteração de catálogo, feita com quem sabe conferir contra `produtos`.
export async function PATCH(req) {
  if (!tokenValido(req.cookies.get(COOKIE)?.value)) {
    return NextResponse.json({ erro: 'nao_autorizado' }, { status: 401 });
  }

  try {
    const { id, peso, ativo, nome, descricao, validade_dias } = await req.json();
    if (!id) return NextResponse.json({ erro: 'id_ausente' }, { status: 400 });

    const patch = {};
    if (peso !== undefined) {
      const p = Number(peso);
      if (!Number.isInteger(p) || p < 0) {
        return NextResponse.json({ erro: 'peso_invalido' }, { status: 400 });
      }
      patch.peso = p;
    }
    if (ativo !== undefined) patch.ativo = Boolean(ativo);
    if (nome) patch.nome = String(nome).slice(0, 60);
    if (descricao) patch.descricao = String(descricao).slice(0, 240);
    if (validade_dias !== undefined) {
      const d = Number(validade_dias);
      if (!Number.isInteger(d) || d < 1 || d > 90) {
        return NextResponse.json({ erro: 'validade_invalida' }, { status: 400 });
      }
      patch.validade_dias = d;
    }

    if (!Object.keys(patch).length) return NextResponse.json({ erro: 'nada_a_mudar' }, { status: 400 });

    const { error } = await sb.from('roleta_premios').update(patch).eq('id', id);
    if (error) throw new Error(error.message);

    // Nunca deixar a roleta sem fatia ativa: sem isso o giro estoura 503 e a
    // landing quebra pra quem escanear o adesivo nesse meio-tempo.
    const { count } = await sb
      .from('roleta_premios')
      .select('id', { count: 'exact', head: true })
      .eq('ativo', true)
      .gt('peso', 0);

    if (!count) {
      await sb.from('roleta_premios').update({ ativo: true }).eq('id', id);
      return NextResponse.json({ erro: 'ultima_fatia', mensagem: 'A roleta precisa de pelo menos um prêmio ativo.' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[painel/premio]', e);
    return NextResponse.json({ erro: 'falha_interna' }, { status: 500 });
  }
}
