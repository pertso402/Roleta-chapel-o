import { createHmac, timingSafeEqual } from 'node:crypto';

// ─── AUTENTICAÇÃO DO PAINEL ──────────────────────────────────────────────────
// Senha única, como a spec pediu. Não é login por usuário: quem usa isso é o
// atendente no balcão e o dono, e criar tabela de usuário aqui seria peso sem
// retorno — o ERP já tem `profiles` pra quando isso precisar de verdade.
//
// O cookie guarda um token assinado com HMAC, nunca a senha. Assim um cookie
// vazado não revela a senha, e expira sozinho.

const VALIDADE_H = 12;

function segredo() {
  const s = process.env.PAINEL_SENHA;
  if (!s) throw new Error('PAINEL_SENHA não configurada.');
  return s;
}

function assinar(exp) {
  return createHmac('sha256', segredo()).update(String(exp)).digest('hex');
}

// Comparação em tempo constante: comparar com === vaza, pelo tempo de resposta,
// quantos caracteres iniciais bateram.
function igual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function senhaConfere(tentativa) {
  if (!tentativa) return false;
  return igual(tentativa, segredo());
}

export function criarToken() {
  const exp = Date.now() + VALIDADE_H * 3_600_000;
  return `${exp}.${assinar(exp)}`;
}

export function tokenValido(token) {
  if (!token || !token.includes('.')) return false;
  const [exp, mac] = token.split('.');
  if (!exp || !mac) return false;
  if (Number(exp) < Date.now()) return false;
  try {
    return igual(mac, assinar(exp));
  } catch {
    return false;
  }
}

export const COOKIE = 'roleta_painel';
