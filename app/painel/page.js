'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatarTelefone } from '../../lib/telefone.js';
import './painel.css';

function pct(n, d) {
  if (!d) return '—';
  return `${((n / d) * 100).toFixed(1)}%`;
}

function dataBR(iso) {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

// ─── BUSCA POR CÓDIGO ────────────────────────────────────────────────────────
// A tela mais usada do painel. O veredito vem em uma palavra e em cor forte,
// porque quem lê isso está com o cliente esperando resposta.
function Busca() {
  const [codigo, setCodigo] = useState('');
  const [achado, setAchado] = useState(undefined);
  const [buscando, setBuscando] = useState(false);

  async function buscar(e) {
    e.preventDefault();
    if (!codigo.trim()) return;
    setBuscando(true);
    try {
      const r = await fetch(`/api/painel/dados?codigo=${encodeURIComponent(codigo.trim())}`);
      const d = await r.json();
      setAchado(d.busca);
    } finally {
      setBuscando(false);
    }
  }

  async function darBaixa() {
    if (!achado) return;
    await fetch('/api/painel/baixa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo: achado.codigo }),
    });
    setAchado({ ...achado, status: 'resgatado', usado: true });
  }

  const veredito = {
    gerado: 'PODE USAR',
    resgatado: 'JÁ FOI USADO',
    expirado: 'VENCIDO',
  };

  return (
    <section>
      <h2>Conferir código</h2>
      <form className="pn-busca" onSubmit={buscar}>
        <input
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.toUpperCase())}
          placeholder="BEB-4821"
          autoComplete="off"
          autoCapitalize="characters"
        />
        <button className="pn-btn" disabled={buscando}>{buscando ? '…' : 'Buscar'}</button>
      </form>

      {achado === null && (
        <div className="pn-achado vazio">
          <div className="pn-veredito">CÓDIGO NÃO EXISTE</div>
          <div className="pn-linha">Confere se digitou certo. Se insistir, não é código nosso.</div>
        </div>
      )}

      {achado && (
        <div className={`pn-achado ${achado.status}`}>
          <div className="pn-veredito">{veredito[achado.status]}</div>
          <div className="pn-linha"><b>Prêmio</b> {achado.premio}</div>
          <div className="pn-linha"><b>O que dar</b> {achado.premio_descricao}</div>
          <div className="pn-linha"><b>Cliente</b> {achado.nome} — {formatarTelefone(achado.telefone)}</div>
          <div className="pn-linha"><b>Vale até</b> {dataBR(achado.valido_ate)}</div>
          <div className="pn-linha"><b>Pedidos</b> {achado.total_pedidos ?? 0}</div>

          {achado.status === 'gerado' && (
            <>
              <button className="pn-btn" style={{ marginTop: 12 }} onClick={darBaixa}>
                Marcar como usado
              </button>
              <div className="pn-linha" style={{ marginTop: 8, fontSize: 12, fontStyle: 'italic' }}>
                Só aperte se o resgate for por fora do agente. Pedido fechado pelo
                WhatsApp já dá baixa sozinho.
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}

// ─── AS QUATRO TAXAS ─────────────────────────────────────────────────────────
function Taxas({ funil, denominador, ticketMedio, dias }) {
  const base = denominador.pedidos_ifood;

  const taxas = [
    { rot: '1 · Escaneou',   num: funil.sessoes,    dica: 'Baixa? Mexa no adesivo: posição, copy, tamanho do QR.' },
    { rot: '2 · Preencheu',  num: funil.resgates,   dica: 'Baixa? Mexa na roleta e no formulário.' },
    { rot: '3 · Foi pro zap',num: funil.cliques,    dica: 'Baixa? Mexa na tela do código.' },
    { rot: '4 · Resgatou',   num: funil.resgatados, dica: 'Baixa? Mexa no prêmio e no follow-up do agente.' },
  ];

  // O período das métricas e o do relatório do iFood raramente coincidem. Dizer
  // isso na cara evita alguém ler 40% de escaneamento como verdade absoluta.
  const periodoDiferente = base && denominador.periodo_fim;

  return (
    <section>
      <h2>As quatro taxas · últimos {dias} dias</h2>
      <div className="pn-taxas">
        {taxas.map((t) => (
          <div className="pn-taxa" key={t.rot}>
            <div className="rot">{t.rot}</div>
            <div className="val">{pct(t.num, base)}</div>
            <div className="abs">{t.num} de {base ?? '?'} pedidos</div>
            <div className="dica">{t.dica}</div>
          </div>
        ))}
      </div>

      <div className="pn-taxas" style={{ marginTop: 12 }}>
        <div className="pn-taxa">
          <div className="rot">Girou → preencheu</div>
          <div className="val">{pct(funil.resgates, funil.giros)}</div>
          <div className="abs">{funil.resgates} de {funil.giros} giros</div>
        </div>
        <div className="pn-taxa">
          <div className="rot">Ticket médio resgatado</div>
          <div className="val">{ticketMedio ? `R$ ${ticketMedio.toFixed(2)}` : '—'}</div>
          <div className="abs">pedidos fechados com cupom da roleta</div>
        </div>
      </div>

      {periodoDiferente && (
        <div className="pn-aviso">
          Denominador = <b>{base} pedidos</b> do relatório do iFood de{' '}
          {dataBR(denominador.periodo_inicio)} a {dataBR(denominador.periodo_fim)}.
          Esse período não é o mesmo dos {dias} dias acima — as taxas são uma
          ordem de grandeza, não número fechado. Importe o relatório novo do
          painel do iFood pra fechar a coorte.
        </div>
      )}
      {!base && (
        <div className="pn-aviso">
          Sem relatório do iFood importado: não dá pra calcular as quatro taxas.
          Importe a planilha de vendas no ERP.
        </div>
      )}
    </section>
  );
}

// ─── PRÊMIOS ─────────────────────────────────────────────────────────────────
function Premios({ premios, aoMudar }) {
  const [erro, setErro] = useState('');
  const somaAtivos = premios.filter((p) => p.ativo).reduce((s, p) => s + p.peso, 0);

  async function salvar(id, patch) {
    setErro('');
    const r = await fetch('/api/painel/premio', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    });
    const d = await r.json();
    if (d.erro) setErro(d.mensagem || d.erro);
    aoMudar();
  }

  return (
    <section>
      <h2>Fatias da roleta</h2>
      <div className="pn-rolagem">
        <table>
          <thead>
            <tr>
              <th>Cód</th><th>Prêmio</th><th>O que sai de cortesia</th>
              <th>Peso</th><th>Chance</th><th>Validade</th><th>Ativo</th>
            </tr>
          </thead>
          <tbody>
            {premios.map((p) => (
              <tr key={p.id}>
                <td className="cod">{p.prefixo}</td>
                <td>{p.nome}</td>
                <td style={{ whiteSpace: 'normal', fontSize: 12 }}>
                  {(p.itens_permitidos || []).join(' · ')}
                </td>
                <td>
                  <input
                    className="pn-peso" type="number" min="0" defaultValue={p.peso}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== p.peso) salvar(p.id, { peso: v });
                    }}
                  />
                </td>
                <td>{p.ativo && somaAtivos ? `${((p.peso / somaAtivos) * 100).toFixed(1)}%` : '—'}</td>
                <td>{p.validade_dias}d</td>
                <td>
                  <input
                    type="checkbox" checked={p.ativo}
                    onChange={(e) => salvar(p.id, { ativo: e.target.checked })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {erro && <div className="pn-erro">{erro}</div>}
      <div className="pn-aviso" style={{ marginTop: 12 }}>
        Peso é probabilidade relativa — a chance é o peso dividido pela soma dos
        ativos. Durante a primeira leva de adesivos, não mexa: cada alteração
        reinicia a leitura e nenhuma coorte fecha.
      </div>
    </section>
  );
}

// ─── PÁGINA ──────────────────────────────────────────────────────────────────
export default function Painel() {
  const [autenticado, setAutenticado] = useState(false);
  const [senha, setSenha] = useState('');
  const [erroLogin, setErroLogin] = useState('');
  const [dados, setDados] = useState(null);
  const [dias, setDias] = useState(30);
  const [status, setStatus] = useState('');

  const carregar = useCallback(async () => {
    const p = new URLSearchParams({ dias: String(dias) });
    if (status) p.set('status', status);
    const r = await fetch(`/api/painel/dados?${p}`);
    if (r.status === 401) { setAutenticado(false); return; }
    const d = await r.json();
    if (!d.erro) { setDados(d); setAutenticado(true); }
  }, [dias, status]);

  // Tenta carregar de cara: se o cookie da sessão anterior ainda vale, o
  // atendente não precisa digitar a senha de novo a cada turno.
  useEffect(() => { carregar(); }, [carregar]);

  async function entrar(e) {
    e.preventDefault();
    setErroLogin('');
    const r = await fetch('/api/painel/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha }),
    });
    if (r.ok) { setSenha(''); carregar(); }
    else setErroLogin('Senha incorreta.');
  }

  if (!autenticado) {
    return (
      <div className="pn pn-login">
        <h1>Roleta Chapelão</h1>
        <p className="sub">Painel operacional</p>
        <form onSubmit={entrar}>
          <input
            type="password" value={senha} onChange={(e) => setSenha(e.target.value)}
            placeholder="Senha" autoFocus
            style={{ width: '100%', padding: 14, fontSize: 16, borderRadius: 10,
                     border: '1.5px solid rgba(43,33,24,.2)', fontFamily: 'inherit' }}
          />
          <button className="pn-btn" style={{ width: '100%', marginTop: 12, padding: 14 }}>
            Entrar
          </button>
        </form>
        {erroLogin && <div className="pn-erro">{erroLogin}</div>}
      </div>
    );
  }

  if (!dados) return <div className="pn"><p className="sub">Carregando…</p></div>;

  return (
    <div className="pn">
      <h1>Roleta Chapelão</h1>
      <p className="sub">Painel operacional · dados do mesmo banco do ERP e dos agentes</p>

      <Busca />

      <Taxas
        funil={dados.funil}
        denominador={dados.denominador}
        ticketMedio={dados.ticket_medio}
        dias={dados.periodo_dias}
      />

      <Premios premios={dados.premios} aoMudar={carregar} />

      <section>
        <h2>Leads ({dados.leads.length})</h2>
        <div className="pn-barra">
          <select value={dias} onChange={(e) => setDias(Number(e.target.value))}>
            <option value={7}>7 dias</option>
            <option value={30}>30 dias</option>
            <option value={90}>90 dias</option>
            <option value={365}>1 ano</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos os status</option>
            <option value="gerado">Só válidos</option>
            <option value="resgatado">Só resgatados</option>
            <option value="expirado">Só expirados</option>
          </select>
          <a className="pn-btn claro" href={`/api/painel/csv?dias=${dias}`}
             style={{ textDecoration: 'none', display: 'inline-block' }}>
            Baixar CSV
          </a>
        </div>

        <div className="pn-rolagem">
          <table>
            <thead>
              <tr>
                <th>Código</th><th>Nome</th><th>WhatsApp</th><th>Prêmio</th>
                <th>Status</th><th>Vale até</th><th>Zap</th><th>Lote</th><th>Quando</th>
              </tr>
            </thead>
            <tbody>
              {dados.leads.map((l) => (
                <tr key={l.id}>
                  <td className="cod">{l.codigo}</td>
                  <td>{l.nome}</td>
                  <td>{formatarTelefone(l.telefone)}</td>
                  <td>{l.premio}</td>
                  <td><span className={`pn-tag ${l.status}`}>{l.status}</span></td>
                  <td>{dataBR(l.valido_ate)}</td>
                  <td>{l.clicou_whatsapp ? '✅' : '—'}</td>
                  <td>{l.lote || '—'}</td>
                  <td>{dataBR(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!dados.leads.length && (
          <p className="sub" style={{ marginTop: 14 }}>
            Nenhum lead no período. Se o adesivo já está na rua, olhe a taxa 1.
          </p>
        )}
      </section>
    </div>
  );
}
