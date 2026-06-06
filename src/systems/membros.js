// src/systems/membros.js — Painel de Membros MS-13
'use strict'

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, EmbedBuilder,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
  MessageFlags,
} = require('discord.js')

const {
  CHANNEL_IDS, CANAL_REGISTROS_ACOES_ID,
  COLOR_MS13, COLOR_SUCCESS, COLOR_ERROR, COLOR_WARNING, FOOTER_TEXT,
} = require('../config/settings.js')

const selectContextMap = new Map()

// ─── CUSTOM IDs ───────────────────────────────────────────────────────────────
const customIds = [
  'mp_atm', 'mp_loja', 'mp_craco', 'mp_afk', 'mp_corrida', 'mp_ausencia', 'mp_registradora', 'mp_kill',
  'select_registro_atm_v13', 'select_registro_loja_v13', 'select_registro_registradora_v13',
  'cont_select_v13',
  'modal_registro_atm', 'modal_registro_loja', 'modal_registro_craco', 'modal_registro_afk',
  'modal_registro_corrida', 'modal_ausencia', 'modal_registro_registradora', 'modal_registro_kill',
]

const BUTTON_TO_TYPE = {
  mp_atm: 'atm', mp_loja: 'loja', mp_craco: 'craco', mp_afk: 'afk',
  mp_corrida: 'corrida', mp_ausencia: 'ausencia', mp_registradora: 'registradora', mp_kill: 'kill',
}

const SELECT_TO_TYPE = {
  select_registro_atm_v13: 'atm', select_registro_loja_v13: 'loja',
  select_registro_registradora_v13: 'registradora',
  // craco REMOVIDO — vai direto pro modal, sem select de parceiros
}

const REGISTRO_CONFIG = {
  atm:          { label: '🏧 Registro ATM',          modalId: 'modal_registro_atm',          selectId: 'select_registro_atm_v13',          maxSelect: 1, comParceiro: true,  logChannels: ['logs_atm', 'pub_atm'] },
  loja:         { label: '🏪 Registro Loja',         modalId: 'modal_registro_loja',         selectId: 'select_registro_loja_v13',         maxSelect: 3, minSelect: 2, comParceiro: true,  logChannels: ['logs_loja'] },
  craco:        { label: '🌿 Registro Craco',        modalId: 'modal_registro_craco',        comParceiro: false, logChannels: ['logs_craco'] },
  afk:          { label: '💤 Registro AFK',          modalId: 'modal_registro_afk',          comParceiro: false, logChannels: ['logs_afk'] },
  corrida:      { label: '🏎️ Registro Corrida',     modalId: 'modal_registro_corrida',      comParceiro: false, logChannels: ['logs_corrida'] },
  ausencia:     { label: '📅 Registro Ausência',     modalId: 'modal_ausencia',              comParceiro: false, logChannels: ['logs_ausencia', 'pub_ausentes'] },
  registradora: { label: '🏦 Registro Registradora', modalId: 'modal_registro_registradora', selectId: 'select_registro_registradora_v13', maxSelect: 1, comParceiro: true, logChannels: [] },
  kill:         { label: '💀 Registro Kill',         modalId: 'modal_registro_kill',         comParceiro: false, logChannels: ['logs_kill'] },
  // pub_kill REMOVIDO — kill só vai pro canal de logs privado
}

// ─── NORMALIZAÇÃO DE INPUTS ───────────────────────────────────────────────────

/**
 * Normaliza um valor monetário digitado de qualquer jeito para R$ X.XXX
 * Aceita: 30k, 30K, 30.000, 30,000, R$30000, 30 000, 30.5k, etc.
 * Retorna null se não for possível interpretar como número.
 */
function normalizarDinheiro(raw) {
  if (!raw || typeof raw !== 'string') return null
  let s = raw.trim().replace(/r\$\s*/gi, '').replace(/\s/g, '')

  // multiplicador k/K — ex: 30k, 1.5k
  const kMatch = s.match(/^([\d.,]+)k$/i)
  if (kMatch) {
    const num = parseFloat(kMatch[1].replace(',', '.'))
    if (isNaN(num)) return null
    return formatarDinheiro(Math.round(num * 1000))
  }

  // Rejeita qualquer string que contenha letras (ex: "30reais", "abc")
  if (/[a-zA-Z]/.test(s)) return null

  // remove separadores de milhar
  let cleaned
  const hasDot   = s.includes('.')
  const hasComma = s.includes(',')

  if (hasDot && hasComma) {
    if (s.indexOf('.') < s.indexOf(',')) {
      cleaned = s.replace(/\./g, '').replace(',', '.')
    } else {
      cleaned = s.replace(/,/g, '')
    }
  } else if (hasComma) {
    const afterComma = s.split(',')[1] ?? ''
    cleaned = afterComma.length === 3 ? s.replace(',', '') : s.replace(',', '.')
  } else if (hasDot) {
    const afterDot = s.split('.')[1] ?? ''
    cleaned = afterDot.length === 3 ? s.replace('.', '') : s
  } else {
    cleaned = s
  }

  const num = parseFloat(cleaned)
  if (isNaN(num) || num <= 0) return null
  return formatarDinheiro(Math.round(num))
}

function formatarDinheiro(n) {
  return 'R$ ' + n.toLocaleString('pt-BR')
}

/**
 * Normaliza data/hora no formato DD/MM/AAAA HH:MM ou DD/MM/AAAA
 * Aceita separadores variados (- . /), hora com ou sem minutos, etc.
 * Retorna null se inválido ou contiver letras onde não devia.
 */
function normalizarDataHora(raw, somenteData = false) {
  if (!raw || typeof raw !== 'string') return null
  const s = raw.trim()

  if (somenteData) {
    // espera apenas DD/MM/AAAA
    const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/)
    if (!m) return null
    const [, d, mo, a] = m
    const ano = a.length === 2 ? '20' + a : a
    if (!dataValida(+d, +mo, +ano)) return null
    return `${pad(d)}/${pad(mo)}/${ano}`
  }

  // DD/MM/AAAA HH:MM ou DD/MM/AAAA HH:MM:SS
  const mDT = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})[T\s]+(\d{1,2})[\:\.](\d{2})(?:[\:\.](\d{2}))?$/)
  if (mDT) {
    const [, d, mo, a, h, mi] = mDT
    const ano = a.length === 2 ? '20' + a : a
    if (!dataValida(+d, +mo, +ano)) return null
    if (+h > 23 || +mi > 59) return null
    return `${pad(d)}/${pad(mo)}/${ano} ${pad(h)}:${pad(mi)}`
  }

  // só hora HH:MM
  const mH = s.match(/^(\d{1,2})[\:\.](\d{2})$/)
  if (mH) {
    const [, h, mi] = mH
    if (+h > 23 || +mi > 59) return null
    return `${pad(h)}:${pad(mi)}`
  }

  return null
}

function pad(n) { return String(n).padStart(2, '0') }

function dataValida(d, m, a) {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  const dt = new Date(a, m - 1, d)
  return dt.getFullYear() === a && dt.getMonth() === m - 1 && dt.getDate() === d
}

/**
 * Valida e normaliza dinheiro. Retorna { ok, valor, erro }.
 */
function parseDinheiro(raw) {
  const norm = normalizarDinheiro(raw)
  if (norm) return { ok: true, valor: norm }
  return { ok: false, valor: raw, erro: `❌ **Valor inválido:** \`${raw}\`\nUse apenas números. Ex: \`15000\`, \`15.000\`, \`15k\`, \`R$ 15.000\`` }
}

/**
 * Valida e normaliza data/hora. Retorna { ok, valor, erro }.
 */
function parseDataHora(raw, somenteData = false) {
  if (!raw) return { ok: true, valor: null }
  const norm = normalizarDataHora(raw, somenteData)
  if (norm) return { ok: true, valor: norm }
  const fmt = somenteData ? 'DD/MM/AAAA (ex: `25/01/2026`)' : 'DD/MM/AAAA HH:MM (ex: `25/01/2026 21:30`)'
  return { ok: false, valor: raw, erro: `❌ **Data/hora inválida:** \`${raw}\`\nUse o formato ${fmt}` }
}

/**
 * Valida campo numérico inteiro. Retorna { ok, valor, erro }.
 */
function parseInteiro(raw, label) {
  if (!raw) return { ok: false, valor: raw, erro: `❌ **${label} inválido:** campo obrigatório.` }
  const n = parseInt(raw.trim(), 10)
  if (isNaN(n) || !/^\d+$/.test(raw.trim())) {
    return { ok: false, valor: raw, erro: `❌ **${label} inválido:** \`${raw}\`\nUse apenas números inteiros. Ex: \`5\`` }
  }
  return { ok: true, valor: String(n) }
}

/**
 * Monta mensagem de erro consolidada e responde ao interaction.
 */
async function responderErro(interaction, erros) {
  const msg = erros.filter(Boolean).join('\n\n')
  return interaction.reply({ content: msg, ephemeral: true })
}

// ─── PAINEL V2 (Components V2) ────────────────────────────────────────────────

function buildMembrosV2() {
  const container = new ContainerBuilder()
    .setAccentColor(COLOR_MS13)

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '# 🔫 MS-13 — Painel de Membros\n' +
      '-# Sistema de registro de atividades da facção'
    )
  )

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(2))

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '## 💰 Farm & Dinheiro\n' +
      '> **🏧 ATM** — Registre retiradas de caixas eletrônicos. Selecione parceiros envolvidos.\n' +
      '> **🏪 Loja** — Registre assaltos a lojas. Informe produto, quantidade e valor.\n' +
      '> **🏦 Registradora** — Registre ações na registradora. Selecione parceiros.'
    )
  )

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mp_atm').setLabel('🏧 ATM').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('mp_loja').setLabel('🏪 Loja').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('mp_registradora').setLabel('🏦 Registradora').setStyle(ButtonStyle.Primary),
    )
  )

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(1))

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '## ⚡ Produção & Ação\n' +
      '> **🌿 Craco** — Registre produções de drogas. Informe quantidade e selecione parceiros.\n' +
      '> **🏎️ Corrida** — Registre participações em corridas. Informe rota e valor ganho.\n' +
      '> **💀 Kill** — Registre eliminações. Informe vítima(s) e motivo do abate.'
    )
  )

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mp_craco').setLabel('🌿 Craco').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('mp_corrida').setLabel('🏎️ Corrida').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('mp_kill').setLabel('💀 Kill').setStyle(ButtonStyle.Danger),
    )
  )

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(1))

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '## 📋 Disponibilidade\n' +
      '> **💤 AFK** — Notifique saídas temporárias durante atividade. Informe motivo e tempo.\n' +
      '> **📅 Ausência** — Registre afastamentos programados. Informe datas e motivo.'
    )
  )

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mp_afk').setLabel('💤 AFK').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('mp_ausencia').setLabel('📅 Ausência').setStyle(ButtonStyle.Secondary),
    )
  )

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(2))

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '> ⚠️ **Atenção:** Sempre envie prints válidos via [Imgur](https://imgur.com). ' +
      'Registros sem comprovante podem ser **invalidados**. ' +
      'Registros falsos resultam em **advertência ou exoneração**.\n' +
      `-# ${FOOTER_TEXT}`
    )
  )

  return { components: [container], flags: (1 << 15) }
}

// ─── COMPAT: mantidas para não quebrar imports existentes ────────────────────

function buildEmbedMembros() { return null }
function buildMemberPanelRows() { return [] }

// ─── MODAIS ───────────────────────────────────────────────────────────────────

function buildModal(tipo) {
  const cfg = REGISTRO_CONFIG[tipo]
  const modalMap = {
    atm:          { fields: [['atm_data','Data e Hora (ex: 25/01/2026 21:30)',0,true],['atm_valor','Valor Obtido (ex: R$ 15.000)',0,true],['atm_print','Link da Print (Imgur)',0,false]] },
    loja:         { fields: [['loja_data','Data e Hora (ex: 25/01/2026 21:30)',0,true],['loja_valor','Valor Obtido (ex: R$ 12.000)',0,true],['loja_print','Link da Print (Imgur)',0,false]] },
    craco:        { fields: [['craco_data','Data e Hora (ex: 25/01/2026 21:30)',0,true],['craco_qtd','Quantidade Vendida (apenas número, ex: 50)',0,true],['craco_print','Link da Print (Imgur)',0,false]] },
    afk:          { fields: [['afk_motivo','Motivo da Saída (ex: Problema pessoal)',0,true],['afk_saida','Horário de Saída (ex: 21:30)',0,true],['afk_retorno','Horário de Retorno (ex: 22:30)',0,true]] },
    corrida:      { fields: [['corrida_data','Data e Hora (ex: 25/01/2026 21:30)',0,true],['corrida_posicao','Posição Final (ex: 1º lugar)',0,true],['corrida_veiculo','Veículo Utilizado (ex: Sultan)',0,true],['corrida_print','Link da Print (Imgur)',0,false]] },
    ausencia:     { fields: [['ausencia_inicio','Data de Saída (ex: 25/01/2026)',0,true],['ausencia_fim','Data de Retorno (ex: 28/01/2026)',0,true],['ausencia_motivo','Motivo (ex: Viagem de trabalho)',2,true]] },
    registradora: { fields: [['reg_data','Data e Hora (ex: 25/01/2026 21:30)',0,true],['reg_valor','Valor Obtido (ex: R$ 8.000)',0,true],['reg_print','Link da Print (Imgur)',0,false]] },
    kill:         { fields: [['kill_desc','Descrição (ex: Emboscada na LS, tiroteio no porto)',0,true],['kill_qtd','Quantidade de Abates (apenas número, ex: 5)',0,true],['kill_data','Data e Hora (ex: 25/01/2026 21:30)',0,true],['kill_print','Link da Print (Imgur)',0,false]] },
  }
  const modal = new ModalBuilder().setCustomId(cfg.modalId).setTitle(cfg.label)
  for (const [id, label, style, required] of (modalMap[tipo]?.fields ?? []).slice(0, 5)) {
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style === 2 ? 2 : 1).setRequired(required)
    ))
  }
  return modal
}

// ─── SELECT DE PARCEIROS ──────────────────────────────────────────────────────

function buildSelectMessage(tipo) {
  const cfg = REGISTRO_CONFIG[tipo]

  const container = new ContainerBuilder()
    .setAccentColor(COLOR_MS13)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${cfg.label}\n` +
        (cfg.minSelect > 0
          ? `> Selecione os membros que participaram desta atividade.\n> ⚠️ **Obrigatório:** mínimo de ${cfg.minSelect} parceiro(s) para este registro.`
          : '> Selecione os membros que participaram desta atividade.\n> Caso tenha agido sozinho, clique em **Continuar** sem selecionar ninguém.')
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(1))
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder()
          .setCustomId(cfg.selectId)
          .setPlaceholder('👥 Selecione os parceiros envolvidos...')
          .setMinValues(cfg.minSelect ?? 0)
          .setMaxValues(cfg.maxSelect ?? 1)
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('cont_select_v13')
          .setLabel('Continuar ➜')
          .setStyle(ButtonStyle.Primary)
      )
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${FOOTER_TEXT}`)
    )

  return {
    components: [container],
    flags: (1 << 15) | (1 << 6), // IsComponentsV2 + Ephemeral
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function getField(interaction, id) {
  try { return interaction.fields.getTextInputValue(id) } catch { return null }
}

async function enviarLogs(guild, tipo, container) {
  const cfg = REGISTRO_CONFIG[tipo]
  if (tipo === 'registradora') {
    const ch = guild.channels.cache.get(CANAL_REGISTROS_ACOES_ID)
    if (ch) await ch.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(console.error)
    return
  }
  for (const alias of cfg.logChannels) {
    const id = CHANNEL_IDS[alias] ?? alias
    const ch = guild.channels.cache.get(id)
    if (ch) await ch.send({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch(console.error)
  }
}

// ─── BUILDER DE LOG V2 ────────────────────────────────────────────────────────

/**
 * Constrói um log em Components V2.
 * @param {object} opts
 * @param {string}   opts.titulo      — ex: '🏧 Registro de ATM'
 * @param {number}   opts.cor         — accent color (hex number)
 * @param {string}   opts.membro      — mention string '<@id>'
 * @param {object[]} opts.campos      — [{ label, valor }] — campos do registro
 * @param {string[]} [opts.envolvidos] — array de mentions. Omitir ou deixar vazio = não exibe
 * @param {string}   [opts.print]     — URL da imagem (opcional)
 * @param {object}   opts.autor       — interaction.user
 */
function buildLogV2({ titulo, cor, membro, campos, envolvidos, print, autor }) {
  const temEnvolvidos = envolvidos && envolvidos.length > 0

  // ── Linha de campos ──
  const linhasCampos = campos.map(c => `> **${c.label}:** ${c.valor ?? '—'}`).join('\n')

  // ── Cabeçalho: se tem envolvidos, coloca todos juntos; senão, só "Membro" ──
  // Quando tem envolvidos, o criador já está na lista — sem campo "Membro" separado
  const cabecalho = temEnvolvidos
    ? `👥 **Envolvidos:** ${envolvidos.join(' ')}`
    : `👤 **Membro:** ${membro}`

  // ── Print block ──
  const printBlock = (print && print.startsWith('http'))
    ? `\n\n🖼️ **Print:** ${print}`
    : ''

  const corpo = `${linhasCampos}${printBlock}`

  const ts = `<t:${Math.floor(Date.now() / 1000)}:F>`

  const container = new ContainerBuilder()
    .setAccentColor(cor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${titulo}\n` +
        `-# Registrado por ${autor?.tag ?? '?'} • ${ts}`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(1))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `${cabecalho}\n` +
        corpo
      )
    )
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(1))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ${FOOTER_TEXT}`)
    )

  return container
}

// ─── HANDLER PRINCIPAL ────────────────────────────────────────────────────────

async function execute(interaction) {
  const { customId } = interaction

  // Botão principal → abre select (com parceiro) ou modal direto
  if (interaction.isButton() && BUTTON_TO_TYPE[customId]) {
    const tipo = BUTTON_TO_TYPE[customId]
    const cfg  = REGISTRO_CONFIG[tipo]
    if (interaction.replied || interaction.deferred) return
    if (cfg.comParceiro) {
      selectContextMap.set(`${interaction.user.id}_ctx`, tipo)
      await interaction.reply(buildSelectMessage(tipo))
      return
    }
    await interaction.showModal(buildModal(tipo))
    return
  }

  // Select de parceiros → salva contexto (remove o próprio usuário se selecionado)
  if (interaction.isUserSelectMenu() && SELECT_TO_TYPE[customId]) {
    const tipo      = SELECT_TO_TYPE[customId]
    const ids       = interaction.values ?? []
    // Remove o próprio usuário da lista (evita duplicata nos envolvidos)
    const parceiros = ids.filter(id => id !== interaction.user.id)
    selectContextMap.set(`${interaction.user.id}_${tipo}_users`, parceiros)
    if (interaction.replied || interaction.deferred) return
    await interaction.deferUpdate()
    return
  }

  // Botão "Continuar" → abre modal
  if (interaction.isButton() && customId === 'cont_select_v13') {
    const tipo = selectContextMap.get(`${interaction.user.id}_ctx`)
    if (!tipo) {
      if (interaction.replied || interaction.deferred) return
      await interaction.reply({ content: '❌ Contexto perdido. Tente novamente.', ephemeral: true })
      return
    }
    selectContextMap.delete(`${interaction.user.id}_ctx`)
    if (interaction.replied || interaction.deferred) return
    await interaction.showModal(buildModal(tipo))
    return
  }

  // Modal submissions
  if (interaction.isModalSubmit()) {
    if (interaction.replied || interaction.deferred) return
    const uid = interaction.user.id

    // ── ATM ──
    if (customId === 'modal_registro_atm') {
      const vData  = parseDataHora(getField(interaction, 'atm_data'))
      const vValor = parseDinheiro(getField(interaction, 'atm_valor'))
      const erros  = [!vData.ok && vData.erro, !vValor.ok && vValor.erro].filter(Boolean)
      if (erros.length) return responderErro(interaction, erros)

      const parceiros  = selectContextMap.get(`${uid}_atm_users`) ?? []
      const envolvidos = montarEnvolvidos(uid, parceiros)
      const container  = buildLogV2({
        titulo: '🏧 Registro de ATM',
        cor: COLOR_SUCCESS,
        membro: `<@${uid}>`,
        campos: [
          { label: '🕐 Data e Hora', valor: vData.valor },
          { label: '💰 Valor',       valor: vValor.valor },
        ],
        envolvidos,
        print: getField(interaction, 'atm_print'),
        autor: interaction.user,
      })
      await enviarLogs(interaction.guild, 'atm', container)
      selectContextMap.delete(`${uid}_atm_users`)
      return interaction.reply({ content: '✅ ATM registrado com sucesso!', ephemeral: true })
    }

    // ── Loja ──
    if (customId === 'modal_registro_loja') {
      const vData  = parseDataHora(getField(interaction, 'loja_data'))
      const vValor = parseDinheiro(getField(interaction, 'loja_valor'))
      const erros  = [!vData.ok && vData.erro, !vValor.ok && vValor.erro].filter(Boolean)
      if (erros.length) return responderErro(interaction, erros)

      const parceiros  = selectContextMap.get(`${uid}_loja_users`) ?? []
      const envolvidos = montarEnvolvidos(uid, parceiros)
      const container  = buildLogV2({
        titulo: '🏪 Registro de Loja',
        cor: COLOR_SUCCESS,
        membro: `<@${uid}>`,
        campos: [
          { label: '🕐 Data e Hora', valor: vData.valor },
          { label: '💰 Valor',       valor: vValor.valor },
        ],
        envolvidos,
        print: getField(interaction, 'loja_print'),
        autor: interaction.user,
      })
      await enviarLogs(interaction.guild, 'loja', container)
      selectContextMap.delete(`${uid}_loja_users`)
      return interaction.reply({ content: '✅ Loja registrada com sucesso!', ephemeral: true })
    }

    // ── Craco ──
    if (customId === 'modal_registro_craco') {
      const vData = parseDataHora(getField(interaction, 'craco_data'))
      const vQtd  = parseInteiro(getField(interaction, 'craco_qtd'), 'Quantidade')
      const erros = [!vData.ok && vData.erro, !vQtd.ok && vQtd.erro].filter(Boolean)
      if (erros.length) return responderErro(interaction, erros)

      const container = buildLogV2({
        titulo: '🌿 Registro de Craco',
        cor: COLOR_SUCCESS,
        membro: `<@${uid}>`,
        campos: [
          { label: '🕐 Data e Hora',    valor: vData.valor },
          { label: '📦 Qtd. Produzida', valor: vQtd.valor },
        ],
        print: getField(interaction, 'craco_print'),
        autor: interaction.user,
      })
      await enviarLogs(interaction.guild, 'craco', container)
      return interaction.reply({ content: '✅ Craco registrado com sucesso!', ephemeral: true })
    }

    // ── AFK ──
    if (customId === 'modal_registro_afk') {
      const vSaida   = parseDataHora(getField(interaction, 'afk_saida'))
      const vRetorno = parseDataHora(getField(interaction, 'afk_retorno'))
      const erros    = [!vSaida.ok && vSaida.erro, !vRetorno.ok && vRetorno.erro].filter(Boolean)
      if (erros.length) return responderErro(interaction, erros)

      const container = buildLogV2({
        titulo: '💤 Registro de AFK',
        cor: COLOR_WARNING,
        membro: `<@${uid}>`,
        campos: [
          { label: '📝 Motivo',           valor: getField(interaction, 'afk_motivo') },
          { label: '🚪 Saída',            valor: vSaida.valor },
          { label: '🔙 Retorno Previsto', valor: vRetorno.valor },
        ],
        autor: interaction.user,
      })
      await enviarLogs(interaction.guild, 'afk', container)
      return interaction.reply({ content: '✅ AFK registrado com sucesso!', ephemeral: true })
    }

    // ── Corrida ──
    if (customId === 'modal_registro_corrida') {
      const vData = parseDataHora(getField(interaction, 'corrida_data'))
      const erros = [!vData.ok && vData.erro].filter(Boolean)
      if (erros.length) return responderErro(interaction, erros)

      const container = buildLogV2({
        titulo: '🏎️ Registro de Corrida',
        cor: COLOR_SUCCESS,
        membro: `<@${uid}>`,
        campos: [
          { label: '🕐 Data e Hora',   valor: vData.valor },
          { label: '🏆 Posição Final', valor: getField(interaction, 'corrida_posicao') },
          { label: '🚗 Veículo',       valor: getField(interaction, 'corrida_veiculo') },
        ],
        print: getField(interaction, 'corrida_print'),
        autor: interaction.user,
      })
      await enviarLogs(interaction.guild, 'corrida', container)
      return interaction.reply({ content: '✅ Corrida registrada com sucesso!', ephemeral: true })
    }

    // ── Ausência ──
    if (customId === 'modal_ausencia') {
      const vInicio = parseDataHora(getField(interaction, 'ausencia_inicio'), true)
      const vFim    = parseDataHora(getField(interaction, 'ausencia_fim'), true)
      const erros   = [!vInicio.ok && vInicio.erro, !vFim.ok && vFim.erro].filter(Boolean)
      if (erros.length) return responderErro(interaction, erros)

      const container = buildLogV2({
        titulo: '📅 Registro de Ausência',
        cor: COLOR_WARNING,
        membro: `<@${uid}>`,
        campos: [
          { label: '📤 Data de Saída',   valor: vInicio.valor },
          { label: '📥 Data de Retorno', valor: vFim.valor },
          { label: '📝 Motivo',          valor: getField(interaction, 'ausencia_motivo') },
        ],
        autor: interaction.user,
      })
      await enviarLogs(interaction.guild, 'ausencia', container)
      return interaction.reply({ content: '✅ Ausência registrada com sucesso!', ephemeral: true })
    }

    // ── Registradora ──
    if (customId === 'modal_registro_registradora') {
      const vData  = parseDataHora(getField(interaction, 'reg_data'))
      const vValor = parseDinheiro(getField(interaction, 'reg_valor'))
      const erros  = [!vData.ok && vData.erro, !vValor.ok && vValor.erro].filter(Boolean)
      if (erros.length) return responderErro(interaction, erros)

      const parceiros  = selectContextMap.get(`${uid}_registradora_users`) ?? []
      const envolvidos = montarEnvolvidos(uid, parceiros)
      const container  = buildLogV2({
        titulo: '🏦 Registro de Registradora',
        cor: COLOR_SUCCESS,
        membro: `<@${uid}>`,
        campos: [
          { label: '🕐 Data e Hora', valor: vData.valor },
          { label: '💰 Valor',       valor: vValor.valor },
        ],
        envolvidos,
        print: getField(interaction, 'reg_print'),
        autor: interaction.user,
      })
      await enviarLogs(interaction.guild, 'registradora', container)
      selectContextMap.delete(`${uid}_registradora_users`)
      return interaction.reply({ content: '✅ Registradora registrada com sucesso!', ephemeral: true })
    }

    // ── Kill ──
    if (customId === 'modal_registro_kill') {
      const vData = parseDataHora(getField(interaction, 'kill_data'))
      const vQtd  = parseInteiro(getField(interaction, 'kill_qtd'), 'Quantidade de Abates')
      const erros = [!vData.ok && vData.erro, !vQtd.ok && vQtd.erro].filter(Boolean)
      if (erros.length) return responderErro(interaction, erros)

      const container = buildLogV2({
        titulo: '💀 Registro de Kill',
        cor: COLOR_ERROR,
        membro: `<@${uid}>`,
        campos: [
          { label: '📝 Descrição',       valor: getField(interaction, 'kill_desc') },
          { label: '☠️ Qtd. de Abates', valor: vQtd.valor },
          { label: '🕐 Data e Hora',    valor: vData.valor },
        ],
        print: getField(interaction, 'kill_print'),
        autor: interaction.user,
      })
      await enviarLogs(interaction.guild, 'kill', container)
      return interaction.reply({ content: '✅ Kill registrado com sucesso!', ephemeral: true })
    }
  }
}

// ─── HELPER: monta lista de envolvidos ────────────────────────────────────────
// Se há parceiros reais: inclui o CRIADOR + parceiros (todos em "Envolvidos", sem campo "Membro")
// Se não há parceiros: retorna [] e o log usa campo "Membro" normal
function montarEnvolvidos(uid, parceiros) {
  // Remove duplicatas e o próprio criador dos parceiros selecionados
  const parceirosFiltrados = [...new Set(parceiros.filter(id => id !== uid))]
  if (parceirosFiltrados.length === 0) return []
  // Criador vem primeiro, depois os parceiros
  return [uid, ...parceirosFiltrados].map(id => `<@${id}>`)
}

module.exports = { customIds, execute, buildEmbedMembros, buildMemberPanelRows, buildMembrosV2 }