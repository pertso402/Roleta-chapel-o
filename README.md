# Roleta de Resgate — Restaurante Chapelão

Landing que captura nome + telefone de quem só existe dentro do iFood e leva
essa pessoa pro WhatsApp com um prêmio na mão.

Adesivo na tampa da marmita → QR → roleta → prêmio → formulário → código →
WhatsApp → agente de atendimento assume.

---

## A decisão que define o projeto

**A roleta não tem tabela própria de prêmio. O prêmio vira um cupom
`tipo='brinde'` em `cupons`** — exatamente o mesmo formato do brinde de quem
vem por anúncio, que já existe e já funciona.

Isso não é economia de tabela, é o que faz o resto funcionar de graça:

| O que precisa acontecer | Quem já faz | Código novo |
|---|---|---|
| Achar o cupom quando o cliente manda mensagem | `buscarCupomAtivoPorTelefone()` no agente de atendimento | nenhum |
| Oferecer a cortesia na conversa | prompt do agente (bloco "BRINDE ATIVO") | nenhum |
| Zerar o preço só do item certo | `precificarPedido()` valida contra `itens_permitidos` | nenhum |
| Dar baixa no cupom ao fechar o pedido | `darBaixaCupom()` | nenhum |
| Não disparar recompra em cima de quem tem prêmio ativo | `campanha_selecionar_leads` exclui quem tem brinde válido | nenhum |
| Perseguir quem não resgatou, depois que o cupom vence | mesma RPC, prioridade 0 (`demonstrou_interesse` + `não comprou`) | nenhum |

**Nenhuma linha muda em `agente-chapelao` nem em `Agente-recompra-chapelao`.**
A roleta é só mais um produtor de cupom de brinde.

O cliente nem digita o código: o agente acha pelo telefone. O código existe
pra ele confiar que ganhou algo real, e pro atendente conferir no balcão.

---

## O detalhe que quebraria tudo em silêncio

`clientes.telefone` guarda o **JID do WhatsApp**, e o WhatsApp no Brasil
**omite o nono dígito para DDD ≥ 31**. No banco de hoje:

```
DDD 44 (Umuarama)  → 12 dígitos → 498 clientes   554498386751
DDD 11 / 19 / 22   → 13 dígitos →  22 clientes   5511953418099
```

O formulário recebe `(44) 99838-6751` — 11 dígitos, com o nove. Gravar isso
com `55` na frente criaria um cliente **duplicado**, o cupom ficaria pendurado
na linha nova, e o agente continuaria consultando a linha antiga pelo JID.
O prêmio simplesmente não apareceria — sem erro no log, sem ninguém descobrir.

Resolvido em dois pontos:

- `lib/telefone.js` grava na convenção do WhatsApp (`telefoneCanonico`);
- a busca usa a RPC `roleta_achar_cliente`, que casa por `tel_chave`
  (DDD + últimos 8 dígitos) — a mesma chave que o resto do sistema já usa,
  e a única imune à ambiguidade.

Testado contra um cadastro real: digitando `(44) 99838-6751` no formulário, a
RPC encontra o cliente gravado como `554498386751` e **não duplica**.

---

## Prêmios

Todos são **cupom de brinde com item real do catálogo**. Cada faixa aceita
vários itens do **mesmo preço**: o cliente escolhe, a margem não varia.

| Fatia | Peso | Chance | Custo | Itens |
|---|---|---|---|---|
| Bebida grátis | 35 | 35% | R$ 4,00 | Refrigerante 200ml Pet |
| Sobremesa grátis | 25 | 25% | R$ 4,00 | Sobremesa 75ml · Chocolate Diversos |
| Refri lata grátis | 20 | 20% | R$ 7,00 | Refrigerante Lata · Coca-Cola Lata · Guaraná Lata |
| Sorvete grátis | 15 | 15% | R$ 7,90 | Guri Sundae · Doce de Leite · Tablete/Shimo/Brigadeiro |
| **Sorvete premium** | 5 | 5% | R$ 11,90 | Guri Nero · Cookie Croc · Leite Trufado |

Custo esperado por resgate: **R$ 5,58**.

Os nomes em `itens_permitidos` precisam bater **exatamente** com
`produtos.nome`. Um nome errado não dá erro: o agente recusa a cortesia em
silêncio e o cliente fica sem o prêmio. Por isso o painel deixa editar peso,
nome e validade, mas **não** os itens.

### Três prêmios da spec original ficaram de fora

Não têm mecânica no motor de preço atual, e implementá-los exige mexer no
agente que hoje atende pedido real:

- **Frete grátis** — `calcularTotais()` não zera taxa por cupom. E a taxa real
  é R$ 11 fixo (não R$ 6/R$ 12): sobre uma marmitex de R$ 19 seria 37% de
  desconto, contra a regra de não abater o preço da marmita.
- **Upgrade de proteína** — é `option_group`, não produto. Não há mecânica.
- **R$ 10 no combo família** — **não existe "combo família" no catálogo**, e
  `desconto_percentual` é percentual, não valor fixo.

---

## Antifraude

- **Sorteio no servidor.** O prêmio é decidido em `/api/girar` e fica preso à
  sessão (`roleta_sessoes.premio_sorteado_id`). O resgate lê o prêmio dali e
  ignora o que vier no corpo da requisição — abrir o DevTools não adianta.
- **Um giro por telefone**, garantido por `UNIQUE` em
  `roleta_resgates.telefone`. Constraint, não `if` no código: não tem corrida.
- **Girar duas vezes na mesma sessão devolve o mesmo prêmio.**
- **Quem já girou vê o código que já tem**, não um erro seco.
- **A anon key não existe neste projeto.** Tudo passa por rota serverless com
  `service_role`. Se a landing pudesse inserir em `cupons` com anon key,
  qualquer pessoa emitiria cortesia com um `fetch`.
- **Rate limit por IP** com hash salgado (conta sem guardar IP, que é dado
  pessoal). Limite folgado de propósito: operadora móvel põe muita gente atrás
  do mesmo IP, e barrar cliente real custa mais que barrar script.

---

## Rodar local

```bash
npm install
cp .env.example .env.local   # preencher
npm run dev                  # http://localhost:3005
```

Landing: `http://localhost:3005/?origem=ifood&lote=001`
Painel: `http://localhost:3005/painel`

## Variáveis de ambiente

| Variável | O que é |
|---|---|
| `SUPABASE_URL` | Projeto `qlswjefuinhbtlhauhgj` (o mesmo do ERP e dos agentes) |
| `SUPABASE_SERVICE_KEY` | **Nunca** prefixar com `NEXT_PUBLIC_` |
| `WHATSAPP_NUMERO` | Só dígitos com DDI, ex `5544999998888` |
| `PAINEL_SENHA` | Senha única do `/painel` |
| `IP_SALT` | String longa e aleatória. Trocar zera o rate limit de todo mundo |

## Deploy (Vercel)

1. `vercel` → novo projeto, framework Next.js detectado sozinho
2. Cadastrar as 5 variáveis acima em Production
3. Apontar o domínio/subdomínio
4. QR do primeiro lote → `https://<dominio>/?origem=ifood&lote=001`

As migrations em `supabase/migrations/` **já foram aplicadas** no projeto de
produção. Estão no repo como registro.

---

## As quatro taxas

O denominador (pedidos iFood entregues) **não é digitado à mão**: vem de
`ifood_relatorio`, que o ERP já importa da planilha do painel do iFood.
Hoje: **107 pedidos entre 16/07 e 14/08** — ~3,5 pedidos/dia.

| # | Taxa | Numerador | Se estiver baixa, mexa em |
|---|---|---|---|
| 1 | Escaneou | `roleta_sessoes` | o adesivo: posição, copy, tamanho do QR |
| 2 | Preencheu | `roleta_resgates` | a roleta e o formulário |
| 3 | Foi pro zap | `clicou_whatsapp` | a tela do código |
| 4 | Resgatou | cupom `usado` | o prêmio e o follow-up do agente |

O painel avisa quando o período do relatório do iFood não cobre o período das
métricas — as taxas viram ordem de grandeza, não número fechado.

**Não mexer em adesivo nem em prêmio durante a primeira leva.** Cada alteração
reinicia a leitura e nenhuma coorte fecha.

---

## Pendências antes de imprimir o lote

- [x] **`WHATSAPP_NUMERO`** = `554437711475` (+55 44 3771-1475)
- [ ] **Testar o `wa.me` desse número.** É um fixo, não um celular. O WhatsApp
      Business aceita fixo (verificação por ligação), mas se a linha não
      estiver registrada, o link abre "número inválido" e o resgate morre no
      último passo. Abrir `https://wa.me/554437711475` no celular resolve a
      dúvida em 10 segundos — e isso precisa acontecer antes de imprimir
      qualquer adesivo.
- [ ] `info_restaurante.whatsapp` no banco continua com o placeholder
      `5511999999999`, e é dele que o **agente de atendimento** tira o número
      que manda pro cliente nos pedidos por PIX. Não alterei porque a descrição
      diz "WhatsApp para pedidos PIX" e pode ser outra linha — confirmar.
- [ ] `PAINEL_SENHA` e `IP_SALT` de produção
- [ ] Domínio/subdomínio
- [ ] **Rotacionar a `service_role` key** — foi compartilhada em texto puro
- [ ] Teste em celular real, com o QR impresso, antes do lote inteiro

## Estrutura

```
app/
  page.js                    roleta + revelação + formulário + código
  painel/page.js             busca por código, 4 taxas, leads, fatias
  api/
    sessao/                  abre sessão, devolve as fatias (métrica 1)
    girar/                   sorteia no servidor, prende o prêmio na sessão
    resgatar/                cria cliente + cupom (o ponto de captura)
    whatsapp-click/          métrica 3, gravada ANTES do redirect
    painel/                  login, dados, premio, baixa, csv
lib/
  telefone.js                convenção do nono dígito (o arquivo delicado)
  sorteio.js                 sorteio ponderado + ângulo de parada
  supabase.js                integração com clientes/cupons do ERP
  painel-auth.js             sessão do painel por HMAC
supabase/migrations/         schema + RPC (já aplicadas em produção)
```
