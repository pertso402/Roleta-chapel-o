'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ─── VSL DO CONVÊNIO ─────────────────────────────────────────────────────────
// Upgrade opcional na tela do prêmio: assiste até o fim, o prêmio dobra. Nunca
// fica entre a pessoa e o WhatsApp — o botão de resgatar continua ali, e quem
// sai pro WhatsApp não volta pra página.

export function mmss(seg) {
  const s = Math.max(0, Math.ceil(seg));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Beacon pra quando a página está saindo (fechou a aba, trocou de app): o
// fetch comum morre no meio. text/plain porque beacon com application/json
// esbarra na regra de CORS de alguns navegadores; o servidor lê igual.
export function eventoVideo(resgate, evento, extra = {}, { beacon = false } = {}) {
  const corpo = JSON.stringify({ codigo: resgate.codigo, token: resgate.token, evento, ...extra });
  if (beacon && navigator.sendBeacon) {
    navigator.sendBeacon('/api/video', new Blob([corpo], { type: 'text/plain' }));
    return Promise.resolve(null);
  }
  return fetch('/api/video', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: corpo,
    keepalive: true,
  }).then((r) => r.json()).catch(() => null);
}

export function OfertaDobro({ video, aoAssistir }) {
  const comecou = video.max_seg > 3;
  return (
    <div className="dobro">
      <div className="dobro-selo">Dobre seu prêmio</div>
      <p className="dobro-titulo">Que tal <span>{video.nome_dobro}</span>?</p>
      <p className="dobro-sub">
        Assiste até o fim um vídeo rápido ({mmss(video.duracao)}) sobre o{' '}
        <strong>Convênio Chapelão</strong> e seu prêmio dobra na hora.
      </p>
      <button className="botao" onClick={aoAssistir}>
        {comecou ? `Continuar · faltam ${mmss(video.duracao - video.max_seg)}` : 'Assistir e dobrar'}
      </button>
    </div>
  );
}

// O <video> existe desde que a oferta aparece, escondido. Motivo: o iPhone só
// toca com som se o play() for chamado DENTRO do toque no botão — num efeito
// depois da renderização já não vale mais, e o vídeo abriria mudo ou parado.
export function PlayerVsl({ resgate, aberto, videoRef, aoFechar, aoConcluir }) {
  const video = resgate.video;
  const [tempo, setTempo] = useState(video.max_seg);
  const [duracao, setDuracao] = useState(video.duracao);
  const [tocando, setTocando] = useState(false);
  const [mudo, setMudo] = useState(false);
  const [estado, setEstado] = useState(''); // '' | concluindo | erro
  const maxRef = useRef(video.max_seg);
  const enviadoRef = useRef(video.max_seg);
  const playEnviadoRef = useRef(false);

  const enviarProgresso = useCallback((beacon = false) => {
    const s = Math.floor(maxRef.current);
    if (s <= enviadoRef.current) return;
    enviadoRef.current = s;
    eventoVideo(resgate, 'progresso', { segundo: s }, { beacon });
  }, [resgate]);

  // Progresso a cada 5s enquanto toca: é dele que sai a curva de retenção.
  useEffect(() => {
    if (!tocando) return;
    const id = setInterval(() => enviarProgresso(), 5000);
    return () => clearInterval(id);
  }, [tocando, enviarProgresso]);

  // Saiu da página no meio (notificação, trocou de app): pausa — pra não
  // terminar sozinho num bolso — e grava até onde foi.
  useEffect(() => {
    const sair = (e) => {
      if (document.visibilityState === 'hidden' || e.type === 'pagehide') {
        videoRef.current?.pause();
        enviarProgresso(true);
      }
    };
    document.addEventListener('visibilitychange', sair);
    window.addEventListener('pagehide', sair);
    return () => {
      document.removeEventListener('visibilitychange', sair);
      window.removeEventListener('pagehide', sair);
    };
  }, [enviarProgresso, videoRef]);

  // Sem barra de avançar: qualquer pulo pra frente do ponto mais longe já
  // assistido volta pra ele. Voltar pra trás pode.
  function vigiar() {
    const v = videoRef.current;
    if (!v) return;
    if (v.currentTime > maxRef.current + 2) { v.currentTime = maxRef.current; return; }
    maxRef.current = Math.max(maxRef.current, v.currentTime);
    setTempo(v.currentTime);
  }

  function aoCarregar() {
    const v = videoRef.current;
    if (!v) return;
    if (v.duration && Number.isFinite(v.duration)) setDuracao(v.duration);
    // Retoma de onde parou da última vez.
    if (maxRef.current > 0 && v.currentTime < 1) v.currentTime = maxRef.current;
  }

  function aoTocar() {
    setTocando(true);
    if (playEnviadoRef.current) return;
    playEnviadoRef.current = true;
    // Repete uma vez se falhar: sem o play gravado, o servidor nunca vê os
    // 75s passarem e o dobro seria negado a quem assistiu tudo.
    eventoVideo(resgate, 'play').then((d) => { if (!d?.ok) eventoVideo(resgate, 'play'); });
  }

  async function concluir() {
    setEstado('concluindo');
    maxRef.current = duracao;
    let d = await eventoVideo(resgate, 'concluir');
    // 'cedo' só acontece se o play foi gravado atrasado (rede ruim). Espera
    // o que falta e tenta de novo, em vez de negar o prêmio.
    if (d?.erro === 'cedo' && d.faltam <= 20) {
      await new Promise((r) => setTimeout(r, (d.faltam + 1) * 1000));
      d = await eventoVideo(resgate, 'concluir');
    }
    if (d?.dobrado) { setEstado(''); aoConcluir(d); return; }
    setEstado('erro');
  }

  function alternar() {
    const v = videoRef.current;
    if (!v || estado) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  }

  function fechar() {
    videoRef.current?.pause();
    enviarProgresso();
    aoFechar(Math.floor(maxRef.current));
  }

  const falta = Math.max(0, duracao - tempo);

  return (
    <div className={`vsl-veu${aberto ? ' aberto' : ''}`} role="dialog" aria-modal="true"
         aria-label="Vídeo do Convênio Chapelão" aria-hidden={!aberto}>
      <div className="vsl-moldura">
        <video
          ref={videoRef} src={video.url} playsInline preload="metadata"
          disablePictureInPicture controlsList="nodownload noplaybackrate"
          onClick={alternar} onLoadedMetadata={aoCarregar}
          onTimeUpdate={vigiar} onSeeking={vigiar}
          onPlay={aoTocar} onPause={() => { setTocando(false); enviarProgresso(); }}
          onEnded={concluir}
        />

        {!tocando && !estado && aberto && (
          <button className="vsl-play" onClick={alternar} aria-label="Continuar o vídeo">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor" /></svg>
          </button>
        )}

        <button className="vsl-fechar" onClick={fechar} aria-label="Fechar o vídeo">×</button>
        <button className="vsl-som" onClick={() => {
          const v = videoRef.current;
          if (v) { v.muted = !v.muted; setMudo(v.muted); }
        }}>
          {mudo ? 'Ativar som' : 'Tirar som'}
        </button>

        <div className="vsl-rodape">
          <div className="vsl-barra"><i style={{ width: `${Math.min(100, (tempo / duracao) * 100)}%` }} /></div>
          <div className="vsl-falta">
            {estado === 'concluindo' && 'Dobrando seu prêmio…'}
            {estado === 'erro' && (
              <>Não consegui dobrar agora. <button className="vsl-link" onClick={concluir}>Tentar de novo</button></>
            )}
            {!estado && <>Faltam <strong>{mmss(falta)}</strong> pro seu prêmio dobrar</>}
          </div>
        </div>
      </div>
    </div>
  );
}
