// src/systems/recrutamento.js — Etapa 7
'use strict'

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, PermissionFlagsBits, ChannelType,
} = require('discord.js')
const Database = require('better-sqlite3')
const fs       = require('fs')
const path     = require('path')
const moment   = require('moment-timezone')

const BR_TZ       = 'America/Sao_Paulo'
const COLOR_MS13    = 0x0000FF
const COLOR_SUCCESS = 0x2ECC71
const COLOR_ERROR   = 0xE74C3C
const COLOR_WARNING = 0xF39C12
const COLOR_INFO    = 0x3498DB
const COLOR_REC     = 0x9B59B6
const FOOTER_TEXT   = 'MS-13 Roleplay © Todos os direitos reservados'

const ROLE_IDS = {
  lider:      '1469085061373628437',
  sub_lider:  '1471295287896178892',
  recrutador: '1469085227757605002',
  membro:     '1471295722937647239',
  meta_paga:  '1486403263657152674',
  etapa2:     '1469086279613288741',
}
const ROLES = {
  isento: ['1469085061373628437','1471295287896178892','1469085227757605002','1469085338046697572','1469085446108741780','1469131886533017671'],
}
const MS13_ROLE_ID = '1469085564920795371'
const CHANNEL_IDS  = { logs_recrutamento: '1483674983887667250' }
const REC_CHANNEL_IDS = {
  painel_formulario:   '1488347348756332685',
  relatorio_rec:       '1488347471230013510',
  recrutadores:        '1488347411784007690',
  top_tickets:         '1488347411784007690',
  blacklist:           '1488347509599502356',
  logs_relatorios_rec: '1492865227908317324',
  categoria_rec:       '0',
}
const _PERM_TICKET_ROLE_ID = '1478161626187432077'
const REC_DB = 'ms13_recrutamento.db'

// ── DB ────────────────────────────────────────────────────────────────────────
let _db = null
function getDb() {
  if (!_db) {
    _db = new Database(REC_DB)
    _db.exec(`
      CREATE TABLE IF NOT EXISTS recrutamentos (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        candidato_id  TEXT NOT NULL,
        recrutador_id TEXT,
        ticket_id     TEXT,
        status        TEXT DEFAULT 'aberto',
        criado_em     TEXT DEFAULT (datetime('now','localtime')),
        fechado_em    TEXT
      );
      CREATE TABLE IF NOT EXISTS blacklist (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id       TEXT NOT NULL UNIQUE,
        motivo        TEXT,
        adicionado_por TEXT,
        adicionado_em  TEXT DEFAULT (datetime('now','localtime'))
      );
      CREATE TABLE IF NOT EXISTS perguntas (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        texto       TEXT NOT NULL,
        obrigatoria INTEGER DEFAULT 1,
        max_chars   INTEGER DEFAULT 500,
        ordem       INTEGER DEFAULT 0
      );
    `)
  }
  return _db
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isStaff(member)      { return ROLES.isento.some(id => member.roles.cache.has(id)) }
function isRecrutador(member) { return member.roles.cache.has(ROLE_IDS.recrutador) || isStaff(member) }
function agora()              { return moment().tz(BR_TZ).format('DD/MM/YYYY HH:mm') }
function footerEmbed()        { return { text: FOOTER_TEXT } }

// ── Views ─────────────────────────────────────────────────────────────────────
function buildTicketRecView() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rec_fechar').setLabel('🔒 Fechar').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('rec_assumir').setLabel('✋ Assumir').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('rec_renomear').setLabel('✏️ Renomear').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rec_enviar_form').setLabel('📋 Enviar Formulário').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('rec_cancel_timer').setLabel('⏹ Cancelar Timer').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rec_aprovar_m').setLabel('✅ Aprovar').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('rec_reprovar_m').setLabel('❌ Reprovar').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('rec_blacklist').setLabel('🚫 Blacklist').setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rec_gerar_tkt').setLabel('🎫 Gerar Ticket').setStyle(ButtonStyle.Primary),
    ),
  ]
}

function buildPainelFormularioView() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rec_add_q').setLabel('➕ Adicionar').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('rec_edit_q').setLabel('✏️ Editar').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('rec_rem_q').setLabel('🗑 Remover').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('rec_timer_q').setLabel('⏱ Timer').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rec_view_q').setLabel('👁 Ver Perguntas').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('rec_refresh_q').setLabel('🔄 Atualizar').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('rec_export_q').setLabel('📤 Exportar').setStyle(ButtonStyle.Secondary),
    ),
  ]
}

// ── Embeds ────────────────────────────────────────────────────────────────────
function buildPainelFormularioEmbed() {
  const db        = getDb()
  const perguntas = db.prepare('SELECT * FROM perguntas ORDER BY ordem ASC').all()
  return new EmbedBuilder()
    .setColor(COLOR_REC)
    .setTitle('📋 Painel de Formulário — Recrutamento')
    .setDescription(
      perguntas.length === 0
        ? '*Nenhuma pergunta cadastrada ainda.*'
        : perguntas.map((p, i) => `**${i + 1}.** ${p.texto}\n> Obrigatória: ${p.obrigatoria ? 'Sim' : 'Não'} | Máx: ${p.max_chars} chars`).join('\n\n')
    )
    .setFooter({ text: 'PAINEL_FORM — ' + FOOTER_TEXT })
    .setTimestamp()
}

function buildPainelFormulario() {
  return { embeds: [buildPainelFormularioEmbed()], components: buildPainelFormularioView() }
}

function buildPainelRelatorio() {
  return { embeds: [new EmbedBuilder().setColor(COLOR_REC).setTitle('📊 Relatório de Recrutamento').setDescription('Use o botão abaixo para gerar seu relatório.').setFooter(footerEmbed()).setTimestamp()], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rec_gerar_rel_v14').setLabel('📊 Gerar Relatório').setStyle(ButtonStyle.Primary))] }
}

function buildPainelBlacklist() {
  return { embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle('🚫 Blacklist — Recrutamento').setDescription('Lista de usuários banidos do processo seletivo.').setFooter(footerEmbed()).setTimestamp()], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('rec_blacklist_v14').setLabel('👁 Ver Blacklist').setStyle(ButtonStyle.Danger))] }
}

async function buildTopRecrutadores(guild) {
  const db    = getDb()
  const dados = db.prepare(`SELECT recrutador_id, COUNT(*) as total FROM recrutamentos WHERE recrutador_id IS NOT NULL AND status = 'aprovado' GROUP BY recrutador_id ORDER BY total DESC LIMIT 10`).all()
  return { embeds: [new EmbedBuilder().setColor(COLOR_REC).setTitle('🏆 Ranking de Recrutadores').setDescription(dados.length === 0 ? '*Nenhum recrutamento aprovado ainda.*' : dados.map((d, i) => { const m = guild.members.cache.get(d.recrutador_id); return `**${i + 1}.** ${m ? m.displayName : `<@${d.recrutador_id}>`} — ${d.total} aprovação(ões)` }).join('\n')).setFooter({ text: 'TKT_RANK — ' + FOOTER_TEXT }).setTimestamp()] }
}

async function buildTopRecrutadoresVazio() {
  return { embeds: [new EmbedBuilder().setColor(COLOR_REC).setTitle('🏆 Ranking de Recrutadores').setDescription('*Ranking resetado. Nenhum recrutamento registrado.*').setFooter({ text: 'TKT_RANK — ' + FOOTER_TEXT }).setTimestamp()] }
}

function buildRecContent(userMention, responsavel) {
  return `## 🎫 Ticket de Recrutamento\n> **Candidato:** ${userMention}\n> **Responsável:** ${responsavel || 'Aguardando'}\n> **Aberto em:** ${agora()}`
}

// ── Ranking ───────────────────────────────────────────────────────────────────
let _rankingEmAndamento = false
async function atualizarRankingRecrutadores(guild) {
  if (_rankingEmAndamento) return
  _rankingEmAndamento = true
  try {
    const payload = await buildTopRecrutadores(guild)
    const channel = guild.channels.cache.get(REC_CHANNEL_IDS.recrutadores)
    if (!channel) return
    const messages = await channel.messages.fetch({ limit: 20 })
    const existing = messages.find(m => m.author.id === guild.client.user.id && m.embeds[0]?.footer?.text?.includes('TKT_RANK'))
    if (existing) await existing.edit(payload)
    else await channel.send(payload)
  } catch (err) { console.error('[REC] Erro ao atualizar ranking:', err) }
  finally { _rankingEmAndamento = false }
}

// ── Entrevista ────────────────────────────────────────────────────────────────
async function _conduzirEntrevista(channel, candidatoId) {
  const db        = getDb()
  const perguntas = db.prepare('SELECT * FROM perguntas ORDER BY ordem ASC').all()
  if (perguntas.length === 0) { await channel.send('⚠️ Nenhuma pergunta cadastrada.'); return null }
  const respostas = []
  for (const pergunta of perguntas) {
    await channel.send({ embeds: [new EmbedBuilder().setColor(COLOR_INFO).setDescription(`❓ **${pergunta.texto}**\n\n> Responda abaixo. Você tem **5 minutos**.`).setFooter({ text: `Pergunta ${perguntas.indexOf(pergunta) + 1}/${perguntas.length}` })] })
    try {
      const coletadas = await channel.awaitMessages({ filter: m => m.author.id === candidatoId, max: 1, time: 300_000, errors: ['time'] })
      const resposta  = coletadas.first().content.trim()
      if (pergunta.obrigatoria && resposta.length === 0) { await channel.send('❌ Pergunta obrigatória. Entrevista encerrada.'); return null }
      if (resposta.length > pergunta.max_chars) { await channel.send(`❌ Resposta muito longa (máx. ${pergunta.max_chars} chars). Encerrada.`); return null }
      respostas.push({ pergunta: pergunta.texto, resposta })
    } catch { await channel.send('⏰ Tempo esgotado. Entrevista encerrada.'); return null }
  }
  return respostas
}

// ── Aprovar membro ────────────────────────────────────────────────────────────
async function _aprovarMembro(interaction, nomeIC, idMTA) {
  const guild  = interaction.guild
  const ticket = interaction.channel
  const candidatoId = ticket.topic?.match(/\d{17,19}/)?.[0]
  if (!candidatoId) return interaction.reply({ content: '❌ Candidato não identificado.', ephemeral: true })
  const member = await guild.members.fetch(candidatoId).catch(() => null)
  if (!member) return interaction.reply({ content: '❌ Candidato não encontrado.', ephemeral: true })
  const novoNick = `Ⓜ・ ${nomeIC} ${idMTA}`
  try { await member.setNickname(novoNick) } catch { await interaction.followUp({ content: '⚠️ Não foi possível alterar o nick.', ephemeral: true }) }
  await member.roles.add([ROLE_IDS.etapa2, ROLE_IDS.membro, MS13_ROLE_ID]).catch(() => null)
  const db = getDb()
  db.prepare(`UPDATE recrutamentos SET status = 'aprovado', fechado_em = datetime('now','localtime') WHERE candidato_id = ? AND status = 'aberto'`).run(candidatoId)
  const logCh = guild.channels.cache.get(CHANNEL_IDS.logs_recrutamento)
  if (logCh) await logCh.send({ embeds: [new EmbedBuilder().setColor(COLOR_SUCCESS).setTitle('✅ Membro Aprovado').addFields({ name: 'Candidato', value: `<@${candidatoId}>`, inline: true }, { name: 'Aprovado por', value: `<@${interaction.user.id}>`, inline: true }, { name: 'Nick', value: novoNick, inline: true }, { name: 'Data', value: agora(), inline: true }).setFooter(footerEmbed())] })
  await interaction.reply({ embeds: [new EmbedBuilder().setColor(COLOR_SUCCESS).setTitle('✅ Membro aprovado!').setDescription(`${member} foi aprovado como **Morador** da MS-13.`).setFooter(footerEmbed())] })
  await atualizarRankingRecrutadores(guild)
}

// ── Execute ───────────────────────────────────────────────────────────────────
async function execute(interaction) {
  const id = interaction.customId

  if (id === 'rec_fechar') {
    if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    return interaction.showModal(new ModalBuilder().setCustomId('modal_fechar_ticket').setTitle('Fechar Ticket').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('motivo_fechar').setLabel('Motivo do fechamento').setStyle(TextInputStyle.Paragraph).setRequired(true))))
  }

  if (id === 'modal_fechar_ticket') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply()
    const motivo = interaction.fields.getTextInputValue('motivo_fechar')
    const db = getDb()
    const candidatoId = interaction.channel.topic?.match(/\d{17,19}/)?.[0]
    if (candidatoId) db.prepare(`UPDATE recrutamentos SET status = 'fechado', fechado_em = datetime('now','localtime') WHERE candidato_id = ? AND status = 'aberto'`).run(candidatoId)
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle('🔒 Ticket Fechado').addFields({ name: 'Fechado por', value: `<@${interaction.user.id}>` }, { name: 'Motivo', value: motivo }).setFooter(footerEmbed())] })
    setTimeout(() => interaction.channel.delete().catch(() => null), 5_000)
    return
  }

  if (id === 'rec_assumir') {
    if (!isRecrutador(interaction.member)) return interaction.reply({ content: '❌ Apenas recrutadores podem assumir.', ephemeral: true })
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply()
    const db = getDb()
    const candidatoId = interaction.channel.topic?.match(/\d{17,19}/)?.[0]
    if (candidatoId) db.prepare(`UPDATE recrutamentos SET recrutador_id = ? WHERE candidato_id = ? AND status = 'aberto'`).run(interaction.user.id, candidatoId)
    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLOR_SUCCESS).setDescription(`✅ <@${interaction.user.id}> assumiu este ticket.`).setFooter(footerEmbed())] })
  }

  if (id === 'rec_renomear') {
    if (!isRecrutador(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    return interaction.showModal(new ModalBuilder().setCustomId('modal_renomear').setTitle('Renomear Ticket').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('novo_nome').setLabel('Novo nome do canal').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(90))))
  }

  if (id === 'modal_renomear') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    const novoNome = interaction.fields.getTextInputValue('novo_nome').toLowerCase().replace(/\s+/g, '-')
    await interaction.channel.setName(novoNome).catch(() => null)
    return interaction.editReply({ content: `✅ Canal renomeado para **${novoNome}**.` })
  }

  if (id === 'rec_enviar_form') {
    if (!isRecrutador(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    const candidatoId = interaction.channel.topic?.match(/\d{17,19}/)?.[0]
    if (!candidatoId) return interaction.editReply({ content: '❌ Candidato não identificado.' })
    await interaction.editReply({ content: '✅ Iniciando entrevista...' })
    const respostas = await _conduzirEntrevista(interaction.channel, candidatoId)
    if (!respostas) return
    await interaction.channel.send({ embeds: [new EmbedBuilder().setColor(COLOR_REC).setTitle('📋 Respostas do Formulário').setDescription(respostas.map((r, i) => `**${i + 1}. ${r.pergunta}**\n> ${r.resposta}`).join('\n\n')).setFooter({ text: `Candidato: ${candidatoId} | ${FOOTER_TEXT}` }).setTimestamp()] })
    return
  }

  if (id === 'rec_cancel_timer') { return interaction.reply({ content: '⏹ Timer cancelado.', ephemeral: true }) }

  if (id === 'rec_aprovar_m') {
    if (!isRecrutador(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    return interaction.showModal(new ModalBuilder().setCustomId('modal_aprovar_membro').setTitle('Aprovar Membro').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nome_ic').setLabel('Nome IC do personagem').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('id_mta').setLabel('ID MTA do personagem').setStyle(TextInputStyle.Short).setRequired(true)),
    ))
  }

  if (id === 'modal_aprovar_membro') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply()
    return _aprovarMembro(interaction, interaction.fields.getTextInputValue('nome_ic').trim(), interaction.fields.getTextInputValue('id_mta').trim())
  }

  if (id === 'rec_reprovar_m') {
    if (!isRecrutador(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply()
    const candidatoId = interaction.channel.topic?.match(/\d{17,19}/)?.[0]
    if (candidatoId) getDb().prepare(`UPDATE recrutamentos SET status = 'reprovado', fechado_em = datetime('now','localtime') WHERE candidato_id = ? AND status = 'aberto'`).run(candidatoId)
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle('❌ Candidato Reprovado').setDescription(`<@${candidatoId}> foi reprovado.`).addFields({ name: 'Reprovado por', value: `<@${interaction.user.id}>`, inline: true }).setFooter(footerEmbed())] })
    setTimeout(() => interaction.channel.delete().catch(() => null), 8_000)
    return
  }

  if (id === 'rec_blacklist') {
    if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    return interaction.showModal(new ModalBuilder().setCustomId('modal_blacklist').setTitle('Adicionar à Blacklist').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('motivo_bl').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(true))))
  }

  if (id === 'modal_blacklist') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply()
    const motivo      = interaction.fields.getTextInputValue('motivo_bl')
    const candidatoId = interaction.channel.topic?.match(/\d{17,19}/)?.[0]
    if (!candidatoId) return interaction.editReply({ content: '❌ Candidato não identificado.' })
    getDb().prepare('INSERT OR REPLACE INTO blacklist (user_id, motivo, adicionado_por) VALUES (?, ?, ?)').run(candidatoId, motivo, interaction.user.id)
    const blCh = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.blacklist)
    if (blCh) await blCh.send({ embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle('🚫 Adicionado à Blacklist').addFields({ name: 'Usuário', value: `<@${candidatoId}>`, inline: true }, { name: 'Por', value: `<@${interaction.user.id}>`, inline: true }, { name: 'Motivo', value: motivo }, { name: 'Data', value: agora(), inline: true }).setFooter(footerEmbed())] })
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle('🚫 Blacklist atualizada').setDescription(`<@${candidatoId}> adicionado.\n**Motivo:** ${motivo}`).setFooter(footerEmbed())] })
    setTimeout(() => interaction.channel.delete().catch(() => null), 8_000)
    return
  }

  if (id === 'rec_gerar_tkt') {
    if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    const guild     = interaction.guild
    const categoria = REC_CHANNEL_IDS.categoria_rec !== '0' ? guild.channels.cache.get(REC_CHANNEL_IDS.categoria_rec) : null
    const nomeCanal = `rec-${interaction.user.username}-${Date.now().toString().slice(-4)}`
    const novoCanal = await guild.channels.create({
      name: nomeCanal, type: ChannelType.GuildText, parent: categoria || undefined,
      topic: `Candidato: ${interaction.user.id}`,
      permissionOverwrites: [
        { id: guild.id,                 deny:  [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id,      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: _PERM_TICKET_ROLE_ID,     allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ],
    })
    getDb().prepare('INSERT INTO recrutamentos (candidato_id, ticket_id, status) VALUES (?, ?, \'aberto\')').run(interaction.user.id, novoCanal.id)
    await novoCanal.send({ content: buildRecContent(`<@${interaction.user.id}>`, `<@${interaction.user.id}>`), embeds: [new EmbedBuilder().setColor(COLOR_REC).setTitle('🎫 Ticket de Recrutamento').setDescription(`Candidato: <@${interaction.user.id}>\nResponsável: Aguardando`).addFields({ name: 'Status', value: '🟡 Em andamento', inline: true }, { name: 'Aberto em', value: agora(), inline: true }).setFooter(footerEmbed()).setTimestamp()], components: buildTicketRecView() })
    return interaction.editReply({ content: `✅ Ticket criado: ${novoCanal}` })
  }

  if (id === 'rec_add_q') {
    return interaction.showModal(new ModalBuilder().setCustomId('modal_add_pergunta').setTitle('Adicionar Pergunta').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('texto_pergunta').setLabel('Texto da pergunta').setStyle(TextInputStyle.Paragraph).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('max_chars').setLabel('Máx. caracteres (padrão 500)').setStyle(TextInputStyle.Short).setRequired(false)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('obrigatoria').setLabel('Obrigatória? (sim/não)').setStyle(TextInputStyle.Short).setRequired(false)),
    ))
  }

  if (id === 'modal_add_pergunta') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    const texto      = interaction.fields.getTextInputValue('texto_pergunta').trim()
    const maxChars   = parseInt(interaction.fields.getTextInputValue('max_chars').trim()) || 500
    const obRaw      = interaction.fields.getTextInputValue('obrigatoria').trim().toLowerCase()
    const obrigatoria = (obRaw === 'não' || obRaw === 'nao' || obRaw === 'n') ? 0 : 1
    const db   = getDb()
    const ordem = (db.prepare('SELECT MAX(ordem) as m FROM perguntas').get()?.m ?? 0) + 1
    db.prepare('INSERT INTO perguntas (texto, obrigatoria, max_chars, ordem) VALUES (?, ?, ?, ?)').run(texto, obrigatoria, maxChars, ordem)
    await interaction.editReply({ content: '✅ Pergunta adicionada!' })
    const painelCh = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.painel_formulario)
    if (painelCh) { const msgs = await painelCh.messages.fetch({ limit: 10 }); const msg = msgs.find(m => m.author.id === interaction.client.user.id && m.embeds[0]?.footer?.text?.includes('PAINEL_FORM')); if (msg) await msg.edit({ embeds: [buildPainelFormularioEmbed()] }) }
    return
  }

  if (id === 'rec_edit_q') {
    return interaction.showModal(new ModalBuilder().setCustomId('modal_editar_pergunta').setTitle('Editar Pergunta').addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('id_pergunta').setLabel('ID da pergunta').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('novo_texto').setLabel('Novo texto').setStyle(TextInputStyle.Paragraph).setRequired(true)),
    ))
  }

  if (id === 'modal_editar_pergunta') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    const idP      = parseInt(interaction.fields.getTextInputValue('id_pergunta'))
    const novoTexto = interaction.fields.getTextInputValue('novo_texto').trim()
    const r = getDb().prepare('UPDATE perguntas SET texto = ? WHERE id = ?').run(novoTexto, idP)
    if (r.changes === 0) return interaction.editReply({ content: '❌ Pergunta não encontrada.' })
    await interaction.editReply({ content: '✅ Pergunta editada!' })
    const painelCh = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.painel_formulario)
    if (painelCh) { const msgs = await painelCh.messages.fetch({ limit: 10 }); const msg = msgs.find(m => m.author.id === interaction.client.user.id && m.embeds[0]?.footer?.text?.includes('PAINEL_FORM')); if (msg) await msg.edit({ embeds: [buildPainelFormularioEmbed()] }) }
    return
  }

  if (id === 'rec_rem_q') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    const perguntas = getDb().prepare('SELECT id, texto FROM perguntas ORDER BY ordem ASC').all()
    if (perguntas.length === 0) return interaction.editReply({ content: '❌ Nenhuma pergunta cadastrada.' })
    return interaction.editReply({ content: 'Selecione a pergunta a remover:', components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('rec_select_candidatos').setPlaceholder('Selecione').addOptions(perguntas.slice(0, 25).map(p => ({ label: p.texto.slice(0, 100), value: String(p.id) }))))] })
  }

  if (id === 'rec_timer_q') { return interaction.reply({ content: '⚠️ Timer disponível via /painel-formulario.', ephemeral: true }) }
  if (id === 'rec_view_q')  { if (interaction.replied || interaction.deferred) return; await interaction.deferReply({ ephemeral: true }); return interaction.editReply({ embeds: [buildPainelFormularioEmbed()] }) }

  if (id === 'rec_refresh_q') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    const painelCh = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.painel_formulario)
    if (painelCh) { const msgs = await painelCh.messages.fetch({ limit: 10 }); const msg = msgs.find(m => m.author.id === interaction.client.user.id && m.embeds[0]?.footer?.text?.includes('PAINEL_FORM')); if (msg) await msg.edit({ embeds: [buildPainelFormularioEmbed()] }) }
    return interaction.editReply({ content: '✅ Painel atualizado!' })
  }

  if (id === 'rec_export_q') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    const perguntas = getDb().prepare('SELECT * FROM perguntas ORDER BY ordem ASC').all()
    return interaction.editReply({ content: '📤 Exportação:', files: [{ attachment: Buffer.from(JSON.stringify(perguntas, null, 2), 'utf8'), name: 'perguntas_formulario.json' }] })
  }

  if (id === 'rec_gerar_rel_v14') {
    if (!isRecrutador(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    return interaction.showModal(new ModalBuilder().setCustomId('modal_confirmar_relatorio').setTitle('Gerar Relatório').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('obs_relatorio').setLabel('Observações (opcional)').setStyle(TextInputStyle.Paragraph).setRequired(false))))
  }

  if (id === 'modal_confirmar_relatorio') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    const obs       = interaction.fields.getTextInputValue('obs_relatorio').trim()
    const db        = getDb()
    const total     = db.prepare('SELECT COUNT(*) as c FROM recrutamentos WHERE recrutador_id = ?').get(interaction.user.id)?.c ?? 0
    const aprovados = db.prepare("SELECT COUNT(*) as c FROM recrutamentos WHERE recrutador_id = ? AND status = 'aprovado'").get(interaction.user.id)?.c ?? 0
    const reprovados = db.prepare("SELECT COUNT(*) as c FROM recrutamentos WHERE recrutador_id = ? AND status = 'reprovado'").get(interaction.user.id)?.c ?? 0
    const embed = new EmbedBuilder().setColor(COLOR_REC).setTitle(`📊 Relatório de ${interaction.user.displayName}`).addFields({ name: 'Total de tickets', value: String(total), inline: true }, { name: 'Aprovações', value: String(aprovados), inline: true }, { name: 'Reprovações', value: String(reprovados), inline: true }, { name: 'Observações', value: obs || 'Nenhuma' }).setFooter({ text: `${FOOTER_TEXT} | ${agora()}` }).setTimestamp()
    const relCh = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.relatorio_rec)
    if (relCh) await relCh.send({ embeds: [embed] })
    const logCh = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.logs_relatorios_rec)
    if (logCh) await logCh.send({ embeds: [embed] })
    return interaction.editReply({ content: '✅ Relatório gerado!', embeds: [embed] })
  }

  if (id === 'rec_blacklist_v14') {
    if (!isStaff(interaction.member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    const lista = getDb().prepare('SELECT * FROM blacklist ORDER BY adicionado_em DESC LIMIT 25').all()
    if (lista.length === 0) return interaction.editReply({ content: '✅ Blacklist vazia.' })
    return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle('🚫 Blacklist de Recrutamento').setDescription(lista.map((e, i) => `**${i + 1}.** <@${e.user_id}> — ${e.motivo}\n> Por <@${e.adicionado_por}> em ${e.adicionado_em}`).join('\n\n')).setFooter(footerEmbed()).setTimestamp()] })
  }

  if (id === 'sel_cand_v14' || id === 'sel_rec_v14' || id === 'rec_select_candidatos') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    const valor = interaction.values[0]
    const r     = getDb().prepare('DELETE FROM perguntas WHERE id = ?').run(parseInt(valor))
    if (r.changes > 0) {
      await interaction.editReply({ content: '✅ Pergunta removida!', components: [] })
      const painelCh = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.painel_formulario)
      if (painelCh) { const msgs = await painelCh.messages.fetch({ limit: 10 }); const msg = msgs.find(m => m.author.id === interaction.client.user.id && m.embeds[0]?.footer?.text?.includes('PAINEL_FORM')); if (msg) await msg.edit({ embeds: [buildPainelFormularioEmbed()] }) }
    } else { await interaction.editReply({ content: '❌ Item não encontrado.', components: [] }) }
    return
  }
}

const customIds = [
  'rec_fechar','rec_assumir','rec_renomear','rec_enviar_form','rec_cancel_timer',
  'rec_aprovar_m','rec_reprovar_m','rec_blacklist','rec_gerar_tkt',
  'rec_add_q','rec_edit_q','rec_rem_q','rec_timer_q','rec_view_q','rec_refresh_q','rec_export_q',
  'rec_gerar_rel_v14','rec_blacklist_v14','sel_cand_v14','sel_rec_v14','rec_select_candidatos',
  'modal_fechar_ticket','modal_renomear','modal_aprovar_membro','modal_blacklist',
  'modal_add_pergunta','modal_editar_pergunta','modal_confirmar_relatorio',
]

module.exports = {
  customIds, execute,
  buildPainelFormularioEmbed, buildTicketRecView,
  buildPainelFormulario, buildPainelRelatorio, buildPainelBlacklist,
  buildTopRecrutadores, buildTopRecrutadoresVazio,
  atualizarRankingRecrutadores, buildRecContent,
}
