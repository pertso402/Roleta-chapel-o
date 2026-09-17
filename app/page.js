'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { mascararTelefone } from '../lib/telefone.js';

// ─── PEÇAS DE MARCA ──────────────────────────────────────────────────────────
// Tudo SVG inline: some do caminho crítico uma requisição por peça, e sai
// nítido em qualquer densidade de tela. O alvo é first paint abaixo de 1,5s.

function Sombrero() {
  return (
    <svg viewBox="0 0 120 78" aria-hidden="true">
      <ellipse cx="60" cy="52" rx="55" ry="22" fill="#F5C518" stroke="#2B1D12" strokeWidth="3.4" />
      <path d="M60 6c11 0 19 20 21 38-7 4-13 5-21 5s-14-1-21-5C41 26 49 6 60 6z"
            fill="#F5C518" stroke="#2B1D12" strokeWidth="3.4" />
      <path d="M39.5 38c6.5 3 13 4 20.5 4s14-1 20.5-4l1.2 7c-6.8 3-14 4.2-21.7 4.2S45.1 48 38.3 45z"
            fill="#C8102E" />
      <path d="M8 50c14 9 33 13 52 13s38-4 52-13l1 5c-14 9-33 13.5-53 13.5S21 64 7 55z"
            fill="#1B4D3E" />
    </svg>
  );
}

// Papel picado. É o elemento que mais entrega "festa mexicana" por peça — e
// aqui é um <pattern>, então repete sozinho na largura que for sem esticar.
function Bandeirinhas() {
  return (
    <svg className="bandeirinhas" aria-hidden="true" preserveAspectRatio="none">
      <defs>
        <pattern id="picado" width="112" height="26" patternUnits="userSpaceOnUse">
          <line x1="0" y1="2" x2="112" y2="2" stroke="#B8791F" strokeWidth="2.5" />
          <polygon points="0,3 28,3 14,24"    fill="#C8102E" />
          <polygon points="28,3 56,3 42,24"   fill="#1B4D3E" />
          <polygon points="56,3 84,3 70,24"   fill="#1D3557" />
          <polygon points="84,3 112,3 98,24"  fill="#E8A33D" />
        </pattern>
      </defs>
      <rect width="100%" height="26" fill="url(#picado)" />
    </svg>
  );
}

// Tachinhas cravadas no aro. Ficam fora do disco de propósito: parafuso que
// gira junto com a roda destrói a ideia de que o aro é a parte fixa.
function TachasAro({ quantidade = 24 }) {
  return (
    <div className="roleta-tachas" aria-hidden="true">
      <svg viewBox="0 0 100 100">
        {Array.from({ length: quantidade }, (_, i) => {
          const a = (i / quantidade) * Math.PI * 2 - Math.PI / 2;
          return (
            <circle key={i} r="1.5"
              cx={50 + 46.4 * Math.cos(a)}
              cy={50 + 46.4 * Math.sin(a)}
              fill="#7A4E0C" opacity=".55" />
          );
        })}
      </svg>
    </div>
  );
}

function Agulha() {
  return (
    <div className="agulha" aria-hidden="true">
      <svg viewBox="0 0 34 46">
        <path d="M17 45C17 45 3 25 3 15A14 14 0 1 1 31 15C31 25 17 45 17 45Z"
              fill="#C8102E" stroke="#E8A33D" strokeWidth="3" strokeLinejoin="round" />
        <circle cx="17" cy="15" r="5" fill="#F9DCA0" />
      </svg>
    </div>
  );
}

// ─── A RODA ──────────────────────────────────────────────────────────────────
// Ângulo local é medido em graus no sentido horário a partir do topo, que é
// onde fica a agulha. Em SVG o zero é às 3 horas, daí o -90 na conversão.

const CX = 150;
const CY = 150;
const R = 150;

function ponto(anguloLocal, raio) {
  const a = ((anguloLocal - 90) * Math.PI) / 180;
  return [CX + raio * Math.cos(a), CY + raio * Math.sin(a)];
}

function caminhoFatia(indice, fatia) {
  const [x0, y0] = ponto(indice * fatia, R);
  const [x1, y1] = ponto((indice + 1) * fatia, R);
  const arcoGrande = fatia > 180 ? 1 : 0;
  return `M ${CX} ${CY} L ${x0} ${y0} A ${R} ${R} 0 ${arcoGrande} 1 ${x1} ${y1} Z`;
}

function Roleta({ premios, discoRef, areaRef, desfocada, ociosa }) {
  const fatia = 360 / premios.length;
  const indiceRaro = premios.findIndex((p) => p.raro);

  return (
    <div ref={areaRef}
         className={`roleta-area${desfocada ? ' desfocada' : ''}`}
         aria-hidden={desfocada || undefined}>
      <div className="roleta-aro" />
      <div className={`roleta-disco${ociosa ? ' ociosa' : ''}`} ref={discoRef}>
        <svg viewBox="0 0 300 300" role="img" aria-label="Roleta de prêmios do Chapelão">
          <defs>
            {/* Escurece a borda de cada fatia: dá profundidade sem precisar de
                uma cor diferente por fatia. */}
            <radialGradient id="profundidade" cx="50%" cy="50%" r="50%">
              <stop offset="55%" stopColor="#000" stopOpacity="0" />
              <stop offset="100%" stopColor="#000" stopOpacity=".26" />
            </radialGradient>

            {/* A fatia rara é a única que vale um almoço inteiro, e o olho tem
                que achar ela antes de ler qualquer rótulo. Ouro com luz vindo
                do miolo, em vez de chapado: dá volume e parece iluminada por
                dentro, não pintada. */}
            <radialGradient id="ouro-divino" cx="50%" cy="50%" r="72%">
              <stop offset="0%"   stopColor="#FFF3D0" />
              <stop offset="42%"  stopColor="#F9DCA0" />
              <stop offset="78%"  stopColor="#E8A33D" />
              <stop offset="100%" stopColor="#B8791F" />
            </radialGradient>

            {/* O halo que vaza pra fora da fatia. Sem ele o ouro fica só uma
                cor mais clara; com ele a fatia emite luz sobre as vizinhas. */}
            <filter id="aura-divina" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="5" result="borrao" />
              <feFlood floodColor="#FFD98A" floodOpacity=".95" result="cor" />
              <feComposite in="cor" in2="borrao" operator="in" result="halo" />
              <feMerge>
                <feMergeNode in="halo" />
                <feMergeNode in="halo" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {premios.map((p, i) => (
            <path key={p.id} d={caminhoFatia(i, fatia)}
                  fill={p.raro ? 'url(#ouro-divino)' : p.cor}
                  filter={p.raro ? 'url(#aura-divina)' : undefined}
                  stroke={p.raro ? '#FFF3D0' : '#FBF3E4'}
                  strokeWidth={p.raro ? 3.5 : 2.5} />
          ))}

          <circle cx={CX} cy={CY} r={R} fill="url(#profundidade)" />

          {/* Respiro de luz por cima do ouro. Fica DEPOIS do véu de
              profundidade de propósito — senão o escurecimento das bordas
              comeria justamente o brilho que a fatia precisa ter. */}
          {indiceRaro >= 0 && (
            <path className="fatia-divina" d={caminhoFatia(indiceRaro, fatia)}
                  fill="#FFF6DC" pointerEvents="none" />
          )}

          {premios.map((p, i) => {
            const meio = i * fatia + fatia / 2;
            const [tx, ty] = ponto(meio, R * 0.64);
            // Texto radial fica de cabeça pra baixo nas fatias da metade de
            // baixo. Girar 180° nessas faz o rótulo apontar pro centro em vez
            // de pra borda — o que importa é conseguir ler sem virar o celular.
            const anguloTexto = meio > 90 && meio < 270 ? meio + 180 : meio;
            // Texto escuro na fatia dourada — branco sobre dourado não lê.
            const tinta = p.raro ? '#2B1D12' : '#FFFFFF';
            const palavras = p.nome.split(' ');
            const linha1 = palavras.slice(0, -1).join(' ') || palavras[0];
            const linha2 = palavras.length > 1 ? palavras[palavras.length - 1] : '';

            return (
              <g key={`t-${p.id}`} transform={`rotate(${anguloTexto} ${tx} ${ty})`}>
                <text x={tx} y={ty} textAnchor="middle" fill={tinta}
                      fontSize="15" fontWeight="800"
                      fontFamily="var(--fonte), system-ui, sans-serif">
                  <tspan x={tx} dy="-2">{linha1}</tspan>
                  {linha2 && <tspan x={tx} dy="16">{linha2}</tspan>}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="roleta-luz" />
      <TachasAro />
      <Agulha />
      <div className="miolo"><Sombrero /></div>
    </div>
  );
}

// ─── ANIMAÇÃO DO GIRO ────────────────────────────────────────────────────────
// A roda tem que desacelerar de forma não-linear e passar rente ao prêmio raro
// antes de parar — sem isso vira sorteio sem graça.
//
// Como a agulha varre os índices em ordem decrescente conforme a roda gira, o
// caminho é feito em duas fases:
//   Fase A — arranca rápido e freia forte, terminando quase parada EM CIMA da
//            fatia rara;
//   Fase B — rola devagar da fatia rara até a fatia sorteada.
// Quando o sorteado É o raro, a fase A para na fatia anterior e a fase B entra
// no raro: 72° de suspense em vez de uma volta inteira.
// Lê o ângulo em que o disco está AGORA. A roda fica girando devagar antes
// do giro de verdade, então começar a animação do zero daria um salto — o
// giro real precisa partir de onde a roda ociosa parou.
function anguloAtual(el) {
  const t = el && getComputedStyle(el).transform;
  if (!t || t === "none") return 0;
  const m = t.match(/matrix(([^)]+))/);
  if (!m) return 0;
  const [a, b] = m[1].split(",").map(Number);
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
}
function animarAte({ disco, indice, total, raroIndice, anguloInicial = 0 }) {
  const fatia = 360 / total;
  const anguloAlvo = (360 - (indice * fatia + fatia / 2) + 360) % 360;

  const alvoEhRaro = indice === raroIndice;
  const indiceHesita = alvoEhRaro ? (raroIndice + 1) % total : raroIndice;
  // Fatias percorridas da hesitação até o alvo, no sentido em que a agulha varre.
  const passos = alvoEhRaro ? 1 : (raroIndice - indice + total) % total;
  const distanciaFinal = passos * fatia;

  const VOLTAS = 4;
  // Partindo de `anguloInicial`, o quanto falta girar pra cair no alvo. Somar
  // o inicial ao total cru erraria a fatia: a posição final tem que ser
  // congruente a anguloAlvo (mod 360), não deslocada por onde a roda estava.
  const deltaAteAlvo = (((anguloAlvo - anguloInicial) % 360) + 360) % 360;
  const rotacaoFinal = anguloInicial + 360 * VOLTAS + deltaAteAlvo;
  const rotacaoHesita = rotacaoFinal - distanciaFinal;

  const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduzido) {
    const anim = disco.animate(
      [{ transform: `rotate(${anguloInicial}deg)` }, { transform: `rotate(${anguloInicial + deltaAteAlvo}deg)` }],
      { duration: 550, easing: 'ease-out', fill: 'forwards' },
    );
    return { anim, duracao: 550 };
  }

  // Fase B mais longa quanto maior a distância, pra a rolagem final continuar
  // parecendo lenta mesmo quando sobram 288° depois do raro.
  const duracaoA = 2500;
  const duracaoB = 600 + (distanciaFinal / 360) * 900;
  const total_ms = duracaoA + duracaoB;

  const anim = disco.animate(
    [
      { transform: `rotate(${anguloInicial}deg)`, offset: 0, easing: 'cubic-bezier(.11,.62,.26,1)' },
      { transform: `rotate(${rotacaoHesita}deg)`, offset: duracaoA / total_ms, easing: 'cubic-bezier(.35,0,.2,1)' },
      { transform: `rotate(${rotacaoFinal}deg)`, offset: 1 },
    ],
    { duration: total_ms, fill: 'forwards' },
  );

  return { anim, duracao: total_ms };
}

// ─── BORRÃO PROGRESSIVO ──────────────────────────────────────────────────────
// A roda vai embaçando ENQUANTO desacelera, e some antes de ficar legível.
//
// Por que não borrar só na hora de abrir a folha: no fim do giro a roda está
// lenta, e uma roda lenta e nítida deixa a pessoa "ver" em que fatia ela está
// quase parando. Como o prêmio revelado depois é o de verdade — e não o que
// ela achou que ia sair — o resultado parecia trapaça. O sorteio sempre foi
// honesto (é decidido no servidor antes de a roda girar), mas percepção de
// trapaça vale tanto quanto trapaça. Some antes de dar pra ler e o problema
// deixa de existir.
//
// Todo o trecho lento do giro acontece com o borrão no máximo.
// Os números saem de uma conta, não de gosto. O giro tem duas fases: uma
// rápida que freia forte, e uma LENTA no fim — é a lenta que dá a impressão
// de estar pousando numa fatia. Conforme a distância até o prêmio, a fase
// lenta começa entre 65,4% e 76,2% do giro. Com o borrão cheio em 55%, ela
// acontece inteira embaçada nos quatro casos, com folga de 10 a 21 pontos.
const BORRAO_MAX = 12;      // px
const BORRAO_INICIO = 0.28; // fração do giro em que começa a embaçar
const BORRAO_FIM = 0.55;    // fração em que já está ilegível
const FOLHA_EM = 0.58;      // a folha sobe com o borrão já cheio

// Um laço de rAF só, cuidando do borrão e da subida da folha. Usa o relógio
// da própria animação: `setTimeout` chegou a atrasar 856ms aqui, porque a
// thread principal está ocupada animando a roda.
function acompanharGiro(anim, area, aoAbrirFolha) {
  let cancelado = false;
  let folhaAberta = false;

  const abrir = () => {
    if (folhaAberta) return;
    folhaAberta = true;
    aoAbrirFolha();
  };

  const passo = () => {
    if (cancelado) return;

    const duracao = Number(anim.effect.getTiming().duration) || 1;
    const p = Math.min(1, (Number(anim.currentTime) || 0) / duracao);

    const bruto = (p - BORRAO_INICIO) / (BORRAO_FIM - BORRAO_INICIO);
    const t = Math.min(1, Math.max(0, bruto));
    const suave = t * t * (3 - 2 * t); // smoothstep: entra e sai sem degrau
    area?.style.setProperty('--borrao', `${(suave * BORRAO_MAX).toFixed(2)}px`);

    if (p >= FOLHA_EM) abrir();

    if (p < 1 && anim.playState !== 'finished') requestAnimationFrame(passo);
    else abrir();
  };

  requestAnimationFrame(passo);
  return () => { cancelado = true; };
}

// Espera o giro terminar SEM depender só de `anim.finished`.
//
// Um navegador que congela animação em aba oculta nunca resolve essa promessa,
// e a pessoa fica presa no "Girando…" pra sempre — o que é fácil de acontecer
// no celular: chega uma notificação, ela troca de app, volta, e a tela morreu.
// O relógio é a rede de segurança; `finish()` cola a roda no lugar certo.
async function esperarGiro({ anim, duracao }) {
  await Promise.race([
    anim.finished.catch(() => {}),
    new Promise((r) => setTimeout(r, duracao + 1500)),
  ]);
  try { anim.finish(); } catch { /* já terminou */ }
}

// ─── PÁGINA ──────────────────────────────────────────────────────────────────

function dataBR(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).split('-');
  return `${d}/${m}/${a}`;
}

// Uma data solta ("Vale até 17/09/2026") não cria urgência nenhuma — o prêmio
// vale pro próximo almoço, e é isso que a pessoa precisa ler. A casa fecha às
// 14h, então "hoje" tem hora marcada e dizer isso é o que faz decidir agora.
function validadeEmPalavras(iso) {
  if (!iso) return '';
  const emSP = (d) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);

  const hoje = emSP(new Date());
  const amanha = emSP(new Date(Date.now() + 86400000));

  if (iso === hoje) return 'só HOJE, até as 14h';
  if (iso === amanha) return `só amanhã (${dataBR(iso)}), até as 14h`;
  return `até ${dataBR(iso)}`;
}

export default function Pagina() {
  // carregando → pronta → girando → formulario → codigo
  //
  // O formulário entra ANTES da revelação, de propósito: a pessoa preenche
  // pra descobrir o que ganhou. Revelar antes e pedir o dado depois derruba
  // a captura — com prêmio de R$4 não existe reciprocidade que segure, e
  // quem já viu que ganhou uma bebida simplesmente fecha a página.
  const [etapa, setEtapa] = useState('carregando');
  const [premios, setPremios] = useState([]);
  const [sessaoId, setSessaoId] = useState(null);
  const [resgate, setResgate] = useState(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const discoRef = useRef(null);
  const origemRef = useRef({ origem: 'ifood' });
  const cancelarFolhaRef = useRef(null);
  const nomeRef = useRef(null);
  const areaRef = useRef(null);
  const sessaoIniciadaRef = useRef(false);

  // Garante o borrão cheio quando a folha abre pelo caminho de exceção (aba
  // em segundo plano, quando o rAF não roda e o laço nunca pintou o borrão).
  // Sem isto a folha subiria com a roda nítida atrás — o cenário exato que
  // ela existe pra evitar.
  useEffect(() => {
    if (etapa === 'formulario') {
      areaRef.current?.style.setProperty('--borrao', `${BORRAO_MAX}px`);
    } else if (etapa === 'pronta') {
      areaRef.current?.style.setProperty('--borrao', '0px');
    }
  }, [etapa]);

  // Trava a rolagem do fundo enquanto a folha está aberta: sem isso, no
  // Android o teclado empurra a página e a pessoa perde o campo de vista.
  useEffect(() => {
    if (etapa !== 'formulario') return;
    const antes = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    return () => { document.documentElement.style.overflow = antes; };
  }, [etapa]);

  // Foca o primeiro campo assim que a folha sobe — um toque a menos.
  useEffect(() => {
    if (etapa === 'formulario') nomeRef.current?.focus({ preventScroll: true });
  }, [etapa]);

  useEffect(() => () => cancelarFolhaRef.current?.(), []);

  // Abre a sessão assim que a página monta. Ler a querystring aqui (em vez de
  // useSearchParams) evita ter que embrulhar a página num Suspense só por causa
  // de dois parâmetros de UTM.
  //
  // A trava do ref não é firula de StrictMode: sem ela o efeito roda duas
  // vezes, nascem DUAS sessões e a resposta mais lenta sobrescreve o
  // `sessaoId` depois de a pessoa já ter girado — o resgate então vai parar
  // numa sessão que nunca girou e o servidor recusa com "gire antes de
  // resgatar". Também dobrava a contagem da taxa 1 ("escaneou"), que é
  // justamente a métrica que mede o adesivo.
  useEffect(() => {
    if (sessaoIniciadaRef.current) return;
    sessaoIniciadaRef.current = true;

    const q = new URLSearchParams(window.location.search);
    const ctx = {
      origem: q.get("origem") || (q.get("r") ? "recompra" : "ifood"),
      lote: q.get('lote') || null,
      utm_source: q.get('utm_source'),
      utm_campaign: q.get('utm_campaign'),
      // r = codigo curto do disparo que trouxe este clique. Sem ele a sessao
      // fica anonima e o funil perde o degrau "abriu o link". `ref` (UUID)
      // continua aceito pros links antigos que ja sairam.
      ref: q.get("r") || q.get("ref") || null,
    };
    origemRef.current = ctx;

    // Mensagem por causa, não uma só pra tudo. O cliente nunca lê palavra
    // técnica — problema de configuração vira "em manutenção" pra ele — mas o
    // detalhe vai pro console e pra /api/saude, que é onde quem cuida do
    // sistema descobre o que houve sem precisar adivinhar.
    const MENSAGENS = {
      config_ausente: 'A roleta está em manutenção. Daqui a pouco ela volta!',
      sem_premios: 'A roleta está sendo ajustada. Volta daqui a pouco!',
      muitas_tentativas: 'Muita gente girando agora. Espera um minutinho e recarrega.',
    };

    // sessionStorage e não localStorage: vale só enquanto a aba existir. Uma
    // recarga reaproveita a sessão (não é um QR novo), mas quem escaneia de
    // novo amanhã conta como visita nova, que é o certo.
    let sessaoSalva = null;
    try { sessaoSalva = sessionStorage.getItem('roleta_sessao'); } catch { /* modo privado */ }

    fetch('/api/sessao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...ctx, sessao_id: sessaoSalva }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.erro) {
          if (d.erro === 'config_ausente') {
            console.error(
              `[roleta] Faltam variáveis de ambiente neste deploy: ${(d.faltando || []).join(', ')}.\n`
              + 'Abra /api/saude para o diagnóstico completo. Lembre que variável nova só '
              + 'vale em deploy novo — cadastre e use Redeploy na Vercel.',
            );
          }
          setErro(MENSAGENS[d.erro] || 'Não consegui carregar a roleta. Tenta recarregar a página.');
          return;
        }
        try { sessionStorage.setItem('roleta_sessao', d.sessao_id); } catch { /* modo privado */ }
        setSessaoId(d.sessao_id);
        setPremios(d.premios);
        setEtapa('pronta');
      })
      .catch(() => setErro('Não consegui carregar a roleta. Tenta recarregar a página.'));
  }, []);

  const girar = useCallback(async () => {
    if (etapa !== 'pronta' || !sessaoId) return;
    setEtapa('girando');
    setErro('');

    try {
      const r = await fetch('/api/girar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessao_id: sessaoId }),
      });
      const d = await r.json();
      if (d.erro) throw new Error(d.erro);

      const raroIndice = premios.findIndex((p) => p.raro);

      // Congela a roda ociosa onde ela está e parte daí. Tirar a classe sem
      // ler o ângulo antes faria o disco pular pro zero antes de girar.
      const disco = discoRef.current;
      const anguloInicial = anguloAtual(disco);
      disco?.classList.remove("ociosa");

      const giro = animarAte({
        disco,
        indice: d.indice,
        total: d.total_fatias,
        raroIndice: raroIndice < 0 ? d.total_fatias - 1 : raroIndice,
        anguloInicial,
      });

      // A roda embaça junto com a desaceleração e some antes de ficar
      // legível; a folha sobe com o borrão já cheio, faltando ~38% do giro.
      // A roda NÃO para: ela termina o giro por trás do borrão.
      cancelarFolhaRef.current = acompanharGiro(
        giro.anim,
        areaRef.current,
        () => setEtapa('formulario'),
      );

      await esperarGiro(giro);

      // Rede de segurança: rAF não roda com a aba em segundo plano. Se a
      // pessoa trocou de app no meio do giro e voltou, o gatilho acima pode
      // nunca ter disparado — e ela ficaria olhando uma roda parada sem
      // nada acontecer. Aqui a folha sobe de qualquer jeito.
      setEtapa((atual) => (atual === 'girando' ? 'formulario' : atual));
    } catch {
      cancelarFolhaRef.current?.();
      setEtapa('pronta');
      setErro('Deu ruim no giro. Tenta de novo?');
    }
  }, [etapa, sessaoId, premios]);

  async function enviar(e) {
    e.preventDefault();
    if (enviando) return;
    setErro('');

    if (!aceite) { setErro('Marque o aceite para a gente poder te chamar no WhatsApp.'); return; }
    setEnviando(true);

    try {
      const r = await fetch('/api/resgatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessao_id: sessaoId,
          nome,
          telefone,
          consentimento: aceite,
          ...origemRef.current,
        }),
      });
      const d = await r.json();

      if (d.erro) {
        setErro(d.mensagem || 'Não consegui gerar seu código. Confere os dados?');
        setEnviando(false);
        return;
      }

      setResgate(d);
      setEtapa('codigo');
    } catch {
      setErro('Falha de conexão. Tenta de novo?');
    } finally {
      setEnviando(false);
    }
  }

  // Grava a métrica ANTES de sair da página: depois do redirect o browser
  // descarta a requisição pela metade e a taxa 3 do funil fica subestimada.
  async function irProWhatsapp() {
    const codigo = resgate?.codigo;
    if (!codigo) return;
    try {
      const r = await fetch('/api/whatsapp-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo }),
      });
      const d = await r.json();
      if (d.url) window.location.href = d.url;
    } catch {
      setErro('Não consegui abrir o WhatsApp. Copia o código e chama a gente.');
    }
  }

  function copiar() {
    navigator.clipboard?.writeText(resgate.codigo).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2200);
    });
  }

  // Na tela do código a roda some. Além de não ter mais função ali, ela
  // brigaria com o cartão no caso do telefone repetido: a agulha teria
  // parado no prêmio de agora, e o cupom mostrado é o do primeiro giro.
  const mostraRoleta = etapa === 'pronta' || etapa === 'girando' || etapa === 'formulario';

  return (
    <div className="cena">
      <Bandeirinhas />

      <main className="palco">
        <header className="cabecalho">
          <div className="selo-marca">
            <Sombrero />
            <span>Clube do Chapelão</span>
          </div>

          {etapa === 'codigo' ? (
            <h1 className="chamada">Você <span className="grifo">ganhou!</span></h1>
          ) : (
            <>
              <h1 className="chamada">
                Tem um <span className="grifo">presente</span><br />seu esperando
              </h1>
              <p className="subchamada">Gira a roleta e descobre o que é.</p>
            </>
          )}
        </header>

        {etapa === 'carregando' && <p className="carregando pulso">Preparando sua roleta…</p>}

        {mostraRoleta && premios.length > 0 && (
          <Roleta premios={premios} discoRef={discoRef} areaRef={areaRef}
                  desfocada={etapa === 'formulario'}
                  ociosa={etapa === 'pronta'} />
        )}

        {etapa === 'pronta' && (
          <button className="botao botao-girar" onClick={girar}>Girar a roleta</button>
        )}

        {etapa === 'girando' && <p className="carregando pulso">Girando…</p>}

        {etapa === 'codigo' && resgate && (
          <section className="cartao" style={{ marginTop: 16 }}>
            {/* Agora é AQUI que o prêmio aparece pela primeira vez, então ele
                é o herói do cartão — não mais um rótulo pequeno em cima. */}
            <div className="premio-selo">Seu prêmio</div>
            <h2 className="premio-nome">{resgate.premio}</h2>
            <p className="premio-desc">{resgate.premio_descricao}</p>

            <div className="cupom">
              <div className="cupom-rotulo">Seu código</div>
              <div className="cupom-codigo">{resgate.codigo}</div>
            </div>

            {resgate.repetido && (
              <div className="erro" style={{ marginBottom: 14 }}>
                Esse número já girou antes — esse é o código que você tirou.
                {resgate.status === 'resgatado' && ' Ele já foi usado.'}
                {resgate.status === 'expirado' && ' A validade dele já passou.'}
              </div>
            )}

            <ul className="regras">
              <li>Vale <strong>{validadeEmPalavras(resgate.valido_ate)}</strong></li>
              <li>Só em <strong>pedido direto no WhatsApp</strong>, não no app</li>
              {/* Brinde a pessoa precisa pedir; desconto o sistema aplica
                  sozinho no fechamento. Escrever "peça a cortesia" num cupom
                  de desconto faria o cliente cobrar algo que já vem pronto. */}
              <li>
                {resgate.tipo === 'desconto_percentual'
                  ? 'Uso único — o desconto entra sozinho no seu pedido'
                  : 'Uso único — é só pedir a cortesia na conversa'}
              </li>
            </ul>

            <button className="botao botao-zap" onClick={irProWhatsapp} style={{ marginTop: 20 }}>
              Resgatar no WhatsApp
            </button>
            <button className="botao botao-fantasma" onClick={copiar}>
              {copiado ? 'Código copiado!' : 'Copiar código'}
            </button>

            {erro && <div className="erro">{erro}</div>}
          </section>
        )}

        {etapa !== 'codigo' && etapa !== 'formulario' && erro && (
          <div className="erro" style={{ marginTop: 16 }}>{erro}</div>
        )}
      </main>

      {/* ─── A TELINHA ────────────────────────────────────────────────────
          Sobe com a roda ainda girando por trás do borrão. O prêmio não é
          citado em lugar nenhum aqui: é justamente o não saber que faz a
          pessoa preencher. */}
      {etapa === 'formulario' && (
        <div className="veu" role="dialog" aria-modal="true" aria-labelledby="folha-titulo">
          <div className="folha-form">
            <div className="alca" />

            <h2 className="folha-titulo" id="folha-titulo">
              A roleta parou<br /><span className="grifo">no seu prêmio</span>
            </h2>
            <p className="folha-sub">
              Preenche aqui pra ver o que você ganhou e receber seu código.
            </p>

            <div className="suspense" aria-hidden="true"><i /><i /><i /></div>

            <form onSubmit={enviar}>
              <div className="campo">
                <label htmlFor="nome">Seu nome</label>
                <input
                  ref={nomeRef}
                  id="nome" type="text" required autoComplete="given-name"
                  placeholder="Como te chamam?" value={nome}
                  onChange={(e) => setNome(e.target.value)} maxLength={60}
                />
              </div>

              <div className="campo">
                <label htmlFor="tel">Seu WhatsApp</label>
                <input
                  id="tel" type="tel" required inputMode="numeric" autoComplete="tel"
                  placeholder="(44) 99999-9999" value={telefone}
                  onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
                />
              </div>

              <label className="consentimento">
                <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} />
                <span>
                  Aceito receber contato do Restaurante Chapelão pelo WhatsApp para
                  resgatar meu prêmio e conhecer as novidades da casa.
                </span>
              </label>

              {erro && <div className="erro">{erro}</div>}

              <button className="botao" type="submit" disabled={enviando} style={{ marginTop: 18 }}>
                {enviando ? 'Abrindo seu prêmio…' : 'Ver meu prêmio'}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="mosaico" />
      <p className="rodape-nota">
        Clube do Chapelão · Av. Paraná, 5648 — Umuarama/PR<br />
        Seus dados são usados só para o contato do restaurante.
      </p>
    </div>
  );
}
