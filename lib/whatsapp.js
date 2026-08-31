// ─── NÚMERO DO WHATSAPP ──────────────────────────────────────────────────────
// O último passo do funil inteiro é um link wa.me. Se o número estiver
// errado, tudo que veio antes — adesivo impresso, QR lido, roleta girada,
// telefone entregue — não serve pra nada.
//
// Isso já aconteceu em produção: a variável foi cadastrada como
// "4437711475", sem o 55, e o link virou wa.me/4437711475, que o WhatsApp
// recusa. Duas clientes reais (Valdenira e Carol) clicaram e bateram numa
// tela de erro antes de alguém perceber.
//
// Por isso o número passa por aqui em vez de ir cru pro link: quem cadastra
// digita o telefone do jeito que conhece, e o código completa o DDI.

const DDI = '55';

// Faixa em que o WhatsApp mantém o nono dígito. Mesma regra de lib/telefone.js
// — aqui de novo porque este arquivo trata do número DA LOJA, que pode ser
// fixo, enquanto lá trata do número do cliente.
const DDD_MANTEM_NONO_DIGITO = 30;

export function normalizarWhatsapp(entrada) {
  const d = String(entrada || '').replace(/\D/g, '');
  if (!d) return { ok: false, motivo: 'vazio' };

  // 10 ou 11 dígitos = veio sem o DDI. É o erro clássico: a pessoa cadastra
  // o telefone como fala ("44 3771-1475") e o 55 fica de fora.
  if (d.length === 10 || d.length === 11) {
    return { ok: true, numero: DDI + d, corrigido: 'faltava o DDI 55' };
  }

  if ((d.length === 12 || d.length === 13) && d.startsWith(DDI)) {
    return { ok: true, numero: d };
  }

  // Número com DDI de outro país passa direto — não cabe a este código
  // decidir que só existe Brasil.
  if (d.length >= 11 && d.length <= 15 && !d.startsWith(DDI)) {
    return { ok: true, numero: d, aviso: 'não começa com 55; conferir se é internacional' };
  }

  return { ok: false, motivo: `${d.length} dígitos não formam um número válido` };
}

// Diz se o número é de celular ou de fixo. Importa porque o WhatsApp Business
// aceita fixo, mas só depois de verificação por ligação — e um fixo que nunca
// foi verificado devolve "número inválido" no wa.me exatamente como um número
// errado devolveria, o que torna o problema difícil de diagnosticar.
export function pareceCelular(numero) {
  const d = String(numero || '').replace(/\D/g, '').replace(/^55/, '');
  if (d.length < 10) return null;
  const ddd = Number(d.slice(0, 2));
  const local = d.slice(2);
  if (local.length === 9) return true;
  if (ddd > DDD_MANTEM_NONO_DIGITO && local.length === 8) return /^[6-9]/.test(local);
  return /^9/.test(local);
}

export function linkWhatsapp(codigo, bruto = process.env.WHATSAPP_NUMERO) {
  const n = normalizarWhatsapp(bruto);
  if (!n.ok) return null;
  const texto = `Olá! Quero resgatar meu prêmio: ${codigo}`;
  return `https://wa.me/${n.numero}?text=${encodeURIComponent(texto)}`;
}
