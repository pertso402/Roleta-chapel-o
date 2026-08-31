import { NextResponse } from 'next/server';
import { marcarCliqueWhatsapp } from '../../../lib/supabase.js';
import { linkWhatsapp } from '../../../lib/whatsapp.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
