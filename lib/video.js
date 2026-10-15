import { createHmac, timingSafeEqual } from 'node:crypto';

// ─── VSL DO CONVÊNIO ─────────────────────────────────────────────────────────
// Quem assiste o vídeo até o fim tem o prêmio dobrado. O arquivo mora em
// public/ e não no YouTube: lá não dá pra impedir de pular pro fim, o player
// sugere outro vídeo no meio da oferta e cada evento depende da API deles.

export const VIDEO_URL = '/vsl-convenio.mp4';
export const VIDEO_DURACAO_SEG = 83;

// O servidor só dobra se passou esse tempo de RELÓGIO desde o play. É a trava
// que vale de verdade: o player não deixa avançar, mas o player roda no
// celular de quem quer o prêmio. Fica abaixo dos 83s porque o play é gravado
// depois de o vídeo começar e a rede atrasa — margem pra não negar o dobro a
// quem assistiu tudo. Pausar só aumenta o tempo, então nunca atrapalha.
export const VIDEO_MIN_SEG = 75;

// O código do cupom tem 4 dígitos (COC-4821): dá pra chutar. Sem este token
// qualquer pessoa dobraria o prêmio dos outros chamando a API com códigos
// aleatórios. O token sai junto com o resgate, só pra quem preencheu.
function segredo() {
  return process.env.IP_SALT || process.env.SUPABASE_SERVICE_KEY || '';
}

export function tokenVideo(codigo) {
  return createHmac('sha256', segredo()).update(`video:${codigo}`).digest('hex').slice(0, 32);
}

export function tokenConfere(codigo, token) {
  if (!codigo || !token) return false;
  const a = Buffer.from(String(token));
  const b = Buffer.from(tokenVideo(codigo));
  return a.length === b.length && timingSafeEqual(a, b);
}
