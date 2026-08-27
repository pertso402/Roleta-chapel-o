import { randomInt } from 'node:crypto';

// ─── SORTEIO ─────────────────────────────────────────────────────────────────
// Roda SEMPRE no servidor. Se o sorteio fosse no browser, bastava abrir o
// DevTools e forçar o prêmio raro — e o cupom sai do mesmo jeito, porque quem
// emite é a API. O client só recebe o índice pronto e anima até ele.
//
// `randomInt` do crypto em vez de Math.random: além de ser sem viés de módulo,
// deixa explícito que isso é sorteio de valor real, não enfeite de animação.

// Peso é probabilidade RELATIVA: o denominador é a soma dos prêmios ativos.
// Desativar uma fatia no painel redistribui as outras sozinho, sem ninguém
// precisar recalcular percentual na mão.
export function sortearPremio(premios) {
  const elegiveis = premios.filter((p) => p.ativo && p.peso > 0);
  if (!elegiveis.length) throw new Error('Nenhum prêmio ativo configurado.');

  const total = elegiveis.reduce((s, p) => s + p.peso, 0);
  let ponto = randomInt(total); // 0 .. total-1

  for (const premio of elegiveis) {
    ponto -= premio.peso;
    if (ponto < 0) return premio;
  }

  return elegiveis[elegiveis.length - 1]; // inalcançável, rede de segurança
}

// ─── CÓDIGO DO CUPOM ─────────────────────────────────────────────────────────
// Formato BEB-4821. Vai pra mesma coluna `cupons.codigo` (UNIQUE) que já
// guarda os códigos do agente de recompra ("TOPA45") e do brinde de anúncio
// ("ANUNCIO-5544..."). Os três formatos não colidem entre si.
//
// O código existe pra o cliente ver e confiar, não pra ser digitado: o agente
// acha o cupom pelo telefone sozinho. Por isso 4 dígitos bastam — a colisão é
// tratada com retry no insert, e a coluna UNIQUE é a garantia final.
export function gerarCodigo(prefixo) {
  return `${prefixo}-${String(randomInt(1000, 10000))}`;
}

// ─── ÂNGULO FINAL DA ROLETA ──────────────────────────────────────────────────
// A roleta gira no sentido horário. Com a agulha fixa no topo (0°), o setor
// sob a agulha depois de girar `rot` graus é o que está em (360 - rot) na
// coordenada local da roda. Logo, pra parar no meio do setor `indice`:
//
//   rot ≡ 360 - (indice * fatia + fatia/2)   (mod 360)
//
// Consequência importante pra animação: conforme `rot` cresce, a agulha varre
// os índices em ordem DECRESCENTE. É por isso que o prêmio raro fica no maior
// índice — assim ele é cruzado logo antes das fatias mais prováveis.
export function anguloDoIndice(indice, totalFatias) {
  const fatia = 360 / totalFatias;
  return (360 - (indice * fatia + fatia / 2) + 360) % 360;
}
