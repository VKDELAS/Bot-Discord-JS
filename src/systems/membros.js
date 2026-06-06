// src/systems/membros.js — Painel de Membros MS-13
'use strict'

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, EmbedBuilder,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
} = require('discord.js')

const {
  CHANNEL_IDS, CANAL_REGISTROS_ACOES_ID,
  COLOR_MS13, COLOR_SUCCESS, COLOR_ERROR, COLOR_WARNING, FOOTER_TEXT,
} = require('../config/settings.js')

const selectContextMap = new Map()

// ─── CUSTOM IDs ───────────────────────────────────────────────────────────────
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
  loja:         { label: '🏪 Registro Loja',         modalId: 'modal_registro_loja',         selectId: 'select_registro_loja_v13',         maxSelect: 3, minSelect: 2, comParceiro: true,  logChannels: ['logs_loja'] },
  craco:        { label: '🌿 Registro Craco',        modalId: 'modal_registro_craco',        selectId: 'select_registro_craco_v13',        maxSelect: 2, comParceiro: true,  logChannels: ['logs_craco'] },
  afk:          { label: '💤 Registro AFK',          modalId: 'modal_registro_afk',          comParceiro: false, logChannels: ['logs_afk'] },
  corrida:      { label: '🏎️ Registro Corrida',     modalId: 'modal_registro_corrida',      comParceiro: false, logChannels: ['logs_corrida'] },
  ausencia:     { label: '📅 Registro Ausência',     modalId: 'modal_ausencia',              comParceiro: false, logChannels: ['logs_ausencia', 'pub_ausentes'] },
  registradora: { label: '🏦 Registro Registradora', modalId: 'modal_registro_registradora', selectId: 'select_registro_registradora_v13', maxSelect: 1, comParceiro: true, logChannels: [] },
  kill:         { label: '💀 Registro Kill',         modalId: 'modal_registro_kill',         comParceiro: false, logChannels: ['logs_kill', 'pub_kill'] },
}

// ─── PAINEL V2 (Components V2) ────────────────────────────────────────────────

function buildMembrosV2() {
  const container = new ContainerBuilder()
    .setAccentColor(COLOR_MS13)

  // ── Cabeçalho ──────────────────────────────────────────────────────────────
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '# 🔫 MS-13 — Painel de Membros\n' +
      '-# Sistema de registro de atividades da facção'
    )
  )

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(2))

  // ── Seção: Farm & Dinheiro ─────────────────────────────────────────────────
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '## 💰 Farm & Dinheiro\n' +
      '> **🏧 ATM** — Registre retiradas de caixas eletrônicos. Selecione parceiros envolvidos.\n' +
      '> **🏪 Loja** — Registre assaltos a lojas. Informe produto, quantidade e valor.\n' +
      '> **🏦 Registradora** — Registre ações na registradora. Selecione parceiros.'
    )
  )

  // Fileira 1: ATM, Loja, Registradora
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mp_atm').setLabel('🏧 ATM').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('mp_loja').setLabel('🏪 Loja').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('mp_registradora').setLabel('🏦 Registradora').setStyle(ButtonStyle.Primary),
    )
  )

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(1))

  // ── Seção: Produção & Ação ─────────────────────────────────────────────────
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '## ⚡ Produção & Ação\n' +
      '> **🌿 Craco** — Registre produções de drogas. Informe quantidade e selecione parceiros.\n' +
      '> **🏎️ Corrida** — Registre participações em corridas. Informe rota e valor ganho.\n' +
      '> **💀 Kill** — Registre eliminações. Informe vítima(s) e motivo do abate.'
    )
  )

  // Fileira 2: Craco, Corrida, Kill
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mp_craco').setLabel('🌿 Craco').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('mp_corrida').setLabel('🏎️ Corrida').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('mp_kill').setLabel('💀 Kill').setStyle(ButtonStyle.Danger),
    )
  )

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(1))

  // ── Seção: Disponibilidade ─────────────────────────────────────────────────
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '## 📋 Disponibilidade\n' +
      '> **💤 AFK** — Notifique saídas temporárias durante atividade. Informe motivo e tempo.\n' +
      '> **📅 Ausência** — Registre afastamentos programados. Informe datas e motivo.'
    )
  )

  // Fileira 3: AFK, Ausência
  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mp_afk').setLabel('💤 AFK').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('mp_ausencia').setLabel('📅 Ausência').setStyle(ButtonStyle.Secondary),
    )
  )

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(2))

  // ── Rodapé / Avisos ────────────────────────────────────────────────────────
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

function buildEmbedMembros() {
  return null
}

function buildMemberPanelRows() {
  return []
}

// ─── MODAIS ───────────────────────────────────────────────────────────────────

function buildModal(tipo) {
  const cfg = REGISTRO_CONFIG[tipo]
  const modalMap = {
    // Campos idênticos ao membros.py (Python)
    atm:          { fields: [['atm_data','Data e Hora (ex: 25/01/2026 21:30)',0,true],['atm_valor','Valor Obtido (ex: R$ 15.000)',0,true],['atm_print','Link da Print (Imgur)',0,false]] },
    loja:         { fields: [['loja_data','Data e Hora (ex: 25/01/2026 21:30)',0,true],['loja_valor','Valor Obtido (ex: R$ 12.000)',0,true],['loja_print','Link da Print (Imgur)',0,false]] },
    craco:        { fields: [['craco_data','Data e Hora (ex: 25/01/2026 21:30)',0,true],['craco_qtd','Quantidade Produzida (ex: 50 gramas)',0,true],['craco_print','Link da Print (Imgur)',0,false]] },
    afk:          { fields: [['afk_motivo','Motivo da Saída (ex: Problema pessoal)',0,true],['afk_saida','Horário de Saída (ex: 21:30)',0,true],['afk_retorno','Horário de Retorno (ex: 22:30)',0,true]] },
    corrida:      { fields: [['corrida_data','Data e Hora (ex: 25/01/2026 21:30)',0,true],['corrida_posicao','Posição Final (ex: 1º lugar)',0,true],['corrida_veiculo','Veículo Utilizado (ex: Sultan)',0,true],['corrida_print','Link da Print (Imgur)',0,false]] },
    ausencia:     { fields: [['ausencia_inicio','Data de Saída (ex: 25/01/2026)',0,true],['ausencia_fim','Data de Retorno (ex: 28/01/2026)',0,true],['ausencia_motivo','Motivo (ex: Viagem de trabalho)',2,true]] },
    registradora: { fields: [['reg_data','Data e Hora (ex: 25/01/2026 21:30)',0,true],['reg_valor','Valor Obtido (ex: R$ 8.000)',0,true],['reg_print','Link da Print (Imgur)',0,false]] },
    kill:         { fields: [['kill_alvo','Facção / Alvo (ex: Vagos, Ballas)',0,true],['kill_qtd','Quantidade de Abates (ex: 5)',0,true],['kill_data','Data e Hora (ex: 25/01/2026 21:30)',0,true],['kill_print','Link da Print (Imgur)',0,false]] },
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

  // Mensagem com Components V2 para seleção de parceiros
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
      new TextDisplayBuilder().setContent(
        `-# ${FOOTER_TEXT}`
      )
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

function buildLogEmbed(titulo, cor, fields, autor) {
  const e = new EmbedBuilder()
    .setColor(cor)
    .setTitle(titulo)
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp()
  if (autor) e.setAuthor({ name: autor.tag, iconURL: autor.displayAvatarURL?.({ dynamic: true }) ?? undefined })
  for (const [name, value, inline] of fields) e.addFields({ name, value: value ?? '—', inline: inline ?? false })
  return e
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

  // Select de parceiros → salva contexto
  if (interaction.isUserSelectMenu() && SELECT_TO_TYPE[customId]) {
    const tipo      = SELECT_TO_TYPE[customId]
    const ids       = interaction.values ?? []
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
      const parceiros = selectContextMap.get(`${uid}_atm_users`) ?? []
      const embed = buildLogEmbed('🏧 Registro de ATM', COLOR_SUCCESS, [
        ['👤 Membro',      `<@${uid}>`,                              true],
        ['🕐 Data e Hora', getField(interaction, 'atm_data'),       true],
        ['💰 Valor',       getField(interaction, 'atm_valor'),      true],
        ...(parceiros.length > 0 ? [['👥 Parceiros', parceiros.map(id => `<@${id}>`).join(', '), false]] : []),
      ], interaction.user)
      const print = getField(interaction, 'atm_print')
      if (print?.startsWith('http')) embed.setImage(print)
      await enviarLogs(interaction.guild, 'atm', embed)
      selectContextMap.delete(`${uid}_atm_users`)
      return interaction.reply({ content: '✅ ATM registrado com sucesso!', ephemeral: true })
    }

    // ── Loja ──
    if (customId === 'modal_registro_loja') {
      const parceiros = selectContextMap.get(`${uid}_loja_users`) ?? []
      const embed = buildLogEmbed('🏪 Registro de Loja', COLOR_SUCCESS, [
        ['👤 Membro',      `<@${uid}>`,                              true],
        ['🕐 Data e Hora', getField(interaction, 'loja_data'),      true],
        ['💰 Valor',       getField(interaction, 'loja_valor'),     true],
        ...(parceiros.length > 0 ? [['👥 Parceiros', parceiros.map(id => `<@${id}>`).join(', '), false]] : []),
      ], interaction.user)
      const print = getField(interaction, 'loja_print')
      if (print?.startsWith('http')) embed.setImage(print)
      await enviarLogs(interaction.guild, 'loja', embed)
      selectContextMap.delete(`${uid}_loja_users`)
      return interaction.reply({ content: '✅ Loja registrada com sucesso!', ephemeral: true })
    }

    // ── Craco ──
    if (customId === 'modal_registro_craco') {
      const parceiros = selectContextMap.get(`${uid}_craco_users`) ?? []
      const embed = buildLogEmbed('🌿 Registro de Craco', COLOR_SUCCESS, [
        ['👤 Membro',              `<@${uid}>`,                            true],
        ['🕐 Data e Hora',          getField(interaction, 'craco_data'),   true],
        ['📦 Qtd. Produzida',       getField(interaction, 'craco_qtd'),    true],
        ...(parceiros.length > 0 ? [['👥 Parceiros', parceiros.map(id => `<@${id}>`).join(', '), false]] : []),
      ], interaction.user)
      const print = getField(interaction, 'craco_print')
      if (print?.startsWith('http')) embed.setImage(print)
      await enviarLogs(interaction.guild, 'craco', embed)
      selectContextMap.delete(`${uid}_craco_users`)
      return interaction.reply({ content: '✅ Craco registrado com sucesso!', ephemeral: true })
    }

    // ── AFK ──
    if (customId === 'modal_registro_afk') {
      const embed = buildLogEmbed('💤 Registro de AFK', COLOR_WARNING, [
        ['👤 Membro',             `<@${uid}>`,                               true],
        ['📝 Motivo',              getField(interaction, 'afk_motivo'),      false],
        ['🚪 Saída',               getField(interaction, 'afk_saida'),       true],
        ['🔙 Retorno Previsto',    getField(interaction, 'afk_retorno'),     true],
      ], interaction.user)
      await enviarLogs(interaction.guild, 'afk', embed)
      return interaction.reply({ content: '✅ AFK registrado com sucesso!', ephemeral: true })
    }

    // ── Corrida ──
    if (customId === 'modal_registro_corrida') {
      const embed = buildLogEmbed('🏎️ Registro de Corrida', COLOR_SUCCESS, [
        ['👤 Membro',            `<@${uid}>`,                                  true],
        ['🕐 Data e Hora',        getField(interaction, 'corrida_data'),       true],
        ['🏆 Posição Final',      getField(interaction, 'corrida_posicao'),    true],
        ['🚗 Veículo',            getField(interaction, 'corrida_veiculo'),    true],
      ], interaction.user)
      const print = getField(interaction, 'corrida_print')
      if (print?.startsWith('http')) embed.setImage(print)
      await enviarLogs(interaction.guild, 'corrida', embed)
      return interaction.reply({ content: '✅ Corrida registrada com sucesso!', ephemeral: true })
    }

    // ── Ausência ──
    if (customId === 'modal_ausencia') {
      const embed = buildLogEmbed('📅 Registro de Ausência', COLOR_WARNING, [
        ['👤 Membro',         `<@${uid}>`,                                   true],
        ['📤 Data de Saída',   getField(interaction, 'ausencia_inicio'),     true],
        ['📥 Data de Retorno', getField(interaction, 'ausencia_fim'),        true],
        ['📝 Motivo',          getField(interaction, 'ausencia_motivo'),     false],
      ], interaction.user)
      await enviarLogs(interaction.guild, 'ausencia', embed)
      return interaction.reply({ content: '✅ Ausência registrada com sucesso!', ephemeral: true })
    }

    // ── Registradora ──
    if (customId === 'modal_registro_registradora') {
      const parceiros = selectContextMap.get(`${uid}_registradora_users`) ?? []
      const embed = buildLogEmbed('🏦 Registro de Registradora', COLOR_SUCCESS, [
        ['👤 Membro',      `<@${uid}>`,                            true],
        ['🕐 Data e Hora', getField(interaction, 'reg_data'),     true],
        ['💰 Valor',       getField(interaction, 'reg_valor'),    true],
        ...(parceiros.length > 0 ? [['👥 Parceiros', parceiros.map(id => `<@${id}>`).join(', '), false]] : []),
      ], interaction.user)
      const print = getField(interaction, 'reg_print')
      if (print?.startsWith('http')) embed.setImage(print)
      await enviarLogs(interaction.guild, 'registradora', embed)
      selectContextMap.delete(`${uid}_registradora_users`)
      return interaction.reply({ content: '✅ Registradora registrada com sucesso!', ephemeral: true })
    }

    // ── Kill ──
    if (customId === 'modal_registro_kill') {
      const embed = buildLogEmbed('💀 Registro de Kill', COLOR_ERROR, [
        ['👤 Executado por',       `<@${uid}>`,                            true],
        ['🎯 Facção / Alvo',        getField(interaction, 'kill_alvo'),    true],
        ['☠️ Qtd. de Abates',       getField(interaction, 'kill_qtd'),     true],
        ['🕐 Data e Hora',          getField(interaction, 'kill_data'),    true],
      ], interaction.user)
      const print = getField(interaction, 'kill_print')
      if (print?.startsWith('http')) embed.setImage(print)
      await enviarLogs(interaction.guild, 'kill', embed)
      return interaction.reply({ content: '✅ Kill registrado com sucesso!', ephemeral: true })
    }
  }
}

module.exports = { customIds, execute, buildEmbedMembros, buildMemberPanelRows, buildMembrosV2 }