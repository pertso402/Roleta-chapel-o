import { NextResponse } from 'next/server';
import { marcarCliqueWhatsapp } from '../../../lib/supabase.js';
import { linkWhatsapp } from '../../../lib/whatsapp.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Métrica 3 das quatro taxas. O client chama isto e SÓ DEPOIS navega pro
// wa.me — se navegasse antes, o browser abandonaria a requisição no meio e a
// taxa ficaria subestimada sem ninguém perceber.
//
// `convenio` é o botão de depois da VSL: conta como clique no WhatsApp E como
// interesse no convênio, e troca a mensagem pronta.
export async function POST(req) {
  const { codigo, convenio } = await req.json().catch(() => ({}));
  if (!codigo) return NextResponse.json({ erro: 'codigo_ausente' }, { status: 400 });
  const url = linkWhatsapp(codigo, undefined, { convenio: convenio === true });

  try {
    await marcarCliqueWhatsapp(codigo, { convenio: convenio === true });
    return NextResponse.json({ ok: true, url });
  } catch (e) {
    console.error('[whatsapp-click]', e);
    // Nunca bloqueia o cliente: perder a métrica é ruim, travar o resgate é
    // pior. Devolve o link mesmo quando a gravação falhou.
    return NextResponse.json({ ok: false, url });
  }
}
