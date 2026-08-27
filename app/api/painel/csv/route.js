import { NextResponse } from 'next/server';
import { COOKIE, tokenValido } from '../../../../lib/painel-auth.js';
import { sb } from '../../../../lib/supabase.js';
import { formatarTelefone } from '../../../../lib/telefone.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Campo entre aspas e aspas internas duplicadas: nome com vírgula ("Ana, a
// da esquina") quebraria a coluna no Excel sem isso.
function campo(v) {
  if (v === null || v === undefined) return '';
  return `"${String(v).replace(/"/g, '""')}"`;
}

export async function GET(req) {
  if (!tokenValido(req.cookies.get(COOKIE)?.value)) {
    return NextResponse.json({ erro: 'nao_autorizado' }, { status: 401 });
  }

  try {
    const dias = Math.min(Number(new URL(req.url).searchParams.get('dias')) || 30, 365);
    const desde = new Date(Date.now() - dias * 86_400_000).toISOString();

    const { data, error } = await sb
      .from('roleta_funil')
      .select('*')
      .gte('created_at', desde)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    const cabecalho = ['codigo', 'nome', 'telefone', 'premio', 'status', 'valido_ate',
      'clicou_whatsapp', 'origem', 'lote', 'total_pedidos', 'valor_pedido', 'criado_em'];

    const linhas = (data || []).map((l) => [
      l.codigo, l.nome, formatarTelefone(l.telefone), l.premio, l.status, l.valido_ate,
      l.clicou_whatsapp ? 'sim' : 'nao', l.origem, l.lote, l.total_pedidos,
      l.valor_pedido_resgate, l.created_at,
    ].map(campo).join(';'));

    // BOM + ponto-e-vírgula: é o que o Excel em português abre sem pedir
    // importação e sem quebrar os acentos.
    const csv = `﻿${cabecalho.join(';')}\n${linhas.join('\n')}`;

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="roleta-chapelao-${dias}d.csv"`,
      },
    });
  } catch (e) {
    console.error('[painel/csv]', e);
    return NextResponse.json({ erro: 'falha_interna' }, { status: 500 });
  }
}
