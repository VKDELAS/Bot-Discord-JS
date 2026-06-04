// src/systems/membros.js — Etapa 2: Sistema de Membros
// NOTA: Este é o sistema completo de registros de membros (ATM, Loja, Craco, AFK, Corrida, Ausência, Registradora, Kill)
// Arquivo gerado a partir do MIGRATION.md — Etapa 2

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder,
} = require('discord.js')

const { CHANNEL_IDS, CANAL_REGISTROS_ACOES_ID, COLOR_MS13, COLOR_SUCCESS, COLOR_ERROR, FOOTER_TEXT } = require('../config/settings.js')

const selectContextMap = new Map()

const customIds = [
  'mp_atm', 'mp_loja', 'mp_craco', 'mp_afk', 'mp_corrida', 'mp_ausencia', 'mp_registradora', 'mp_kill',
  'select_registro_atm_v13', 'select_registro_loja_v13', 'select_registro_craco_v13', 'select_registro_registradora_v13',
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
  select_registro_craco_v13: 'craco', select_registro_registradora_v13: 'registradora',
}

const REGISTRO_CONFIG = {
  atm:          { label: '🏧 Registro ATM',          modalId: 'modal_registro_atm',          selectId: 'select_registro_atm_v13',          maxSelect: 1, comParceiro: true,  logChannels: ['logs_atm', 'pub_atm'] },
  loja:         { label: '🏪 Registro Loja',         modalId: 'modal_registro_loja',         selectId: 'select_registro_loja_v13',         maxSelect: 2, comParceiro: true,  logChannels: ['logs_loja'] },
  craco:        { label: '🌿 Registro Craco',        modalId: 'modal_registro_craco',        selectId: 'select_registro_craco_v13',        maxSelect: 2, comParceiro: true,  logChannels: ['logs_craco'] },
  afk:          { label: '💤 Registro AFK',          modalId: 'modal_registro_afk',          comParceiro: false, logChannels: ['logs_afk'] },
  corrida:      { label: '🏎️ Registro Corrida',     modalId: 'modal_registro_corrida',      comParceiro: false, logChannels: ['logs_corrida'] },
  ausencia:     { label: '📅 Registro Ausência',     modalId: 'modal_ausencia',              comParceiro: false, logChannels: ['logs_ausencia', 'pub_ausentes'] },
  registradora: { label: '🏦 Registro Registradora', modalId: 'modal_registro_registradora', selectId: 'select_registro_registradora_v13', maxSelect: 1, comParceiro: true, logChannels: [] },
  kill:         { label: '💀 Registro Kill',         modalId: 'modal_registro_kill',         comParceiro: false, logChannels: ['logs_kill', 'pub_kill'] },
}

function buildEmbedMembros() {
  return new EmbedBuilder()
    .setColor(COLOR_MS13)
    .setTitle('🔫 | Painel de Membros — MS-13')
    .setDescription(
      '> Use os botões abaixo para registrar suas atividades.\n> Preencha todas as informações corretamente.\n\n' +
      '**Registros disponíveis:**\n🏧 ATM · 🏪 Loja · 🌿 Craco\n💤 AFK · 🏎️ Corrida · 📅 Ausência\n🏦 Registradora · 💀 Kill'
    )
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp()
}

function buildMemberPanelRows() {
  const row0 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mp_atm').setLabel('🏧 Registro ATM').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mp_loja').setLabel('🏪 Registro Loja').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mp_craco').setLabel('🌿 Registro Craco').setStyle(ButtonStyle.Secondary),
  )
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mp_afk').setLabel('💤 Registro AFK').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mp_corrida').setLabel('🏎️ Registro Corrida').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mp_ausencia').setLabel('📅 Registro Ausência').setStyle(ButtonStyle.Secondary),
  )
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mp_registradora').setLabel('🏦 Registro Registradora').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('mp_kill').setLabel('💀 Registro Kill').setStyle(ButtonStyle.Danger),
  )
  return [row0, row1, row2]
}

function buildModal(tipo) {
  const cfg = REGISTRO_CONFIG[tipo]
  const modalMap = {
    atm:          { fields: [['atm_valor','Valor retirado (R$)',1,true],['atm_print','Link da print',0,false],['atm_obs','Observações',2,false]] },
    loja:         { fields: [['loja_produto','Produto vendido',0,true],['loja_qtd','Quantidade',0,true],['loja_valor','Valor total (R$)',0,true],['loja_print','Link da print',0,false],['loja_obs','Observações',2,false]] },
    craco:        { fields: [['craco_qtd','Quantidade produzida',0,true],['craco_valor','Valor total (R$)',0,true],['craco_print','Link da print',0,false],['craco_obs','Observações',2,false]] },
    afk:          { fields: [['afk_motivo','Motivo do AFK',0,true],['afk_tempo','Tempo estimado',0,true],['afk_obs','Observações',2,false]] },
    corrida:      { fields: [['corrida_rota','Rota percorrida',0,true],['corrida_valor','Valor ganho (R$)',0,true],['corrida_print','Link da print',0,false],['corrida_obs','Observações',2,false]] },
    ausencia:     { fields: [['ausencia_inicio','Data de início',0,true],['ausencia_fim','Previsão de retorno',0,true],['ausencia_motivo','Motivo',2,true]] },
    registradora: { fields: [['reg_valor','Valor registrado (R$)',0,true],['reg_print','Link da print',0,false],['reg_obs','Observações',2,false]] },
    kill:         { fields: [['kill_vitima','Vítima(s)',0,true],['kill_motivo','Motivo',0,true],['kill_print','Link da print',0,false],['kill_obs','Observações',2,false]] },
  }
  const modal = new ModalBuilder().setCustomId(cfg.modalId).setTitle(cfg.label)
  for (const [id, label, style, required] of (modalMap[tipo]?.fields ?? []).slice(0, 5)) {
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style === 2 ? 2 : 1).setRequired(required)
    ))
  }
  return modal
}

function buildSelectMessage(tipo) {
  const cfg = REGISTRO_CONFIG[tipo]
  return {
    content: `> **${cfg.label}**\nSelecione os parceiros envolvidos (opcional):`,
    components: [
      new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder().setCustomId(cfg.selectId).setPlaceholder('Selecione os parceiros...').setMinValues(0).setMaxValues(cfg.maxSelect ?? 1)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('cont_select_v13').setLabel('Continuar ➜').setStyle(ButtonStyle.Primary)
      ),
    ],
    ephemeral: true,
  }
}

function getField(interaction, id) { try { return interaction.fields.getTextInputValue(id) } catch { return null } }

async function enviarLogs(guild, tipo, embed) {
  const cfg = REGISTRO_CONFIG[tipo]
  if (tipo === 'registradora') {
    const ch = guild.channels.cache.get(CANAL_REGISTROS_ACOES_ID)
    if (ch) await ch.send({ embeds: [embed] }).catch(console.error)
    return
  }
  for (const alias of cfg.logChannels) {
    const id = CHANNEL_IDS[alias] ?? alias
    const ch = guild.channels.cache.get(id)
    if (ch) await ch.send({ embeds: [embed] }).catch(console.error)
  }
}

function buildLogEmbed(titulo, cor, fields) {
  const e = new EmbedBuilder().setColor(cor).setTitle(titulo).setFooter({ text: FOOTER_TEXT }).setTimestamp()
  for (const [name, value, inline] of fields) e.addFields({ name, value: value ?? '—', inline })
  return e
}

async function execute(interaction) {
  const { customId } = interaction

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

  if (interaction.isUserSelectMenu() && SELECT_TO_TYPE[customId]) {
    const tipo     = SELECT_TO_TYPE[customId]
    const ids      = interaction.values ?? []
    const parceiros = ids.filter(id => id !== interaction.user.id)
    selectContextMap.set(`${interaction.user.id}_${tipo}_users`, parceiros)
    if (interaction.replied || interaction.deferred) return
    await interaction.deferUpdate()
    return
  }

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

  if (interaction.isModalSubmit()) {
    if (interaction.replied || interaction.deferred) return
    const uid = interaction.user.id

    if (customId === 'modal_registro_atm') {
      const parceiros = selectContextMap.get(`${uid}_atm_users`) ?? []
      const embed = buildLogEmbed('🏧 | Registro ATM', COLOR_SUCCESS, [['Membro', `<@${uid}>`, true], ['Valor (R$)', getField(interaction, 'atm_valor'), true]])
      if (parceiros.length > 0) embed.addFields({ name: 'Parceiros', value: parceiros.map(id => `<@${id}>`).join(', '), inline: false })
      const obs = getField(interaction, 'atm_obs'); if (obs) embed.addFields({ name: 'Obs', value: obs })
      const print = getField(interaction, 'atm_print'); if (print?.startsWith('http')) embed.setImage(print)
      await enviarLogs(interaction.guild, 'atm', embed)
      selectContextMap.delete(`${uid}_atm_users`)
      return interaction.reply({ content: '✅ ATM registrado!', ephemeral: true })
    }

    if (customId === 'modal_registro_loja') {
      const parceiros = selectContextMap.get(`${uid}_loja_users`) ?? []
      const embed = buildLogEmbed('🏪 | Registro Loja', COLOR_SUCCESS, [['Membro', `<@${uid}>`, true], ['Produto', getField(interaction,'loja_produto'), true], ['Qtd', getField(interaction,'loja_qtd'), true], ['Valor (R$)', getField(interaction,'loja_valor'), true]])
      if (parceiros.length > 0) embed.addFields({ name: 'Parceiros', value: parceiros.map(id => `<@${id}>`).join(', ') })
      const obs = getField(interaction,'loja_obs'); if (obs) embed.addFields({ name: 'Obs', value: obs })
      const print = getField(interaction,'loja_print'); if (print?.startsWith('http')) embed.setImage(print)
      await enviarLogs(interaction.guild, 'loja', embed)
      selectContextMap.delete(`${uid}_loja_users`)
      return interaction.reply({ content: '✅ Loja registrada!', ephemeral: true })
    }

    if (customId === 'modal_registro_craco') {
      const parceiros = selectContextMap.get(`${uid}_craco_users`) ?? []
      const embed = buildLogEmbed('🌿 | Registro Craco', COLOR_SUCCESS, [['Membro', `<@${uid}>`, true], ['Qtd', getField(interaction,'craco_qtd'), true], ['Valor (R$)', getField(interaction,'craco_valor'), true]])
      if (parceiros.length > 0) embed.addFields({ name: 'Parceiros', value: parceiros.map(id => `<@${id}>`).join(', ') })
      const obs = getField(interaction,'craco_obs'); if (obs) embed.addFields({ name: 'Obs', value: obs })
      await enviarLogs(interaction.guild, 'craco', embed)
      selectContextMap.delete(`${uid}_craco_users`)
      return interaction.reply({ content: '✅ Craco registrado!', ephemeral: true })
    }

    if (customId === 'modal_registro_afk') {
      const embed = buildLogEmbed('💤 | Registro AFK', 0xF39C12, [['Membro', `<@${uid}>`, true], ['Motivo', getField(interaction,'afk_motivo'), true], ['Tempo', getField(interaction,'afk_tempo'), true]])
      const obs = getField(interaction,'afk_obs'); if (obs) embed.addFields({ name: 'Obs', value: obs })
      await enviarLogs(interaction.guild, 'afk', embed)
      return interaction.reply({ content: '✅ AFK registrado!', ephemeral: true })
    }

    if (customId === 'modal_registro_corrida') {
      const embed = buildLogEmbed('🏎️ | Registro Corrida', COLOR_SUCCESS, [['Membro', `<@${uid}>`, true], ['Rota', getField(interaction,'corrida_rota'), true], ['Valor (R$)', getField(interaction,'corrida_valor'), true]])
      const obs = getField(interaction,'corrida_obs'); if (obs) embed.addFields({ name: 'Obs', value: obs })
      const print = getField(interaction,'corrida_print'); if (print?.startsWith('http')) embed.setImage(print)
      await enviarLogs(interaction.guild, 'corrida', embed)
      return interaction.reply({ content: '✅ Corrida registrada!', ephemeral: true })
    }

    if (customId === 'modal_ausencia') {
      const embed = buildLogEmbed('📅 | Registro de Ausência', 0xF39C12, [['Membro', `<@${uid}>`, true], ['Início', getField(interaction,'ausencia_inicio'), true], ['Retorno', getField(interaction,'ausencia_fim'), true], ['Motivo', getField(interaction,'ausencia_motivo'), false]])
      await enviarLogs(interaction.guild, 'ausencia', embed)
      return interaction.reply({ content: '✅ Ausência registrada!', ephemeral: true })
    }

    if (customId === 'modal_registro_registradora') {
      const parceiros = selectContextMap.get(`${uid}_registradora_users`) ?? []
      const embed = buildLogEmbed('🏦 | Registro Registradora', COLOR_SUCCESS, [['Membro', `<@${uid}>`, true], ['Valor (R$)', getField(interaction,'reg_valor'), true]])
      if (parceiros.length > 0) embed.addFields({ name: 'Parceiros', value: parceiros.map(id => `<@${id}>`).join(', ') })
      const obs = getField(interaction,'reg_obs'); if (obs) embed.addFields({ name: 'Obs', value: obs })
      await enviarLogs(interaction.guild, 'registradora', embed)
      selectContextMap.delete(`${uid}_registradora_users`)
      return interaction.reply({ content: '✅ Registradora registrada!', ephemeral: true })
    }

    if (customId === 'modal_registro_kill') {
      const embed = buildLogEmbed('💀 | Registro Kill', COLOR_ERROR, [['Executado por', `<@${uid}>`, true], ['Vítima(s)', getField(interaction,'kill_vitima'), true], ['Motivo', getField(interaction,'kill_motivo'), false]])
      const obs = getField(interaction,'kill_obs'); if (obs) embed.addFields({ name: 'Obs', value: obs })
      const print = getField(interaction,'kill_print'); if (print?.startsWith('http')) embed.setImage(print)
      await enviarLogs(interaction.guild, 'kill', embed)
      return interaction.reply({ content: '✅ Kill registrado!', ephemeral: true })
    }
  }
}

module.exports = { customIds, execute, buildEmbedMembros, buildMemberPanelRows }
