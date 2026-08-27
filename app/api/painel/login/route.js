import { NextResponse } from 'next/server';
import { COOKIE, criarToken, senhaConfere } from '../../../../lib/painel-auth.js';
import { excedeuLimite, hashIp, registrarTentativaLogin } from '../../../../lib/supabase.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// A senha do painel é curta (4 dígitos) e o que ela protege é lista de nome e
// telefone de cliente. Sem trava, dava pra varrer as 10.000 combinações em
// poucas horas. 8 tentativas a cada 15 min por IP transforma isso em semanas —
// e quem sabe a senha nunca esbarra no limite.
const MAX_TENTATIVAS = 8;
const JANELA_MIN = 15;

function ipDaRequisicao(req) {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0] : req.headers.get('x-real-ip') || '').trim();
}

export async function POST(req) {
  try {
    const { senha } = await req.json().catch(() => ({}));
    const ipHash = hashIp(ipDaRequisicao(req));

    const bloqueado = await excedeuLimite(ipHash, {
      tabela: 'roleta_painel_tentativas',
      limite: MAX_TENTATIVAS,
      janelaMin: JANELA_MIN,
    });
    if (bloqueado) {
      return NextResponse.json(
        { erro: 'muitas_tentativas', mensagem: `Muitas tentativas. Espere ${JANELA_MIN} minutos.` },
        { status: 429 },
      );
    }

    if (!senhaConfere(senha)) {
      // Só a tentativa ERRADA é registrada: quem acerta não gasta cota, então
      // o atendente que entra e sai o dia todo nunca se tranca sozinho.
      await registrarTentativaLogin(ipHash);
      // Atraso curto: encarece a força bruta sem irritar quem só errou a senha.
      await new Promise((r) => setTimeout(r, 700));
      return NextResponse.json({ erro: 'senha_invalida' }, { status: 401 });
    }

    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE, criarToken(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 12 * 3600,
    });
    return res;
  } catch (e) {
    console.error('[painel/login]', e);
    return NextResponse.json({ erro: 'falha_interna' }, { status: 500 });
  }
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
