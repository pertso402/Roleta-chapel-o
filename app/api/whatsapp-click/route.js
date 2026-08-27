import { NextResponse } from 'next/server';
import { marcarCliqueWhatsapp } from '../../../lib/supabase.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Montado no servidor pra o número sair de variável de ambiente, e não do
// bundle: trocar o WhatsApp da loja não exige rebuild da landing.
function linkWhatsapp(codigo) {
  const numero = (process.env.WHATSAPP_NUMERO || '').replace(/\D/g, '');
  const texto = `Olá! Quero resgatar meu prêmio: ${codigo}`;
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

// Métrica 3 das quatro taxas. O client chama isto e SÓ DEPOIS navega pro
// wa.me — se navegasse antes, o browser abandonaria a requisição no meio e a
// taxa ficaria subestimada sem ninguém perceber.
export async function POST(req) {
  const { codigo } = await req.json().catch(() => ({}));
  if (!codigo) return NextResponse.json({ erro: 'codigo_ausente' }, { status: 400 });

  try {
    await marcarCliqueWhatsapp(codigo);
    return NextResponse.json({ ok: true, url: linkWhatsapp(codigo) });
  } catch (e) {
    console.error('[whatsapp-click]', e);
    // Nunca bloqueia o cliente: perder a métrica é ruim, travar o resgate é
    // pior. Devolve o link mesmo quando a gravação falhou.
    return NextResponse.json({ ok: false, url: linkWhatsapp(codigo) });
  }
}
