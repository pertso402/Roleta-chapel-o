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

function Roleta({ premios, discoRef }) {
  const fatia = 360 / premios.length;

  return (
    <div className="roleta-area">
      <div className="roleta-aro" />
      <div className="roleta-disco" ref={discoRef}>
        <svg viewBox="0 0 300 300" role="img" aria-label="Roleta de prêmios do Chapelão">
          <defs>
            {/* Escurece a borda de cada fatia: dá profundidade sem precisar de
                uma cor diferente por fatia. */}
            <radialGradient id="profundidade" cx="50%" cy="50%" r="50%">
              <stop offset="55%" stopColor="#000" stopOpacity="0" />
              <stop offset="100%" stopColor="#000" stopOpacity=".26" />
            </radialGradient>
          </defs>

          {premios.map((p, i) => (
            <path key={p.id} d={caminhoFatia(i, fatia)} fill={p.cor}
                  stroke="#FBF3E4" strokeWidth="2.5" />
          ))}

          <circle cx={CX} cy={CY} r={R} fill="url(#profundidade)" />

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
function animarAte({ disco, indice, total, raroIndice }) {
  const fatia = 360 / total;
  const anguloAlvo = (360 - (indice * fatia + fatia / 2) + 360) % 360;

  const alvoEhRaro = indice === raroIndice;
  const indiceHesita = alvoEhRaro ? (raroIndice + 1) % total : raroIndice;
  // Fatias percorridas da hesitação até o alvo, no sentido em que a agulha varre.
  const passos = alvoEhRaro ? 1 : (raroIndice - indice + total) % total;
  const distanciaFinal = passos * fatia;

  const VOLTAS = 4;
  const rotacaoFinal = 360 * VOLTAS + anguloAlvo;
  const rotacaoHesita = rotacaoFinal - distanciaFinal;

  const reduzido = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if (reduzido) {
    const anim = disco.animate(
      [{ transform: 'rotate(0deg)' }, { transform: `rotate(${anguloAlvo}deg)` }],
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
      { transform: 'rotate(0deg)', offset: 0, easing: 'cubic-bezier(.11,.62,.26,1)' },
      { transform: `rotate(${rotacaoHesita}deg)`, offset: duracaoA / total_ms, easing: 'cubic-bezier(.35,0,.2,1)' },
      { transform: `rotate(${rotacaoFinal}deg)`, offset: 1 },
    ],
    { duration: total_ms, fill: 'forwards' },
  );

  return { anim, duracao: total_ms };
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

export default function Pagina() {
  const [etapa, setEtapa] = useState('carregando'); // carregando|pronta|girando|revelado|codigo
  const [premios, setPremios] = useState([]);
  const [sessaoId, setSessaoId] = useState(null);
  const [premio, setPremio] = useState(null);
  const [resgate, setResgate] = useState(null);
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [aceite, setAceite] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const discoRef = useRef(null);
  const origemRef = useRef({ origem: 'ifood' });

  // Abre a sessão assim que a página monta. Ler a querystring aqui (em vez de
  // useSearchParams) evita ter que embrulhar a página num Suspense só por causa
  // de dois parâmetros de UTM.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const ctx = {
      origem: q.get('origem') || 'ifood',
      lote: q.get('lote') || null,
      utm_source: q.get('utm_source'),
      utm_campaign: q.get('utm_campaign'),
    };
    origemRef.current = ctx;

    fetch('/api/sessao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ctx),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.erro) throw new Error(d.erro);
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
      const giro = animarAte({
        disco: discoRef.current,
        indice: d.indice,
        total: d.total_fatias,
        raroIndice: raroIndice < 0 ? d.total_fatias - 1 : raroIndice,
      });

      await esperarGiro(giro);
      setPremio(d.premio);
      setEtapa('revelado');
    } catch {
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

  const mostraRoleta = etapa === 'pronta' || etapa === 'girando' || etapa === 'revelado';

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
            <h1 className="chamada">Prêmio <span className="grifo">garantido</span></h1>
          ) : etapa === 'revelado' ? (
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
          <Roleta premios={premios} discoRef={discoRef} />
        )}

        {etapa === 'pronta' && (
          <button className="botao botao-girar" onClick={girar}>Girar a roleta</button>
        )}

        {etapa === 'girando' && <p className="carregando pulso">Girando…</p>}

        {etapa === 'revelado' && premio && (
          <section className="cartao" style={{ marginTop: 20 }}>
            <div className="premio-selo">Seu prêmio</div>
            <h2 className="premio-nome">{premio.nome}</h2>
            <p className="premio-desc">{premio.descricao}</p>

            <form onSubmit={enviar}>
              <p className="form-topo">Pra onde a gente manda seu código?</p>

              <div className="campo">
                <label htmlFor="nome">Seu nome</label>
                <input
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
                {enviando ? 'Gerando seu código…' : 'Pegar meu código'}
              </button>
            </form>
          </section>
        )}

        {etapa === 'codigo' && resgate && (
          <section className="cartao" style={{ marginTop: 16 }}>
            <div className="premio-selo">{resgate.premio}</div>
            <p className="premio-desc" style={{ marginTop: 10 }}>{resgate.premio_descricao}</p>

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
              <li>Vale até <strong>{dataBR(resgate.valido_ate)}</strong></li>
              <li>Só em <strong>pedido direto no WhatsApp</strong>, não no app</li>
              <li>Uso único — é só pedir a cortesia na conversa</li>
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

        {etapa !== 'codigo' && etapa !== 'revelado' && erro && (
          <div className="erro" style={{ marginTop: 16 }}>{erro}</div>
        )}
      </main>

      <div className="mosaico" />
      <p className="rodape-nota">
        Clube do Chapelão · Av. Paraná, 5648 — Umuarama/PR<br />
        Seus dados são usados só para o contato do restaurante.
      </p>
    </div>
  );
}
