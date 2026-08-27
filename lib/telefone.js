// ─── NORMALIZAÇÃO DE TELEFONE ────────────────────────────────────────────────
// Este arquivo é o ponto mais delicado do projeto inteiro.
//
// O agente de atendimento acha o cupom do cliente por `clientes.telefone`,
// e esse valor vem do JID do WhatsApp (via Evolution), não de um formulário.
// O WhatsApp no Brasil usa uma convenção própria: para DDD >= 31 o nono
// dígito do celular é OMITIDO no JID. Confere com o banco atual:
//
//   DDD 44 (Umuarama) → 12 dígitos → 498 clientes   ex: 554499999999
//   DDD 11 / 19 / 22  → 13 dígitos →  22 clientes   ex: 5511953418099
//
// O cliente digita "(44) 99999-9999" — 11 dígitos, COM o nove. Se a roleta
// gravasse isso com o 55 na frente (13 dígitos), o cupom ficaria pendurado
// num telefone que o agente nunca consulta: o prêmio simplesmente não
// apareceria na conversa, e ninguém descobriria o motivo.

// Faixa em que o WhatsApp mantém o nono dígito no JID.
const DDD_MANTEM_NONO_DIGITO = 30;

const DDDS_VALIDOS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

// Tira tudo que não é dígito e remove o DDI se o usuário digitou.
function soDigitos(entrada) {
  return String(entrada || '').replace(/\D/g, '');
}

// Valida o que veio do formulário: 10 (fixo) ou 11 (celular) dígitos, DDD real.
// Retorna { ok, erro, ddd, local } com `local` já sem o DDD.
export function validarTelefoneBR(entrada) {
  let d = soDigitos(entrada);

  // Aceita quem colou o número com o 55 na frente.
  if (d.length > 11 && d.startsWith('55')) d = d.slice(2);

  if (d.length !== 10 && d.length !== 11) {
    return { ok: false, erro: 'Digite o número com DDD, tipo (44) 99999-9999.' };
  }

  const ddd = Number(d.slice(0, 2));
  if (!DDDS_VALIDOS.has(ddd)) {
    return { ok: false, erro: `DDD ${d.slice(0, 2)} não existe. Confere o número?` };
  }

  const local = d.slice(2);

  // Celular de 11 dígitos tem que começar com 9. Sem essa checagem, um
  // "(44) 12345-6789" passaria e viraria lead morto no banco.
  if (local.length === 9 && !local.startsWith('9')) {
    return { ok: false, erro: 'Número de celular inválido. Confere o número?' };
  }

  return { ok: true, ddd, local };
}

// Gera as DUAS grafias possíveis do mesmo número: com e sem o nono dígito.
// Usada pra procurar o cliente no banco sem depender de adivinhar qual
// formato o WhatsApp usou pra ele no passado.
export function variantesTelefone(entrada) {
  const v = validarTelefoneBR(entrada);
  if (!v.ok) return [];

  const { ddd, local } = v;
  const prefixo = `55${ddd}`;
  const set = new Set();

  if (local.length === 9) {
    set.add(`${prefixo}${local}`);          // 13 dígitos, com o nove
    set.add(`${prefixo}${local.slice(1)}`); // 12 dígitos, sem o nove
  } else {
    set.add(`${prefixo}${local}`);          // 12 dígitos (fixo ou já sem o nove)
    set.add(`${prefixo}9${local}`);         // 13 dígitos, supondo celular
  }

  return [...set];
}

// A grafia que o WhatsApp provavelmente vai usar — é ela que vira o registro
// novo quando o cliente ainda não existe no banco.
export function telefoneCanonico(entrada) {
  const v = validarTelefoneBR(entrada);
  if (!v.ok) return null;

  const { ddd, local } = v;
  const mantemNove = ddd <= DDD_MANTEM_NONO_DIGITO;

  if (local.length === 9 && !mantemNove) {
    return `55${ddd}${local.slice(1)}`; // DDD >= 31: o JID não leva o nove
  }
  if (local.length === 8 && mantemNove) {
    return `55${ddd}9${local}`;         // DDD <= 30: o JID leva o nove
  }
  return `55${ddd}${local}`;
}

// Formata pra exibição: (44) 99999-9999
//
// Precisa DESFAZER a omissão do nono dígito, não só pontuar o que está no
// banco. O telefone guardado é o JID (554491234567); exibir isso como
// "(44) 9123-4567" mostraria um número com um dígito a menos, e quem
// copiasse do painel pra discar cairia em lugar nenhum.
//
// Como distinguir: celular antigo de 8 dígitos começa em 6–9, fixo começa
// em 2–5. Então local de 8 dígitos começando em 6–9 é celular sem o nove.
export function formatarTelefone(entrada) {
  const d = soDigitos(entrada).replace(/^55/, '');

  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;

  if (d.length === 10) {
    const ddd = d.slice(0, 2);
    const local = d.slice(2);
    if (/^[6-9]/.test(local)) return `(${ddd}) 9${local.slice(0, 4)}-${local.slice(4)}`;
    return `(${ddd}) ${local.slice(0, 4)}-${local.slice(4)}`;
  }

  return entrada;
}

// Máscara progressiva pro input do formulário (usada no client).
export function mascararTelefone(entrada) {
  const d = soDigitos(entrada).slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
