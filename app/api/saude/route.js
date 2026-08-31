import { NextResponse } from 'next/server';
import { faltandoConfig, sb } from '../../../lib/supabase.js';
import { normalizarWhatsapp, pareceCelular } from '../../../lib/whatsapp.js';

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

    // Estas não impedem a roleta de rodar, então não podem derrubar o deploy.
    // Mas as duas degradam CALADAS, que é pior que quebrar: ninguém percebe.
    const avisos = [];

    if ((count ?? 0) === 0) {
      avisos.push('Nenhum prêmio ativo: a roleta não tem fatia pra sortear.');
    }
    if (!process.env.IP_SALT) {
      avisos.push(
        'IP_SALT não definida. O rate limit continua funcionando, mas o hash '
        + 'do IP fica sem sal — e SHA-256 de IPv4 sem sal se reverte por força '
        + 'bruta em segundos. Na prática o banco passa a guardar o IP de forma '
        + 'reversível, que é justamente o que o hash existia pra evitar (LGPD).',
      );
    }
    if (!process.env.PAINEL_SENHA) {
      avisos.push('PAINEL_SENHA não definida: o login de /painel vai dar erro 500.');
    }
    // O número da loja merece checagem própria: "ok (10 caracteres)" não
    // dizia que o link estava quebrado, e foi assim que duas clientes reais
    // clicaram em "Resgatar no WhatsApp" e caíram em número inválido.
    const wpp = normalizarWhatsapp(process.env.WHATSAPP_NUMERO);
    if (!wpp.ok) {
      avisos.push(`WHATSAPP_NUMERO inválido (${wpp.motivo}): o botão de resgate não abre conversa.`);
    } else {
      if (wpp.corrigido) {
        avisos.push(`WHATSAPP_NUMERO estava sem o DDI e foi corrigido para ${wpp.numero}. Vale arrumar na Vercel pra não depender da correção.`);
      }
      if (wpp.aviso) avisos.push(`WHATSAPP_NUMERO: ${wpp.aviso}.`);
      if (pareceCelular(wpp.numero) === false) {
        avisos.push(`${wpp.numero} parece ser um telefone FIXO. O WhatsApp Business aceita fixo, mas só depois de verificação por ligação — se a linha não estiver registrada, o wa.me responde "número inválido". Teste abrindo https://wa.me/${wpp.numero} num celular.`);
      }
    }

    return NextResponse.json({
      ok: true,
      banco: 'conectado',
      premios_ativos: count ?? 0,
      variaveis,
      avisos: avisos.length ? avisos : undefined,
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
