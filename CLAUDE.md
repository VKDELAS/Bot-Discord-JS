# CLAUDE.md — MS-13 Bot | Discord.js v14
> Leia este arquivo INTEIRO antes de escrever qualquer linha de código.
> Este é o guia de contexto e convenções do projeto para o Claude.

---

## 🧠 CONTEXTO DO PROJETO

Bot Discord em **Discord.js v14 + Node.js** para servidor de roleplay **MTA (Multi Theft Auto)** da facção **MS-13**.

| Item | Detalhe |
|---|---|
| Linguagem | Node.js + Discord.js v14 |
| Hosting | Discloud — deploy via `git push origin main` |
| Ponto de entrada | `index.js` (raiz) |
| Token | `TOKEN_MS13` no `.env` — NUNCA commitar |
| Guild ID | `GUILD_ID` no `.env` — NUNCA commitar |
| Banco de dados | SQLite (`better-sqlite3`) + JSON para estado leve |
| Components V2 | ✅ **USAR EM TUDO** — Agora permitido e obrigatório em todas as interfaces principais. |

---

## 📁 ESTRUTURA COMPLETA DO PROJETO

```
ms13-bot/
├── index.js                        ← Entry point. Carrega commands, systems, events, DB
├── package.json
├── discloud.config
├── .env                            ← TOKEN_MS13 + GUILD_ID — nunca commitar
├── .gitignore
├── CLAUDE.md                       ← Este arquivo
├── MIGRATION.md                    ← Histórico de migração Python → JS
│
├── data/                           ← Arquivos de dados em runtime (todos no .gitignore)
│   ├── .gitkeep
│   ├── metas_data.json             ← Estado das metas (gerado em runtime)
│   ├── registros.json              ← Registros de ações (gerado em runtime)
│   ├── multas_processadas.json     ← IDs já processados do loop (gerado em runtime)
│   └── rec_config.json             ← Config de recrutamento (gerado em runtime)
│
├── transcripts/                    ← HTMLs gerados no fechamento de tickets (.gitignore)
│
└── src/
    ├── config/
    │   └── settings.js             ← ⚠️ TODAS AS CONSTANTES DO BOT — VER SEÇÃO ABAIXO
    │
    ├── database/
    │   └── manager.js              ← SQLite (better-sqlite3, síncrono) + helpers JSON
    │
    ├── utils/
    │   ├── helpers.js              ← Funções utilitárias: fmtBr, getRoleCategory, etc.
    │   └── logger.js               ← Logger visual ANSI sem dependências externas
    │
    ├── events/
    │   ├── ready.js                ← Registra slash commands, inicia loops, adv de meta
    │   └── interactionCreate.js    ← Roteador central: slash → cmd, componentes → system
    │
    ├── systems/                    ← Handlers de componentes (botões, selects, modais)
    │   ├── membros.js              ← MemberPanel: ATM, Loja, Craco, AFK, Corrida, Ausência, Registradora, Kill
    │   ├── gerencia.js             ← ManagerPanel: Advertências + Exoneração + Blacklist
    │   ├── registros.js            ← ConfirmaçãoView + loop de multas (verificar_multas_vencidas_loop)
    │   ├── tickets.js              ← CentralTicketsView (Components V2) + abertura/fechamento de tickets
    │   ├── metas.js                ← PainelView (9 botões) + EntregarMetaView + adv automática
    │   ├── recrutamento.js         ← TicketRecView (9 botões) + ranking + formulário dinâmico SQLite
    │   └── transcript.js           ← Geração de HTML transcript ao fechar ticket
    │
    └── commands/                   ← Slash commands
        ├── geral.js                ← /iniciar, /atualizar-paineis, /status-bot
        ├── metas.js                ← /meta-status
        ├── recrutamento.js         ← /painel-formulario, /enviar-msgs-rec, /sincronizar-top-rec,
        │                              /resetar-rec-rank, /resetar-top-rec, /criar-canal-ticket
        └── registros.js            ← /ver-registros
```

---

## ⚙️ settings.js — O ARQUIVO MAIS IMPORTANTE

> **`src/config/settings.js` é a fonte da verdade de TODAS as constantes.**
> Nunca hard-code IDs, cores ou textos em outros arquivos — sempre importe de settings.

```js
// IMPORTAR SEMPRE ASSIM:
const {
  BR_TZ, META_VALOR, ROLES, ROLE_NAMES, MS13_ROLE_ID,
  CANAIS_METAS_IDS, CHANNEL_IDS, ROLE_IDS, ALL_STAFF_IDS,
  ADV_CARGO_IDS, CIDADAO_LOW_ID, LOG_PD_CHANNEL_ID,
  CANAL_REGISTROS_ACOES_ID, REGISTROS_ACOES_FILE,
  PRODUTOS_META_LISTA, PRODUTOS_META_CURTO, META_ROTAS_PRODUTO,
  COLOR_MS13, COLOR_SUCCESS, COLOR_ERROR, COLOR_WARNING, COLOR_INFO, COLOR_REC,
  FOOTER_TEXT, REC_DB, REC_CONFIG_FILE, REC_CHANNEL_IDS, _PERM_TICKET_ROLE_ID,
} = require('../config/settings.js')
```

### Constantes críticas (referência rápida)

```js
BR_TZ      = 'America/Sao_Paulo'
META_VALOR = 70_000

ROLES = {
  isento:  ['1469085061373628437','1471295287896178892','1469085227757605002',
             '1469085338046697572','1469085446108741780','1469131886533017671'],
  elite:   ['1471297185227346183','1471297000845742292','1477356816366047445'],
  membro:  ['1471296434505646110','1471296807349911604','1471295722937647239','1469085564920795371'],
}

ROLE_NAMES = {
  '1469085061373628437': 'Diretoria',       '1471295287896178892': 'Gerente Geral',
  '1469085227757605002': 'Resp. Recrutamentos', '1469085338046697572': 'Resp. Farm',
  '1469085446108741780': 'Resp. Elite',     '1469131886533017671': 'Elite',
  '1477356816366047445': 'Corredor',        '1471297185227346183': 'Linha de Frente',
  '1471297000845742292': 'Conselheiro',     '1471296434505646110': 'Soldado',
  '1471296807349911604': 'Associado',       '1471295722937647239': 'Morador',
  '1469085564920795371': 'MS-13',
}

MS13_ROLE_ID = '1469085564920795371'

CANAIS_METAS_IDS = {
  painel:    '1487240067121549332',
  entregar:  '1487240068757323848',
  entregues: '1487240069705367642',
  relatorio: '1487240071760449596',
}

CHANNEL_IDS = {
  central_tickets:   '1488504060117123084',
  central_registros: '1487024883626938570',
  central_gerencia:  '1487025285340598322',
  logs_recrutamento: '1483674983887667250',
  logs_geral:        '1483674982281383987',
  logs_kill:         '1486079782360977449',
  logs_atm:          '1486079791160492193',
  logs_loja:         '1486079792863383833',
  logs_craco:        '1486079794268602542',
  logs_afk:          '1486079795686015198',
  logs_corrida:      '1486079796982059148',
  logs_ausencia:     '1486079806587015259',
  logs_meta:         '1483674988795138179',
  logs_registros:    '1486086098869555200',
  logs_adv_gerencia: '1487601111354445844',
  pub_adv:           '1487547728358543530',
  pub_ausentes:      '1469093874029826261',
  pub_atm:           '1487612607732125877',
  pub_kill:          '1487612854306603098',
}

ROLE_IDS = {
  lider:      '1469085061373628437',
  sub_lider:  '1471295287896178892',
  recrutador: '1469085227757605002',
  membro:     '1471295722937647239',
  meta_paga:  '1486403263657152674',
  etapa2:     '1469086279613288741',
}

ADV_CARGO_IDS = {
  1: '1503910937625890996',
  2: '1503911714318450698',
  3: '1503911868316647588',
}

CIDADAO_LOW_ID            = '1469087056235073669'
LOG_PD_CHANNEL_ID         = '1504183029965520996'
CANAL_REGISTROS_ACOES_ID  = '1504162046206410793'
REGISTROS_ACOES_FILE      = 'registros.json'

COLOR_MS13    = 0x0000FF
COLOR_SUCCESS = 0x2ECC71
COLOR_ERROR   = 0xE74C3C
COLOR_WARNING = 0xF39C12
COLOR_INFO    = 0x3498DB
COLOR_REC     = 0x9B59B6
FOOTER_TEXT   = 'MS-13 Roleplay © Todos os direitos reservados'

REC_DB          = 'ms13_recrutamento.db'
REC_CONFIG_FILE = 'rec_config.json'
REC_CHANNEL_IDS = {
  painel_formulario:   '1488347348756332685',
  relatorio_rec:       '1488347471230013510',
  recrutadores:        '1488347411784007690',
  top_tickets:         '1488347411784007690',
  blacklist:           '1488347509599502356',
  logs_relatorios_rec: '1492865227908317324',
  categoria_rec:       '0',
}
_PERM_TICKET_ROLE_ID = '1478161626187432077'
```

---

## 🎨 PADRÕES DE MENSAGEM

### ✅ Components V2 — **USAR EM TUDO**

Diferente de projetos anteriores, agora **Components V2** deve ser utilizado em todas as interfaces principais. Existem dois estilos principais que podem ser usados dependendo da necessidade da tarefa:

#### 1. Estilo "Central / Página" (Com Banner e Select)
Ideal para painéis informativos, centrais de atendimento ou qualquer mensagem que precise de um visual de "página de sistema".

```js
const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags } = require('discord.js');

const container = new ContainerBuilder()
  .setAccentColor(COLOR_MS13)
  .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ATENDIMENTO MS-13'))
  .addSeparatorComponents(new SeparatorBuilder())
  .addTextDisplayComponents(new TextDisplayBuilder().setContent(
    'Selecione abaixo a categoria que melhor descreve o seu atendimento.'
  ))
  .addSeparatorComponents(new SeparatorBuilder())
  .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder().setURL(BANNER_URL)
  ))
  .addActionRowComponents(new ActionRowBuilder().addComponents(selectMenu))
  .addSeparatorComponents(new SeparatorBuilder())
  .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# © MS-13 Roleplay • Rodapé'));

await channel.send({ components: [container], flags: MessageFlags.IsComponentsV2 });
```

#### 2. Estilo "Tabela / Informação" (Mensagem de Abertura)
Ideal para mensagens de status, logs visuais ou a mensagem que aparece logo que um ticket é aberto. Organiza os dados de forma limpa e direta.

```js
const containerTicket = new ContainerBuilder()
  .setAccentColor(COLOR_MS13)
  .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🎫 NOVO TICKET'))
  .addSeparatorComponents(new SeparatorBuilder())
  .addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `**👤 Usuário:** <@${userId}>\n` +
    `**📂 Categoria:** ${tipo}\n` +
    `**📝 Motivo:** ${motivo}`
  ))
  .addSeparatorComponents(new SeparatorBuilder())
  .addTextDisplayComponents(new TextDisplayBuilder().setContent(
    'Aguarde um membro da nossa equipe assumir o seu atendimento.'
  ))
  .addActionRowComponents(new ActionRowBuilder().addComponents(botaoAceitar, botaoFechar));

await channel.send({ components: [containerTicket], flags: MessageFlags.IsComponentsV2 });
```

> **Nota:** A escolha entre o estilo 1 ou 2 deve ser feita com base no que for mais adequado para a funcionalidade que está sendo desenvolvida no momento.

---

### ✅ COM EMBED — quando usar

Use `EmbedBuilder` para:
- Logs de ações (advertências, exonerações, kills, registros)
- Relatórios e status (`/meta-status`, `/status-bot`, `/ver-registros`)
- Painéis informativos persistentes (central_gerencia, central_registros)
- Confirmações de aprovação/reprovação no recrutamento
- Transcrições e DMs de encerramento de ticket

**Estrutura padrão de embed:**

```js
const { EmbedBuilder } = require('discord.js')
const { COLOR_MS13, FOOTER_TEXT } = require('../config/settings.js')

const embed = new EmbedBuilder()
  .setColor(COLOR_MS13)              // Sempre uma cor de settings
  .setTitle('🔰 Título da Ação')
  .setDescription(
    '> Linha de descrição principal.\n' +
    '> Segunda linha se necessário.'
  )
  .addFields(
    { name: '👤 Membro',    value: `<@${userId}>`,      inline: true },
    { name: '⚙️ Executor', value: `<@${executorId}>`,   inline: true },
    { name: '📝 Motivo',   value: motivo,                inline: false },
  )
  .setFooter({ text: FOOTER_TEXT })
  .setTimestamp()

// Envio:
await channel.send({ embeds: [embed] })
await interaction.reply({ embeds: [embed], ephemeral: true })
await interaction.editReply({ embeds: [embed] })
```

**Regras de embed:**
- `setColor()` sempre usa constante de `settings.js` (nunca hex literal)
- `setFooter({ text: FOOTER_TEXT })` obrigatório
- `setTimestamp()` obrigatório em logs
- Campos inline: no máximo 3 por linha
- Descrição usa `>` blockquote para linhas de destaque
- Título começa com emoji relevante

---

### ✅ SEM EMBED — quando usar (markdown nativo Discord)

Use **content puro** (sem embed) para:
- Feedbacks rápidos e efêmeros (`interaction.reply({ content: '✅ Feito!', ephemeral: true })`)
- Lembretes e anúncios simples no canal
- Conteúdo informativo dentro de tickets que não precisa de log

**Estrutura padrão sem embed (markdown nativo):**

```js
// Títulos com #, ##, ### — renderizam como headers no Discord
// Blockquotes com > — recuo visual elegante
// Negrito com **texto**
// Código inline com `texto`

const content =
  `# 🎖️ MS-13 — Título Principal\n` +
  `Descrição geral da mensagem.\n\n` +
  `> **Campo:** valor\n` +
  `> **Outro campo:** outro valor\n\n` +
  `## 📌 Subtítulo\n\n` +
  `> **Passo 1**\n` +
  `> Descrição do passo.\n\n` +
  `> **Passo 2**\n` +
  `> Descrição do passo.\n\n` +
  `## ⚠️ Avisos\n\n` +
  `> Aviso importante aqui.\n` +
  `-# © MS-13 Roleplay • rodapé discreto`

// Envio:
await channel.send({ content })
await interaction.reply({ content, ephemeral: true })
await interaction.editReply({ content })
```

**Regras de content:**
- `#` = título grande (equivale a H1)
- `##` = subtítulo (H2)
- `>` = blockquote para campos e avisos
- `-#` = subtext (texto menor, para rodapé)
- Nunca misturar embed + content rico no mesmo envio (escolha um)
- Emojis no início de seções para escaneabilidade

---

## 🚨 REGRAS CRÍTICAS — NUNCA ESQUECER

1. **IDs como string** — sempre strings simples, nunca BigInt
   ```js
   guild.roles.cache.get('1469085061373628437')  // ✅
   guild.roles.cache.get(1469085061373628437n)    // ❌
   ```

2. **Nunca alterar `customId`** — mensagens antigas no Discord têm esses IDs gravados, alterar quebra todos os botões existentes

3. **`better-sqlite3` é síncrono** — NUNCA usar `await` em queries SQLite
   ```js
   const row = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id)  // ✅
   const row = await db.prepare('SELECT * FROM tickets WHERE id = ?').get(id)  // ❌
   ```

4. **Imports circulares** — `gerencia → registros` e `metas → registros` são circulares. Importar DENTRO da função, não no topo do arquivo
   ```js
   // ✅ Correto — dentro da função
   async function aplicarAdv() {
     const { registrarAdvertencia } = require('./registros.js')
     // ...
   }

   // ❌ Errado — no topo do arquivo
   const { registrarAdvertencia } = require('./registros.js')
   ```

5. **Erro 40060** — interaction já respondida. Sempre verificar antes de responder
   ```js
   if (interaction.replied || interaction.deferred) return
   ```

6. **`selectContextMap` é compartilhado** — usar Map com `userId` como chave para guardar contexto entre steps
   ```js
   selectContextMap.set(interaction.user.id, { type: 'adv', targetId, targetTag })
   const ctx = selectContextMap.get(interaction.user.id)
   selectContextMap.delete(interaction.user.id)  // sempre limpar após uso
   ```

7. **Components V2 em TUDO** — Obrigatório para painéis e mensagens de ticket. Usar `MessageFlags.IsComponentsV2`.

8. **Verificação obrigatória antes de entregar** — revisar todos os imports, exports e customIds

---

## 📦 SISTEMAS — resumo de cada arquivo

### `src/systems/membros.js`
- Painel de 8 botões: ATM, Loja, Craco, AFK, Corrida, Ausência, Registradora, Kill
- Tipos com parceiros usam `UserSelectMenu` antes do modal
- `selectContextMap` com chave `userId_tipo_users`
- Logs vão para `CHANNEL_IDS[logs_*]` e `pub_*` conforme o tipo

### `src/systems/gerencia.js`
- 2 botões: Advertência + Exoneração
- Flow: botão → UserSelect → confirmar → Modal → ação
- `ADV_CARGO_IDS {1, 2, 3}` — 3ª adv dispara expulsão automática
- Após exoneração: prompt de blacklist (`bl_sim_v14` / `bl_nao_v14`)
- `selectContextMap` com chave `userId`

### `src/systems/registros.js`
- 2 botões: Confirmar Advs + Confirmar Metas
- Loop `iniciarLoopMultas(client)` — roda a cada 5 min, verifica `LOG_PD_CHANNEL_ID`
- Multa > R$1.000.000 → aplica cargo `CIDADAO_LOW_ID`
- Deduplicação via `multas_processadas.json`

### `src/systems/tickets.js`
- `CentralTicketsView` usa **Components V2** com `MessageFlags.IsComponentsV2`
- 4 tipos: Recrutamento, Suporte, Elite, Parceria
- Recrutamento: cria canal direto (sem modal)
- Suporte/Elite/Parceria: modal → cria canal
- Timer de inatividade: 1h30 (5400s)
- Ao fechar: chama `gerarEEnviarTranscript()` e deleta canal após 3s
- `ticketContextMap` com chave `canal.id`

### `src/systems/metas.js`
- 9 botões no painel (staff): Solicitar, Lembrete, Prazo, Isentar, Cancelar, Relatório, Resetar, Ver Isentos, Toggle Modo
- 1 botão no canal de entrega (membros): Entregar Meta
- `ap_userId` / `re_userId` — customIds dinâmicos para aprovar/recusar
- `aguardarEAplicarAdv(guild, prazoDt)` — aplica advertência automática ao vencer prazo
- Estado em memória (`metaAtiva`, `advTimeout`) — reseta ao reiniciar o bot

### `src/systems/recrutamento.js`
- Painel formulário: gerencia perguntas no SQLite (add/edit/remove/view/export)
- `rec_gerar_tkt` — cria canal de ticket automaticamente
- Entrevista: `_conduzirEntrevista()` — coleta respostas das perguntas em sequência
- `rec_aprovar_m` → modal com nome IC + ID MTA → aplica cargos + nick
- Ranking atualizado automaticamente após aprovação
- DB: `ms13_recrutamento.db` com tabelas `recrutamentos`, `blacklist`, `perguntas`

### `src/systems/transcript.js`
- Exporta `gerarEEnviarTranscript(channel, fechadoPor, msgInicialBackup?)`
- Coleta todas as mensagens do canal (paginação de 100)
- Gera HTML completo com estilo Discord-like
- Envia via DM para o dono do ticket
- Fallback: se DM bloqueada, tenta enviar no próprio canal
- Remove arquivo local após envio

---

## 🗄️ DATABASE — `src/database/manager.js`

### JSONs (para estado leve)

| Função | Arquivo | Uso |
|---|---|---|
| `loadData()` / `saveData(data)` | `data/metas_data.json` | Estado de metas por userId |
| `loadRegistros()` / `saveRegistro(entry)` | `data/registros.json` | Log de ações da facção |
| `loadMultasProcessadas()` / `salvarMultaProcessada(id)` | `data/multas_processadas.json` | IDs de mensagens já processadas |
| `loadRecConfig()` / `saveRecConfig(data)` | `data/rec_config.json` | Config do sistema de rec |

### SQLite — `ms13_recrutamento.db`

| Função | Descrição |
|---|---|
| `recInitDb()` | Cria todas as tabelas + perguntas padrão se vazias |
| `recGetTicket(ticketId)` | Busca ticket por ID |
| `recCreateTicket(ticketId, userId, criadoEm)` | Cria novo registro de ticket |
| `recUpdateTicketStatus(ticketId, status, extra)` | Atualiza status |
| `recSalvarResposta(ticketId, pergunta, resposta)` | Salva resposta do formulário |
| `recGetRespostas(ticketId)` | Busca todas as respostas |
| `recGetPerguntas()` | Lista perguntas ativas ordenadas |
| `recGetBlacklist(userId)` | Verifica se usuário está na blacklist |
| `recAddBlacklist(userId, motivo, adicionado)` | Adiciona à blacklist |
| `recRemoveBlacklist(userId)` | Remove da blacklist |
| `recGetRecrutador(userId)` | Busca dados do recrutador |
| `recUpsertRecrutador(userId, nome, ultimaAcao)` | Cria ou incrementa total do recrutador |
| `recGetTopRecrutadores(limit)` | Top N recrutadores por total |
| `recSalvarAvaliacao(...)` | Salva avaliação de ticket |
| `recGetConfig(chave)` / `recSetConfig(chave, valor)` | KV store genérico |

---

## 📡 EVENTS

### `src/events/ready.js`
1. Registra slash commands via REST na guild (`GUILD_ID` do `.env`)
2. Inicia `iniciarLoopMultas(client)` de `registros.js`
3. Chama `aguardarEAplicarAdv(client)` de `metas.js`
4. Loga status final via `logger.online({...})`

### `src/events/interactionCreate.js`
- Slash commands → `client.commands.get(name).execute(interaction, client)`
- Componentes → match **exato** no `systemHandlers` Map primeiro
- Fallback por **prefixo** (`ap_`, `re_`, `rec_`, `modal_`, `ticket_`, `reg_`, `meta_`, `ger_`, `sel_`, `sup_`, `eli_`, `par_`)
- Nunca coloca lógica de negócio aqui — apenas roteia

---

## ⌨️ SLASH COMMANDS

| Comando | Arquivo | Permissão |
|---|---|---|
| `/iniciar` | `geral.js` | Administrator |
| `/atualizar-paineis` | `geral.js` | Administrator |
| `/status-bot` | `geral.js` | Administrator |
| `/meta-status [membro]` | `metas.js` | Administrator |
| `/painel-formulario` | `recrutamento.js` | Administrator |
| `/enviar-msgs-rec` | `recrutamento.js` | Administrator |
| `/sincronizar-top-rec` | `recrutamento.js` | Administrator |
| `/resetar-rec-rank` | `recrutamento.js` | Administrator |
| `/resetar-top-rec` | `recrutamento.js` | Administrator |
| `/criar-canal-ticket` | `recrutamento.js` | Administrator |
| `/ver-registros` | `registros.js` | Administrator |

---

## 📦 DEPENDÊNCIAS

```json
{
  "dependencies": {
    "discord.js": "^14.26.4",
    "better-sqlite3": "^12.10.0",
    "dotenv": "^16.6.1",
    "moment-timezone": "^0.5.48"
  },
  "devDependencies": {
    "nodemon": "^3.1.0"
  }
}
```

---

## 🚀 DEPLOY

```
# discloud.config
NAME=MS13Bot
TYPE=bot
MAIN=index.js
RAM=512
AUTORESTART=true
VERSION=latest
```

```
# .gitignore
.env
*.db
node_modules/
multas_processadas.json
metas_data.json
registros.json
rec_config.json
transcripts/
```

**Fluxo de deploy:**
```bash
git add .
git commit -m "feat: descrição"
git push origin main   # Discloud faz o deploy automaticamente
```

---

## ✅ CHECKLIST PÓS-IMPLEMENTAÇÃO

Antes de dar push, verificar:

- [ ] `npm install` sem erros
- [ ] `node index.js` sem erros de sintaxe
- [ ] `GUILD_ID` e `TOKEN_MS13` no `.env`
- [ ] Slash commands aparecem no Discord após `/iniciar` ou restart
- [ ] Components V2 renderizando corretamente em painéis e tickets
- [ ] Botões funcionam após restart do bot
- [ ] Nenhum `customId` foi alterado em mensagens já postadas
- [ ] Nenhum `await` em queries `better-sqlite3`
- [ ] Imports circulares estão dentro das funções, não no topo
- [ ] `selectContextMap.delete()` chamado após uso para evitar memory leak
