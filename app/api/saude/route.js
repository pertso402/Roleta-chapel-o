import { NextResponse } from 'next/server';
import { faltandoConfig, sb } from '../../../lib/supabase.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── DIAGNÓSTICO ─────────────────────────────────────────────────────────────
// Abra /api/saude no navegador e a resposta diz, em uma olhada, por que a
// roleta não está carregando.
//
// Existe porque o modo de falha mais provável desta aplicação não é bug de
// código: é variável de ambiente faltando ou não aplicada. E o sintoma disso
// na landing — "não consegui carregar a roleta" — não distingue entre chave
// errada, banco fora do ar e internet do cliente ruim.
//
// NUNCA devolve valor de variável. Só se existe e o tamanho, que é o
// suficiente pra flagrar o erro clássico de colar a chave pela metade.
function descrever(nome) {
  const v = process.env[nome];
  if (!v) return 'FALTANDO';
  return `ok (${v.length} caracteres)`;
}

export async function GET() {
  const faltando = faltandoConfig();

  const variaveis = {
    SUPABASE_URL: descrever('SUPABASE_URL'),
    SUPABASE_SERVICE_KEY: descrever('SUPABASE_SERVICE_KEY'),
    WHATSAPP_NUMERO: descrever('WHATSAPP_NUMERO'),
    PAINEL_SENHA: descrever('PAINEL_SENHA'),
    IP_SALT: descrever('IP_SALT'),
  };

  if (faltando.length) {
    return NextResponse.json({
      ok: false,
      problema: 'Variáveis de ambiente faltando neste deploy.',
      faltando,
      variaveis,
      como_resolver: [
        'Vercel → Settings → Environment Variables: cadastre as que estão FALTANDO.',
        'Marque os três ambientes (Production, Preview, Development).',
        'Variável nova NÃO entra em deploy que já existe: vá em Deployments e use Redeploy.',
      ],
    }, { status: 503 });
  }

  // Consulta mais barata possível que ainda prova que a chave é válida e que
  // o service_role está passando por cima do RLS.
  try {
    const { count, error } = await sb
      .from('roleta_premios')
      .select('id', { count: 'exact', head: true })
      .eq('ativo', true);

    if (error) {
      return NextResponse.json({
        ok: false,
        problema: 'As variáveis existem, mas o Supabase recusou a consulta.',
        detalhe: error.message,
        variaveis,
        como_resolver: [
          'Confira se a SUPABASE_SERVICE_KEY é a service_role (não a anon).',
          'Confira se a chave foi colada inteira — ela é longa e quebra fácil.',
          'Confira se a SUPABASE_URL é do projeto qlswjefuinhbtlhauhgj.',
        ],
      }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      banco: 'conectado',
      premios_ativos: count ?? 0,
      variaveis,
      aviso: (count ?? 0) === 0
        ? 'Nenhum prêmio ativo: a roleta não tem fatia pra sortear.'
        : undefined,
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      problema: 'Falha ao falar com o Supabase.',
      detalhe: String(e?.message || e).slice(0, 300),
      variaveis,
    }, { status: 502 });
  }
}
