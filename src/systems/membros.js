// ============================================================
// ETAPA 2 — Sistema de Membros
// src/systems/membros.js
// ============================================================

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
} = require('discord.js')

// ── Constantes (importadas inline para evitar circular) ──────
const {
  CHANNEL_IDS,
  CANAL_REGISTROS_ACOES_ID,
  COLOR_MS13,
  COLOR_SUCCESS,
  COLOR_ERROR,
  FOOTER_TEXT,
} = require('../config/settings.js')

// ── Contexto do select compartilhado (userId → tipo) ─────────
const selectContextMap = new Map()

// ── customIds exportados ─────────────────────────────────────
const customIds = [
  'mp_atm', 'mp_loja', 'mp_craco',
  'mp_afk', 'mp_corrida', 'mp_ausencia',
  'mp_registradora', 'mp_kill',

  'select_registro_atm_v13',
  'select_registro_loja_v13',
  'select_registro_craco_v13',
  'select_registro_registradora_v13',
  'cont_select_v13',

  'modal_registro_atm',
  'modal_registro_loja',
  'modal_registro_craco',
  'modal_registro_afk',
  'modal_registro_corrida',
  'modal_ausencia',
  'modal_registro_registradora',
  'modal_registro_kill',
]

// ── Configurações por tipo de registro ───────────────────────
const REGISTRO_CONFIG = {
  atm: {
    label:      '🏧 Registro ATM',
    modalId:    'modal_registro_atm',
    selectId:   'select_registro_atm_v13',
    maxSelect:  1,
    comParceiro: true,
    logChannels: ['logs_atm', 'pub_atm'],
    campos: [
      { id: 'atm_valor',     label: 'Valor retirado (R$)',    style: TextInputStyle.Short,     required: true },
      { id: 'atm_print',     label: 'Link da print',          style: TextInputStyle.Short,     required: false },
      { id: 'atm_obs',       label: 'Observações',            style: TextInputStyle.Paragraph, required: false },
    ],
  },
  loja: {
    label:      '🏪 Registro Loja',
    modalId:    'modal_registro_loja',
    selectId:   'select_registro_loja_v13',
    maxSelect:  2,
    comParceiro: true,
    logChannels: ['logs_loja'],
    campos: [
      { id: 'loja_produto',  label: 'Produto vendido',        style: TextInputStyle.Short,     required: true },
      { id: 'loja_qtd',      label: 'Quantidade',             style: TextInputStyle.Short,     required: true },
      { id: 'loja_valor',    label: 'Valor total (R$)',        style: TextInputStyle.Short,     required: true },
      { id: 'loja_print',    label: 'Link da print',          style: TextInputStyle.Short,     required: false },
      { id: 'loja_obs',      label: 'Observações',            style: TextInputStyle.Paragraph, required: false },
    ],
  },
  craco: {
    label:      '🌿 Registro Craco',
    modalId:    'modal_registro_craco',
    selectId:   'select_registro_craco_v13',
    maxSelect:  2,
    comParceiro: true,
    logChannels: ['logs_craco'],
    campos: [
      { id: 'craco_qtd',     label: 'Quantidade produzida',   style: TextInputStyle.Short,     required: true },
      { id: 'craco_valor',   label: 'Valor total (R$)',        style: TextInputStyle.Short,     required: true },
      { id: 'craco_print',   label: 'Link da print',          style: TextInputStyle.Short,     required: false },
      { id: 'craco_obs',     label: 'Observações',            style: TextInputStyle.Paragraph, required: false },
    ],
  },
  afk: {
    label:      '💤 Registro AFK',
    modalId:    'modal_registro_afk',
    comParceiro: false,
    logChannels: ['logs_afk'],
    campos: [
      { id: 'afk_motivo',    label: 'Motivo do AFK',          style: TextInputStyle.Short,     required: true },
      { id: 'afk_tempo',     label: 'Tempo estimado',         style: TextInputStyle.Short,     required: true },
      { id: 'afk_obs',       label: 'Observações',            style: TextInputStyle.Paragraph, required: false },
    ],
  },
  corrida: {
    label:      '🏎️ Registro Corrida',
    modalId:    'modal_registro_corrida',
    comParceiro: false,
    logChannels: ['logs_corrida'],
    campos: [
      { id: 'corrida_rota',  label: 'Rota percorrida',        style: TextInputStyle.Short,     required: true },
      { id: 'corrida_valor', label: 'Valor ganho (R$)',        style: TextInputStyle.Short,     required: true },
      { id: 'corrida_print', label: 'Link da print',          style: TextInputStyle.Short,     required: false },
      { id: 'corrida_obs',   label: 'Observações',            style: TextInputStyle.Paragraph, required: false },
    ],
  },
  ausencia: {
    label:      '📅 Registro Ausência',
    modalId:    'modal_ausencia',
    comParceiro: false,
    logChannels: ['logs_ausencia', 'pub_ausentes'],
    campos: [
      { id: 'ausencia_inicio',  label: 'Data de início',      style: TextInputStyle.Short,     required: true },
      { id: 'ausencia_fim',     label: 'Previsão de retorno', style: TextInputStyle.Short,     required: true },
      { id: 'ausencia_motivo',  label: 'Motivo',              style: TextInputStyle.Paragraph, required: true },
    ],
  },
  registradora: {
    label:      '🏦 Registro Registradora',
    modalId:    'modal_registro_registradora',
    selectId:   'select_registro_registradora_v13',
    maxSelect:  1,
    comParceiro: true,
    logChannels: [], // canal especial → CANAL_REGISTROS_ACOES_ID
    campos: [
      { id: 'reg_valor',     label: 'Valor registrado (R$)',  style: TextInputStyle.Short,     required: true },
      { id: 'reg_print',     label: 'Link da print',          style: TextInputStyle.Short,     required: false },
      { id: 'reg_obs',       label: 'Observações',            style: TextInputStyle.Paragraph, required: false },
    ],
  },
  kill: {
    label:      '💀 Registro Kill',
    modalId:    'modal_registro_kill',
    comParceiro: false,
    logChannels: ['logs_kill', 'pub_kill'],
    campos: [
      { id: 'kill_vitima',   label: 'Vítima(s)',              style: TextInputStyle.Short,     required: true },
      { id: 'kill_motivo',   label: 'Motivo',                 style: TextInputStyle.Short,     required: true },
      { id: 'kill_print',    label: 'Link da print',          style: TextInputStyle.Short,     required: false },
      { id: 'kill_obs',      label: 'Observações',            style: TextInputStyle.Paragraph, required: false },
    ],
  },
}

// ── Mapa: customId do botão → tipo ───────────────────────────
const BUTTON_TO_TYPE = {
  mp_atm:          'atm',
  mp_loja:         'loja',
  mp_craco:        'craco',
  mp_afk:          'afk',
  mp_corrida:      'corrida',
  mp_ausencia:     'ausencia',
  mp_registradora: 'registradora',
  mp_kill:         'kill',
}

// ── Mapa: selectId → tipo ─────────────────────────────────────
const SELECT_TO_TYPE = {
  select_registro_atm_v13:          'atm',
  select_registro_loja_v13:         'loja',
  select_registro_craco_v13:        'craco',
  select_registro_registradora_v13: 'registradora',
}

// ─────────────────────────────────────────────────────────────
// BUILD EMBED PAINEL MEMBROS
// ─────────────────────────────────────────────────────────────
function buildEmbedMembros() {
  return new EmbedBuilder()
    .setColor(COLOR_MS13)
    .setTitle('🔫 | Painel de Membros — MS-13')
    .setDescription(
      '> Use os botões abaixo para registrar suas atividades.\n' +
      '> Preencha todas as informações corretamente.\n\n' +
      '**Registros disponíveis:**\n' +
      '🏧 ATM · 🏪 Loja · 🌿 Craco\n' +
      '💤 AFK · 🏎️ Corrida · 📅 Ausência\n' +
      '🏦 Registradora · 💀 Kill'
    )
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp()
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/** Monta o modal com base no config do tipo */
function buildModal(tipo) {
  const cfg = REGISTRO_CONFIG[tipo]
  if (!cfg) throw new Error(`Tipo desconhecido: ${tipo}`)

  const modal = new ModalBuilder()
    .setCustomId(cfg.modalId)
    .setTitle(cfg.label)

  // Discord permite no máximo 5 campos por modal
  const campos = cfg.campos.slice(0, 5)
  for (const campo of campos) {
    const input = new TextInputBuilder()
      .setCustomId(campo.id)
      .setLabel(campo.label)
      .setStyle(campo.style)
      .setRequired(campo.required ?? true)

    modal.addComponents(new ActionRowBuilder().addComponents(input))
  }

  return modal
}

/** Monta o UserSelect ephemeral com botão "Continuar ➜" */
function buildSelectMessage(tipo) {
  const cfg = REGISTRO_CONFIG[tipo]
  if (!cfg) throw new Error(`Tipo desconhecido: ${tipo}`)

  const select = new UserSelectMenuBuilder()
    .setCustomId(cfg.selectId)
    .setPlaceholder('Selecione os parceiros...')
    .setMinValues(0)
    .setMaxValues(cfg.maxSelect ?? 1)

  const btnContinuar = new ButtonBuilder()
    .setCustomId('cont_select_v13')
    .setLabel('Continuar ➜')
    .setStyle(ButtonStyle.Primary)

  return {
    content: `> **${cfg.label}**\nSelecione os parceiros envolvidos (opcional):`,
    components: [
      new ActionRowBuilder().addComponents(select),
      new ActionRowBuilder().addComponents(btnContinuar),
    ],
    ephemeral: true,
  }
}

/** Coleta os campos do modal por id */
function getField(interaction, id) {
  try { return interaction.fields.getTextInputValue(id) } catch { return null }
}

/** Resolve o canal pelo alias ou ID direto */
function getChannel(guild, alias) {
  const id = CHANNEL_IDS[alias] ?? alias
  return guild.channels.cache.get(id) ?? null
}

/** Envia o embed de log para os canais definidos */
async function enviarLogs(guild, tipo, embed, canaisExtra = []) {
  const cfg = REGISTRO_CONFIG[tipo]
  const aliases = [...cfg.logChannels, ...canaisExtra]

  // Registradora usa canal especial
  if (tipo === 'registradora') {
    const ch = guild.channels.cache.get(CANAL_REGISTROS_ACOES_ID)
    if (ch) await ch.send({ embeds: [embed] }).catch(console.error)
    return
  }

  for (const alias of aliases) {
    const ch = getChannel(guild, alias)
    if (ch) await ch.send({ embeds: [embed] }).catch(console.error)
  }
}

// ─────────────────────────────────────────────────────────────
// HANDLERS DE MODAL
// ─────────────────────────────────────────────────────────────

async function handleModalATM(interaction) {
  const valor    = getField(interaction, 'atm_valor')
  const print    = getField(interaction, 'atm_print')
  const obs      = getField(interaction, 'atm_obs')
  const parceiros = selectContextMap.get(`${interaction.user.id}_atm_users`) ?? []

  const embed = new EmbedBuilder()
    .setColor(COLOR_SUCCESS)
    .setTitle('🏧 | Registro ATM')
    .addFields(
      { name: 'Membro',    value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Valor (R$)', value: valor ?? '—',               inline: true },
    )

  if (parceiros.length > 0)
    embed.addFields({ name: 'Parceiros', value: parceiros.map(id => `<@${id}>`).join(', '), inline: false })
  if (obs)
    embed.addFields({ name: 'Obs', value: obs, inline: false })
  if (print?.startsWith('http'))
    embed.setImage(print)

  embed.setFooter({ text: FOOTER_TEXT }).setTimestamp()

  await enviarLogs(interaction.guild, 'atm', embed)
  selectContextMap.delete(`${interaction.user.id}_atm_users`)

  await interaction.reply({ content: '✅ ATM registrado com sucesso!', ephemeral: true })
}

async function handleModalLoja(interaction) {
  const produto  = getField(interaction, 'loja_produto')
  const qtd      = getField(interaction, 'loja_qtd')
  const valor    = getField(interaction, 'loja_valor')
  const print    = getField(interaction, 'loja_print')
  const obs      = getField(interaction, 'loja_obs')
  const parceiros = selectContextMap.get(`${interaction.user.id}_loja_users`) ?? []

  const embed = new EmbedBuilder()
    .setColor(COLOR_SUCCESS)
    .setTitle('🏪 | Registro Loja')
    .addFields(
      { name: 'Membro',    value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Produto',   value: produto ?? '—',              inline: true },
      { name: 'Qtd',       value: qtd ?? '—',                  inline: true },
      { name: 'Valor (R$)', value: valor ?? '—',               inline: true },
    )

  if (parceiros.length > 0)
    embed.addFields({ name: 'Parceiros', value: parceiros.map(id => `<@${id}>`).join(', '), inline: false })
  if (obs)
    embed.addFields({ name: 'Obs', value: obs, inline: false })
  if (print?.startsWith('http'))
    embed.setImage(print)

  embed.setFooter({ text: FOOTER_TEXT }).setTimestamp()

  await enviarLogs(interaction.guild, 'loja', embed)
  selectContextMap.delete(`${interaction.user.id}_loja_users`)

  await interaction.reply({ content: '✅ Loja registrada com sucesso!', ephemeral: true })
}

async function handleModalCraco(interaction) {
  const qtd      = getField(interaction, 'craco_qtd')
  const valor    = getField(interaction, 'craco_valor')
  const print    = getField(interaction, 'craco_print')
  const obs      = getField(interaction, 'craco_obs')
  const parceiros = selectContextMap.get(`${interaction.user.id}_craco_users`) ?? []

  const embed = new EmbedBuilder()
    .setColor(COLOR_SUCCESS)
    .setTitle('🌿 | Registro Craco')
    .addFields(
      { name: 'Membro',    value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Qtd',       value: qtd ?? '—',                  inline: true },
      { name: 'Valor (R$)', value: valor ?? '—',               inline: true },
    )

  if (parceiros.length > 0)
    embed.addFields({ name: 'Parceiros', value: parceiros.map(id => `<@${id}>`).join(', '), inline: false })
  if (obs)
    embed.addFields({ name: 'Obs', value: obs, inline: false })
  if (print?.startsWith('http'))
    embed.setImage(print)

  embed.setFooter({ text: FOOTER_TEXT }).setTimestamp()

  await enviarLogs(interaction.guild, 'craco', embed)
  selectContextMap.delete(`${interaction.user.id}_craco_users`)

  await interaction.reply({ content: '✅ Craco registrado com sucesso!', ephemeral: true })
}

async function handleModalAFK(interaction) {
  const motivo = getField(interaction, 'afk_motivo')
  const tempo  = getField(interaction, 'afk_tempo')
  const obs    = getField(interaction, 'afk_obs')

  const embed = new EmbedBuilder()
    .setColor(COLOR_WARNING ?? 0xF39C12)
    .setTitle('💤 | Registro AFK')
    .addFields(
      { name: 'Membro',  value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Motivo',  value: motivo ?? '—',               inline: true },
      { name: 'Tempo',   value: tempo ?? '—',                inline: true },
    )

  if (obs) embed.addFields({ name: 'Obs', value: obs, inline: false })
  embed.setFooter({ text: FOOTER_TEXT }).setTimestamp()

  await enviarLogs(interaction.guild, 'afk', embed)
  await interaction.reply({ content: '✅ AFK registrado com sucesso!', ephemeral: true })
}

async function handleModalCorrida(interaction) {
  const rota  = getField(interaction, 'corrida_rota')
  const valor = getField(interaction, 'corrida_valor')
  const print = getField(interaction, 'corrida_print')
  const obs   = getField(interaction, 'corrida_obs')

  const embed = new EmbedBuilder()
    .setColor(COLOR_SUCCESS)
    .setTitle('🏎️ | Registro Corrida')
    .addFields(
      { name: 'Membro',    value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Rota',      value: rota ?? '—',                 inline: true },
      { name: 'Valor (R$)', value: valor ?? '—',               inline: true },
    )

  if (obs) embed.addFields({ name: 'Obs', value: obs, inline: false })
  if (print?.startsWith('http')) embed.setImage(print)
  embed.setFooter({ text: FOOTER_TEXT }).setTimestamp()

  await enviarLogs(interaction.guild, 'corrida', embed)
  await interaction.reply({ content: '✅ Corrida registrada com sucesso!', ephemeral: true })
}

async function handleModalAusencia(interaction) {
  const inicio = getField(interaction, 'ausencia_inicio')
  const fim    = getField(interaction, 'ausencia_fim')
  const motivo = getField(interaction, 'ausencia_motivo')

  const embed = new EmbedBuilder()
    .setColor(0xF39C12)
    .setTitle('📅 | Registro de Ausência')
    .addFields(
      { name: 'Membro',   value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Início',   value: inicio ?? '—',               inline: true },
      { name: 'Retorno',  value: fim ?? '—',                  inline: true },
      { name: 'Motivo',   value: motivo ?? '—',               inline: false },
    )
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp()

  await enviarLogs(interaction.guild, 'ausencia', embed)
  await interaction.reply({ content: '✅ Ausência registrada com sucesso!', ephemeral: true })
}

async function handleModalRegistradora(interaction) {
  const valor    = getField(interaction, 'reg_valor')
  const print    = getField(interaction, 'reg_print')
  const obs      = getField(interaction, 'reg_obs')
  const parceiros = selectContextMap.get(`${interaction.user.id}_registradora_users`) ?? []

  const embed = new EmbedBuilder()
    .setColor(COLOR_SUCCESS)
    .setTitle('🏦 | Registro Registradora')
    .addFields(
      { name: 'Membro',    value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Valor (R$)', value: valor ?? '—',               inline: true },
    )

  if (parceiros.length > 0)
    embed.addFields({ name: 'Parceiros', value: parceiros.map(id => `<@${id}>`).join(', '), inline: false })
  if (obs)
    embed.addFields({ name: 'Obs', value: obs, inline: false })
  if (print?.startsWith('http'))
    embed.setImage(print)

  embed.setFooter({ text: FOOTER_TEXT }).setTimestamp()

  await enviarLogs(interaction.guild, 'registradora', embed)
  selectContextMap.delete(`${interaction.user.id}_registradora_users`)

  await interaction.reply({ content: '✅ Registradora registrada com sucesso!', ephemeral: true })
}

async function handleModalKill(interaction) {
  const vitima = getField(interaction, 'kill_vitima')
  const motivo = getField(interaction, 'kill_motivo')
  const print  = getField(interaction, 'kill_print')
  const obs    = getField(interaction, 'kill_obs')

  const embed = new EmbedBuilder()
    .setColor(COLOR_ERROR)
    .setTitle('💀 | Registro Kill')
    .addFields(
      { name: 'Executado por', value: `<@${interaction.user.id}>`, inline: true },
      { name: 'Vítima(s)',     value: vitima ?? '—',               inline: true },
      { name: 'Motivo',        value: motivo ?? '—',               inline: false },
    )

  if (obs)  embed.addFields({ name: 'Obs', value: obs, inline: false })
  if (print?.startsWith('http')) embed.setImage(print)
  embed.setFooter({ text: FOOTER_TEXT }).setTimestamp()

  await enviarLogs(interaction.guild, 'kill', embed)
  await interaction.reply({ content: '✅ Kill registrado com sucesso!', ephemeral: true })
}

// ─────────────────────────────────────────────────────────────
// EXECUTE — roteador principal
// ─────────────────────────────────────────────────────────────
async function execute(interaction) {
  const { customId } = interaction

  // ── Botões do painel ──────────────────────────────────────
  if (interaction.isButton() && BUTTON_TO_TYPE[customId]) {
    const tipo = BUTTON_TO_TYPE[customId]
    const cfg  = REGISTRO_CONFIG[tipo]

    if (interaction.replied || interaction.deferred) return

    if (cfg.comParceiro) {
      // Armazena contexto para o cont_select_v13 saber qual modal abrir
      selectContextMap.set(`${interaction.user.id}_ctx`, tipo)
      await interaction.reply(buildSelectMessage(tipo))
      return
    }

    // Sem parceiros → modal direto
    await interaction.showModal(buildModal(tipo))
    return
  }

  // ── UserSelect (salva os IDs selecionados) ────────────────
  if (interaction.isUserSelectMenu() && SELECT_TO_TYPE[customId]) {
    const tipo = SELECT_TO_TYPE[customId]
    const ids  = interaction.values ?? []

    // Filtra o próprio usuário caso tenha sido selecionado
    const parceiros = ids.filter(id => id !== interaction.user.id)
    selectContextMap.set(`${interaction.user.id}_${tipo}_users`, parceiros)

    if (interaction.replied || interaction.deferred) return
    await interaction.deferUpdate()
    return
  }

  // ── Botão "Continuar ➜" ───────────────────────────────────
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

  // ── Modais ────────────────────────────────────────────────
  if (interaction.isModalSubmit()) {
    if (interaction.replied || interaction.deferred) return

    switch (customId) {
      case 'modal_registro_atm':          return handleModalATM(interaction)
      case 'modal_registro_loja':         return handleModalLoja(interaction)
      case 'modal_registro_craco':        return handleModalCraco(interaction)
      case 'modal_registro_afk':          return handleModalAFK(interaction)
      case 'modal_registro_corrida':      return handleModalCorrida(interaction)
      case 'modal_ausencia':              return handleModalAusencia(interaction)
      case 'modal_registro_registradora': return handleModalRegistradora(interaction)
      case 'modal_registro_kill':         return handleModalKill(interaction)
    }
  }
}

// ─────────────────────────────────────────────────────────────
// BUILD ROWS — para uso externo (enviar o painel)
// ─────────────────────────────────────────────────────────────
function buildMemberPanelRows() {
  // Row 0
  const row0 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mp_atm').setLabel('🏧 Registro ATM').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mp_loja').setLabel('🏪 Registro Loja').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mp_craco').setLabel('🌿 Registro Craco').setStyle(ButtonStyle.Secondary),
  )

  // Row 1
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mp_afk').setLabel('💤 Registro AFK').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mp_corrida').setLabel('🏎️ Registro Corrida').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mp_ausencia').setLabel('📅 Registro Ausência').setStyle(ButtonStyle.Secondary),
  )

  // Row 2
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mp_registradora').setLabel('🏦 Registro Registradora').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mp_kill').setLabel('💀 Registro Kill').setStyle(ButtonStyle.Danger),
  )

  return [row0, row1, row2]
}

// ─────────────────────────────────────────────────────────────
module.exports = {
  customIds,
  execute,
  buildEmbedMembros,
  buildMemberPanelRows,
}
