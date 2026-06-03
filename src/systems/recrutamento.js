/**
 * recrutamento.js — Etapa 7
 * Sistema de Recrutamento MS-13 Bot (Discord.js v14)
 */

'use strict'

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
  ChannelType,
} = require('discord.js')
const Database = require('better-sqlite3')
const fs       = require('fs')
const path     = require('path')
const moment   = require('moment-timezone')

// ─── Constantes ────────────────────────────────────────────────────────────────

const BR_TZ      = 'America/Sao_Paulo'
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
  isento: ['1469085061373628437','1471295287896178892','1469085227757605002',
           '1469085338046697572','1469085446108741780','1469131886533017671'],
}

const MS13_ROLE_ID = '1469085564920795371'

const ROLE_NAMES = {
  '1469085061373628437': 'Diretoria',
  '1471295287896178892': 'Gerente Geral',
  '1469085227757605002': 'Resp. Recrutamentos',
  '1469085338046697572': 'Resp. Farm',
  '1469085446108741780': 'Resp. Elite',
  '1469131886533017671': 'Elite',
  '1477356816366047445': 'Corredor',
  '1471297185227346183': 'Linha de Frente',
  '1471297000845742292': 'Conselheiro',
  '1471296434505646110': 'Soldado',
  '1471296807349911604': 'Associado',
  '1471295722937647239': 'Morador',
  '1469085564920795371': 'MS-13',
}

const CHANNEL_IDS = {
  logs_recrutamento: '1483674983887667250',
}

const REC_DB          = 'ms13_recrutamento.db'
const REC_CONFIG_FILE = 'rec_config.json'

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

// ─── Banco de Dados ─────────────────────────────────────────────────────────────

let _db = null

function getDb() {
  if (!_db) {
    _db = new Database(REC_DB)
    _db.exec(`
      CREATE TABLE IF NOT EXISTS recrutamentos (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        candidato_id TEXT NOT NULL,
        recrutador_id TEXT,
        ticket_id   TEXT,
        status      TEXT DEFAULT 'aberto',
        criado_em   TEXT DEFAULT (datetime('now','localtime')),
        fechado_em  TEXT
      );
      CREATE TABLE IF NOT EXISTS blacklist (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id   TEXT NOT NULL UNIQUE,
        motivo    TEXT,
        adicionado_por TEXT,
        adicionado_em  TEXT DEFAULT (datetime('now','localtime'))
      );
      CREATE TABLE IF NOT EXISTS perguntas (
        id        INTEGER PRIMARY KEY AUTOINCREMENT,
        texto     TEXT NOT NULL,
        obrigatoria INTEGER DEFAULT 1,
        max_chars INTEGER DEFAULT 500,
        ordem     INTEGER DEFAULT 0
      );
    `)
  }
  return _db
}

// ─── Config JSON ────────────────────────────────────────────────────────────────

function loadConfig() {
  try {
    if (fs.existsSync(REC_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(REC_CONFIG_FILE, 'utf8'))
    }
  } catch {}
  return {}
}

function saveConfig(data) {
  fs.writeFileSync(REC_CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8')
}

// ─── Lock de Ranking ────────────────────────────────────────────────────────────

let _rankingEmAndamento = false

// ─── Helpers ────────────────────────────────────────────────────────────────────

function isStaff(member) {
  return ROLES.isento.some(id => member.roles.cache.has(id))
}

function isRecrutador(member) {
  return member.roles.cache.has(ROLE_IDS.recrutador) || isStaff(member)
}

function agora() {
  return moment().tz(BR_TZ).format('DD/MM/YYYY HH:mm')
}

function footerEmbed() {
  return { text: FOOTER_TEXT }
}

// ─── Views ──────────────────────────────────────────────────────────────────────

function buildTicketRecView() {
  const row0 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rec_fechar').setLabel('🔒 Fechar').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('rec_assumir').setLabel('✋ Assumir').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('rec_renomear').setLabel('✏️ Renomear').setStyle(ButtonStyle.Secondary),
  )
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rec_enviar_form').setLabel('📋 Enviar Formulário').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('rec_cancel_timer').setLabel('⏹ Cancelar Timer').setStyle(ButtonStyle.Secondary),
  )
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rec_aprovar_m').setLabel('✅ Aprovar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('rec_reprovar_m').setLabel('❌ Reprovar').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('rec_blacklist').setLabel('🚫 Blacklist').setStyle(ButtonStyle.Danger),
  )
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rec_gerar_tkt').setLabel('🎫 Gerar Ticket').setStyle(ButtonStyle.Primary),
  )
  return [row0, row1, row2, row3]
}

function buildPainelFormularioView() {
  const row0 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rec_add_q').setLabel('➕ Adicionar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('rec_edit_q').setLabel('✏️ Editar').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('rec_rem_q').setLabel('🗑 Remover').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('rec_timer_q').setLabel('⏱ Timer').setStyle(ButtonStyle.Secondary),
  )
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rec_view_q').setLabel('👁 Ver Perguntas').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rec_refresh_q').setLabel('🔄 Atualizar').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rec_export_q').setLabel('📤 Exportar').setStyle(ButtonStyle.Secondary),
  )
  return [row0, row1]
}

// ─── Embeds ─────────────────────────────────────────────────────────────────────

function buildTicketRecEmbed(candidato, responsavel) {
  return new EmbedBuilder()
    .setColor(COLOR_REC)
    .setTitle('🎫 Ticket de Recrutamento')
    .setDescription(`Candidato: ${candidato}\nResponsável: ${responsavel || 'Não assumido'}`)
    .addFields(
      { name: 'Status', value: '🟡 Em andamento', inline: true },
      { name: 'Aberto em', value: agora(), inline: true },
    )
    .setFooter(footerEmbed())
    .setTimestamp()
}

function buildPainelFormularioEmbed() {
  const db        = getDb()
  const perguntas = db.prepare('SELECT * FROM perguntas ORDER BY ordem ASC').all()

  const embed = new EmbedBuilder()
    .setColor(COLOR_REC)
    .setTitle('📋 Painel de Formulário — Recrutamento')
    .setDescription(
      perguntas.length === 0
        ? '*Nenhuma pergunta cadastrada ainda.*'
        : perguntas
            .map((p, i) =>
              `**${i + 1}.** ${p.texto}\n` +
              `> Obrigatória: ${p.obrigatoria ? 'Sim' : 'Não'} | Máx: ${p.max_chars} chars`,
            )
            .join('\n\n'),
    )
    .setFooter({ text: 'PAINEL_FORM — ' + FOOTER_TEXT })
    .setTimestamp()

  return embed
}

function buildRecContent(userMention, responsavel) {
  return (
    `## 🎫 Ticket de Recrutamento\n` +
    `> **Candidato:** ${userMention}\n` +
    `> **Responsável:** ${responsavel || 'Aguardando'}\n` +
    `> **Aberto em:** ${agora()}`
  )
}

// ─── Ranking ────────────────────────────────────────────────────────────────────

async function atualizarRankingRecrutadores(guild) {
  if (_rankingEmAndamento) return
  _rankingEmAndamento = true
  try {
    const db = getDb()
    const dados = db.prepare(`
      SELECT recrutador_id, COUNT(*) as total
      FROM recrutamentos
      WHERE recrutador_id IS NOT NULL AND status = 'aprovado'
      GROUP BY recrutador_id
      ORDER BY total DESC
      LIMIT 10
    `).all()

    const channel = guild.channels.cache.get(REC_CHANNEL_IDS.recrutadores)
    if (!channel) return

    const embed = new EmbedBuilder()
      .setColor(COLOR_REC)
      .setTitle('🏆 Ranking de Recrutadores')
      .setDescription(
        dados.length === 0
          ? '*Nenhum recrutamento aprovado ainda.*'
          : dados
              .map((d, i) => {
                const member = guild.members.cache.get(d.recrutador_id)
                const nome   = member ? member.displayName : `<@${d.recrutador_id}>`
                return `**${i + 1}.** ${nome} — ${d.total} aprovação(ões)`
              })
              .join('\n'),
      )
      .setFooter({ text: 'REC_RANK — ' + FOOTER_TEXT })
      .setTimestamp()

    // Procura mensagem existente pelo footer
    const messages = await channel.messages.fetch({ limit: 20 })
    const existing = messages.find(
      m => m.author.id === guild.client.user.id &&
           m.embeds[0]?.footer?.text?.startsWith('REC_RANK'),
    )

    if (existing) {
      await existing.edit({ embeds: [embed] })
    } else {
      await channel.send({ embeds: [embed] })
    }
  } catch (err) {
    console.error('[REC] Erro ao atualizar ranking recrutadores:', err)
  } finally {
    _rankingEmAndamento = false
  }
}

async function atualizarRankingTickets(guild) {
  if (_rankingEmAndamento) return
  _rankingEmAndamento = true
  try {
    const db = getDb()
    const dados = db.prepare(`
      SELECT recrutador_id, COUNT(*) as total
      FROM recrutamentos
      WHERE recrutador_id IS NOT NULL
      GROUP BY recrutador_id
      ORDER BY total DESC
      LIMIT 10
    `).all()

    const channel = guild.channels.cache.get(REC_CHANNEL_IDS.top_tickets)
    if (!channel) return

    const embed = new EmbedBuilder()
      .setColor(COLOR_REC)
      .setTitle('🎫 Top Tickets — Recrutamento')
      .setDescription(
        dados.length === 0
          ? '*Nenhum ticket registrado ainda.*'
          : dados
              .map((d, i) => {
                const member = guild.members.cache.get(d.recrutador_id)
                const nome   = member ? member.displayName : `<@${d.recrutador_id}>`
                return `**${i + 1}.** ${nome} — ${d.total} ticket(s)`
              })
              .join('\n'),
      )
      .setFooter({ text: 'TKT_RANK — ' + FOOTER_TEXT })
      .setTimestamp()

    const messages = await channel.messages.fetch({ limit: 20 })
    const existing = messages.find(
      m => m.author.id === guild.client.user.id &&
           m.embeds[0]?.footer?.text?.startsWith('TKT_RANK'),
    )

    if (existing) {
      await existing.edit({ embeds: [embed] })
    } else {
      await channel.send({ embeds: [embed] })
    }
  } catch (err) {
    console.error('[REC] Erro ao atualizar ranking tickets:', err)
  } finally {
    _rankingEmAndamento = false
  }
}

// ─── Entrevista ──────────────────────────────────────────────────────────────────

async function _conduzirEntrevista(channel, candidatoId, recrutadorId) {
  const db        = getDb()
  const perguntas = db.prepare('SELECT * FROM perguntas ORDER BY ordem ASC').all()

  if (perguntas.length === 0) {
    await channel.send('⚠️ Nenhuma pergunta cadastrada no formulário.')
    return null
  }

  const respostas = []

  for (const pergunta of perguntas) {
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_INFO)
          .setDescription(`❓ **${pergunta.texto}**\n\n> Responda abaixo. Você tem **5 minutos**.`)
          .setFooter({ text: `Pergunta ${perguntas.indexOf(pergunta) + 1}/${perguntas.length}` }),
      ],
    })

    try {
      const coletadas = await channel.awaitMessages({
        filter: m => m.author.id === candidatoId,
        max:    1,
        time:   300_000,
        errors: ['time'],
      })

      const resposta = coletadas.first().content.trim()

      if (pergunta.obrigatoria && resposta.length === 0) {
        await channel.send('❌ Essa pergunta é obrigatória. Entrevista encerrada.')
        return null
      }

      if (resposta.length > pergunta.max_chars) {
        await channel.send(
          `❌ Resposta muito longa (máx. ${pergunta.max_chars} caracteres). Entrevista encerrada.`,
        )
        return null
      }

      respostas.push({ pergunta: pergunta.texto, resposta })
    } catch {
      await channel.send('⏰ Tempo esgotado. Entrevista encerrada.')
      return null
    }
  }

  return respostas
}

// ─── Aprovação de Membro ─────────────────────────────────────────────────────────

async function _aprovarMembro(interaction, nomeIC, idMTA) {
  const guild  = interaction.guild
  const ticket = interaction.channel

  // Extrai ID do candidato do tópico do canal (esperado no nome ou tópico)
  const candidatoId = ticket.topic?.match(/\d{17,19}/)?.[0]
  if (!candidatoId) {
    return interaction.reply({ content: '❌ Não foi possível identificar o candidato.', ephemeral: true })
  }

  const member = await guild.members.fetch(candidatoId).catch(() => null)
  if (!member) {
    return interaction.reply({ content: '❌ Candidato não encontrado no servidor.', ephemeral: true })
  }

  // Nick: Ⓜ・ {nomeIC} {idMTA}
  const novoNick = `Ⓜ・ ${nomeIC} ${idMTA}`
  try {
    await member.setNickname(novoNick)
  } catch {
    await interaction.followUp({ content: '⚠️ Não foi possível alterar o nick (sem permissão).', ephemeral: true })
  }

  // Cargos: etapa2 + Morador + MS-13
  await member.roles.add([ROLE_IDS.etapa2, ROLE_IDS.membro, MS13_ROLE_ID]).catch(() => null)

  // Atualizar DB
  const db = getDb()
  db.prepare(`
    UPDATE recrutamentos SET status = 'aprovado', fechado_em = datetime('now','localtime')
    WHERE candidato_id = ? AND status = 'aberto'
  `).run(candidatoId)

  // Log
  const logChannel = guild.channels.cache.get(CHANNEL_IDS.logs_recrutamento)
  if (logChannel) {
    await logChannel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setTitle('✅ Membro Aprovado')
          .addFields(
            { name: 'Candidato', value: `<@${candidatoId}>`, inline: true },
            { name: 'Aprovado por', value: `<@${interaction.user.id}>`, inline: true },
            { name: 'Nick', value: novoNick, inline: true },
            { name: 'Data', value: agora(), inline: true },
          )
          .setFooter(footerEmbed()),
      ],
    })
  }

  await interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR_SUCCESS)
        .setTitle('✅ Membro aprovado com sucesso!')
        .setDescription(`${member} foi aprovado como **Morador** da MS-13.`)
        .setFooter(footerEmbed()),
    ],
  })

  await atualizarRankingRecrutadores(guild)
}

// ─── Execute ─────────────────────────────────────────────────────────────────────

async function execute(interaction) {
  const id = interaction.customId

  // ── Botões do Ticket ─────────────────────────────────────────────────────────

  if (id === 'rec_fechar') {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    }

    const modal = new ModalBuilder()
      .setCustomId('modal_fechar_ticket')
      .setTitle('Fechar Ticket')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('motivo_fechar')
            .setLabel('Motivo do fechamento')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true),
        ),
      )
    return interaction.showModal(modal)
  }

  if (id === 'modal_fechar_ticket') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply()

    const motivo = interaction.fields.getTextInputValue('motivo_fechar')
    const db     = getDb()

    const candidatoId = interaction.channel.topic?.match(/\d{17,19}/)?.[0]
    if (candidatoId) {
      db.prepare(`
        UPDATE recrutamentos SET status = 'fechado', fechado_em = datetime('now','localtime')
        WHERE candidato_id = ? AND status = 'aberto'
      `).run(candidatoId)
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_ERROR)
          .setTitle('🔒 Ticket Fechado')
          .addFields(
            { name: 'Fechado por', value: `<@${interaction.user.id}>` },
            { name: 'Motivo', value: motivo },
          )
          .setFooter(footerEmbed()),
      ],
    })

    setTimeout(() => interaction.channel.delete().catch(() => null), 5_000)
    return
  }

  if (id === 'rec_assumir') {
    if (!isRecrutador(interaction.member)) {
      return interaction.reply({ content: '❌ Apenas recrutadores podem assumir tickets.', ephemeral: true })
    }
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply()

    const db = getDb()
    const candidatoId = interaction.channel.topic?.match(/\d{17,19}/)?.[0]
    if (candidatoId) {
      db.prepare(`
        UPDATE recrutamentos SET recrutador_id = ? WHERE candidato_id = ? AND status = 'aberto'
      `).run(interaction.user.id, candidatoId)
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_SUCCESS)
          .setDescription(`✅ <@${interaction.user.id}> assumiu este ticket.`)
          .setFooter(footerEmbed()),
      ],
    })
    return
  }

  if (id === 'rec_renomear') {
    if (!isRecrutador(interaction.member)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    }

    const modal = new ModalBuilder()
      .setCustomId('modal_renomear')
      .setTitle('Renomear Ticket')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('novo_nome')
            .setLabel('Novo nome do canal')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(90),
        ),
      )
    return interaction.showModal(modal)
  }

  if (id === 'modal_renomear') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    const novoNome = interaction.fields.getTextInputValue('novo_nome').toLowerCase().replace(/\s+/g, '-')
    await interaction.channel.setName(novoNome).catch(() => null)
    return interaction.editReply({ content: `✅ Canal renomeado para **${novoNome}**.` })
  }

  if (id === 'rec_enviar_form') {
    if (!isRecrutador(interaction.member)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    }
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })

    const candidatoId = interaction.channel.topic?.match(/\d{17,19}/)?.[0]
    if (!candidatoId) {
      return interaction.editReply({ content: '❌ Candidato não identificado.' })
    }

    await interaction.editReply({ content: '✅ Iniciando entrevista com o candidato...' })
    const respostas = await _conduzirEntrevista(interaction.channel, candidatoId, interaction.user.id)

    if (!respostas) return

    const embed = new EmbedBuilder()
      .setColor(COLOR_REC)
      .setTitle('📋 Respostas do Formulário')
      .setDescription(
        respostas.map((r, i) => `**${i + 1}. ${r.pergunta}**\n> ${r.resposta}`).join('\n\n'),
      )
      .setFooter({ text: `Candidato: ${candidatoId} | ${FOOTER_TEXT}` })
      .setTimestamp()

    await interaction.channel.send({ embeds: [embed] })
    return
  }

  if (id === 'rec_cancel_timer') {
    // Placeholder — cancelamento de timer de entrevista ativo
    return interaction.reply({ content: '⏹ Timer cancelado.', ephemeral: true })
  }

  if (id === 'rec_aprovar_m') {
    if (!isRecrutador(interaction.member)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    }

    const modal = new ModalBuilder()
      .setCustomId('modal_aprovar_membro')
      .setTitle('Aprovar Membro')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('nome_ic')
            .setLabel('Nome IC do personagem')
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('id_mta')
            .setLabel('ID MTA do personagem')
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      )
    return interaction.showModal(modal)
  }

  if (id === 'modal_aprovar_membro') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply()
    const nomeIC = interaction.fields.getTextInputValue('nome_ic').trim()
    const idMTA  = interaction.fields.getTextInputValue('id_mta').trim()
    return _aprovarMembro(interaction, nomeIC, idMTA)
  }

  if (id === 'rec_reprovar_m') {
    if (!isRecrutador(interaction.member)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    }
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply()

    const candidatoId = interaction.channel.topic?.match(/\d{17,19}/)?.[0]
    if (candidatoId) {
      const db = getDb()
      db.prepare(`
        UPDATE recrutamentos SET status = 'reprovado', fechado_em = datetime('now','localtime')
        WHERE candidato_id = ? AND status = 'aberto'
      `).run(candidatoId)
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_ERROR)
          .setTitle('❌ Candidato Reprovado')
          .setDescription(`<@${candidatoId}> foi reprovado no processo seletivo.`)
          .addFields({ name: 'Reprovado por', value: `<@${interaction.user.id}>`, inline: true })
          .setFooter(footerEmbed()),
      ],
    })
    setTimeout(() => interaction.channel.delete().catch(() => null), 8_000)
    return
  }

  if (id === 'rec_blacklist') {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    }

    const modal = new ModalBuilder()
      .setCustomId('modal_blacklist')
      .setTitle('Adicionar à Blacklist')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('motivo_bl')
            .setLabel('Motivo')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true),
        ),
      )
    return interaction.showModal(modal)
  }

  if (id === 'modal_blacklist') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply()

    const motivo      = interaction.fields.getTextInputValue('motivo_bl')
    const candidatoId = interaction.channel.topic?.match(/\d{17,19}/)?.[0]
    if (!candidatoId) {
      return interaction.editReply({ content: '❌ Candidato não identificado.' })
    }

    const db = getDb()
    db.prepare(`
      INSERT OR REPLACE INTO blacklist (user_id, motivo, adicionado_por)
      VALUES (?, ?, ?)
    `).run(candidatoId, motivo, interaction.user.id)

    // Log no canal de blacklist
    const blChannel = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.blacklist)
    if (blChannel) {
      await blChannel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_ERROR)
            .setTitle('🚫 Usuário adicionado à Blacklist')
            .addFields(
              { name: 'Usuário', value: `<@${candidatoId}>`, inline: true },
              { name: 'Adicionado por', value: `<@${interaction.user.id}>`, inline: true },
              { name: 'Motivo', value: motivo },
              { name: 'Data', value: agora(), inline: true },
            )
            .setFooter(footerEmbed()),
        ],
      })
    }

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_ERROR)
          .setTitle('🚫 Blacklist atualizada')
          .setDescription(`<@${candidatoId}> foi adicionado à blacklist.\n**Motivo:** ${motivo}`)
          .setFooter(footerEmbed()),
      ],
    })
    setTimeout(() => interaction.channel.delete().catch(() => null), 8_000)
    return
  }

  if (id === 'rec_gerar_tkt') {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    }
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })

    const guild    = interaction.guild
    const categoria = REC_CHANNEL_IDS.categoria_rec !== '0'
      ? guild.channels.cache.get(REC_CHANNEL_IDS.categoria_rec)
      : null

    const nomeCanal = `rec-${interaction.user.username}-${Date.now().toString().slice(-4)}`

    const novoCanal = await guild.channels.create({
      name:   nomeCanal,
      type:   ChannelType.GuildText,
      parent: categoria || undefined,
      topic:  `Candidato: ${interaction.user.id}`,
      permissionOverwrites: [
        { id: guild.id,          deny:  [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: _PERM_TICKET_ROLE_ID, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ],
    })

    const db = getDb()
    db.prepare(`
      INSERT INTO recrutamentos (candidato_id, ticket_id, status)
      VALUES (?, ?, 'aberto')
    `).run(interaction.user.id, novoCanal.id)

    const content = buildRecContent(`<@${interaction.user.id}>`, `<@${interaction.user.id}>`)
    await novoCanal.send({
      content,
      embeds:     [buildTicketRecEmbed(`<@${interaction.user.id}>`, `<@${interaction.user.id}>`)],
      components: buildTicketRecView(),
    })

    return interaction.editReply({ content: `✅ Ticket criado: ${novoCanal}` })
  }

  // ── Painel Formulário ────────────────────────────────────────────────────────

  if (id === 'rec_add_q') {
    const modal = new ModalBuilder()
      .setCustomId('modal_add_pergunta')
      .setTitle('Adicionar Pergunta')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('texto_pergunta')
            .setLabel('Texto da pergunta')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('max_chars')
            .setLabel('Máx. caracteres (padrão 500)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('obrigatoria')
            .setLabel('Obrigatória? (sim/não)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false),
        ),
      )
    return interaction.showModal(modal)
  }

  if (id === 'modal_add_pergunta') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })

    const texto      = interaction.fields.getTextInputValue('texto_pergunta').trim()
    const maxCharsRaw = interaction.fields.getTextInputValue('max_chars').trim()
    const obRaw      = interaction.fields.getTextInputValue('obrigatoria').trim().toLowerCase()

    const maxChars    = parseInt(maxCharsRaw) || 500
    const obrigatoria = obRaw === 'não' || obRaw === 'nao' || obRaw === 'n' ? 0 : 1

    const db   = getDb()
    const ordem = (db.prepare('SELECT MAX(ordem) as m FROM perguntas').get()?.m ?? 0) + 1
    db.prepare('INSERT INTO perguntas (texto, obrigatoria, max_chars, ordem) VALUES (?, ?, ?, ?)').run(
      texto, obrigatoria, maxChars, ordem,
    )

    await interaction.editReply({ content: '✅ Pergunta adicionada!' })

    // Atualiza painel
    const painelCh = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.painel_formulario)
    if (painelCh) {
      const msgs = await painelCh.messages.fetch({ limit: 10 })
      const msg  = msgs.find(m => m.author.id === interaction.client.user.id && m.embeds[0]?.footer?.text?.includes('PAINEL_FORM'))
      if (msg) await msg.edit({ embeds: [buildPainelFormularioEmbed()] })
    }
    return
  }

  if (id === 'rec_edit_q') {
    const modal = new ModalBuilder()
      .setCustomId('modal_editar_pergunta')
      .setTitle('Editar Pergunta')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('id_pergunta')
            .setLabel('ID da pergunta')
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('novo_texto')
            .setLabel('Novo texto')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true),
        ),
      )
    return interaction.showModal(modal)
  }

  if (id === 'modal_editar_pergunta') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })

    const idP      = parseInt(interaction.fields.getTextInputValue('id_pergunta'))
    const novoTexto = interaction.fields.getTextInputValue('novo_texto').trim()

    const db = getDb()
    const r  = db.prepare('UPDATE perguntas SET texto = ? WHERE id = ?').run(novoTexto, idP)
    if (r.changes === 0) return interaction.editReply({ content: '❌ Pergunta não encontrada.' })

    await interaction.editReply({ content: '✅ Pergunta editada!' })

    const painelCh = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.painel_formulario)
    if (painelCh) {
      const msgs = await painelCh.messages.fetch({ limit: 10 })
      const msg  = msgs.find(m => m.author.id === interaction.client.user.id && m.embeds[0]?.footer?.text?.includes('PAINEL_FORM'))
      if (msg) await msg.edit({ embeds: [buildPainelFormularioEmbed()] })
    }
    return
  }

  if (id === 'rec_rem_q') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })

    const db        = getDb()
    const perguntas = db.prepare('SELECT id, texto FROM perguntas ORDER BY ordem ASC').all()
    if (perguntas.length === 0) return interaction.editReply({ content: '❌ Nenhuma pergunta cadastrada.' })

    const select = new StringSelectMenuBuilder()
      .setCustomId('rec_select_candidatos') // reutilizando o select compartilhado
      .setPlaceholder('Selecione a pergunta para remover')
      .addOptions(
        perguntas.slice(0, 25).map(p => ({
          label: p.texto.slice(0, 100),
          value: String(p.id),
        })),
      )

    return interaction.editReply({
      content:    'Selecione a pergunta a remover:',
      components: [new ActionRowBuilder().addComponents(select)],
    })
  }

  if (id === 'rec_timer_q') {
    return interaction.reply({ content: '⚠️ Funcionalidade de timer por pergunta disponível via /painel-formulario.', ephemeral: true })
  }

  if (id === 'rec_view_q') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    return interaction.editReply({ embeds: [buildPainelFormularioEmbed()] })
  }

  if (id === 'rec_refresh_q') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })

    const painelCh = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.painel_formulario)
    if (painelCh) {
      const msgs = await painelCh.messages.fetch({ limit: 10 })
      const msg  = msgs.find(m => m.author.id === interaction.client.user.id && m.embeds[0]?.footer?.text?.includes('PAINEL_FORM'))
      if (msg) await msg.edit({ embeds: [buildPainelFormularioEmbed()] })
    }
    return interaction.editReply({ content: '✅ Painel atualizado!' })
  }

  if (id === 'rec_export_q') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })

    const db        = getDb()
    const perguntas = db.prepare('SELECT * FROM perguntas ORDER BY ordem ASC').all()
    const json      = JSON.stringify(perguntas, null, 2)
    const buf       = Buffer.from(json, 'utf8')

    return interaction.editReply({
      content: '📤 Exportação das perguntas:',
      files:   [{ attachment: buf, name: 'perguntas_formulario.json' }],
    })
  }

  // ── Relatório ────────────────────────────────────────────────────────────────

  if (id === 'rec_gerar_rel_v14') {
    if (!isRecrutador(interaction.member)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    }

    const modal = new ModalBuilder()
      .setCustomId('modal_confirmar_relatorio')
      .setTitle('Gerar Relatório')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('obs_relatorio')
            .setLabel('Observações (opcional)')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false),
        ),
      )
    return interaction.showModal(modal)
  }

  if (id === 'modal_confirmar_relatorio') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })

    const obs = interaction.fields.getTextInputValue('obs_relatorio').trim()
    const db  = getDb()

    const total     = db.prepare('SELECT COUNT(*) as c FROM recrutamentos WHERE recrutador_id = ?').get(interaction.user.id)?.c ?? 0
    const aprovados = db.prepare("SELECT COUNT(*) as c FROM recrutamentos WHERE recrutador_id = ? AND status = 'aprovado'").get(interaction.user.id)?.c ?? 0
    const reprovados = db.prepare("SELECT COUNT(*) as c FROM recrutamentos WHERE recrutador_id = ? AND status = 'reprovado'").get(interaction.user.id)?.c ?? 0

    const embed = new EmbedBuilder()
      .setColor(COLOR_REC)
      .setTitle(`📊 Relatório de ${interaction.user.displayName}`)
      .addFields(
        { name: 'Total de tickets',  value: String(total),      inline: true },
        { name: 'Aprovações',         value: String(aprovados),  inline: true },
        { name: 'Reprovações',        value: String(reprovados), inline: true },
        { name: 'Observações',        value: obs || 'Nenhuma' },
      )
      .setFooter({ text: `${FOOTER_TEXT} | ${agora()}` })
      .setTimestamp()

    const relCh = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.relatorio_rec)
    if (relCh) await relCh.send({ embeds: [embed] })

    const logCh = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.logs_relatorios_rec)
    if (logCh) await logCh.send({ embeds: [embed] })

    return interaction.editReply({ content: '✅ Relatório gerado e enviado!', embeds: [embed] })
  }

  // ── Blacklist V14 ────────────────────────────────────────────────────────────

  if (id === 'rec_blacklist_v14') {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    }
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })

    const db = getDb()
    const lista = db.prepare('SELECT * FROM blacklist ORDER BY adicionado_em DESC LIMIT 25').all()

    if (lista.length === 0) {
      return interaction.editReply({ content: '✅ Blacklist vazia.' })
    }

    const embed = new EmbedBuilder()
      .setColor(COLOR_ERROR)
      .setTitle('🚫 Blacklist de Recrutamento')
      .setDescription(
        lista.map((e, i) => `**${i + 1}.** <@${e.user_id}> — ${e.motivo}\n> Por <@${e.adicionado_por}> em ${e.adicionado_em}`).join('\n\n'),
      )
      .setFooter(footerEmbed())
      .setTimestamp()

    return interaction.editReply({ embeds: [embed] })
  }

  // ── Selects Compartilhados ───────────────────────────────────────────────────

  if (id === 'sel_cand_v14' || id === 'sel_rec_v14' || id === 'rec_select_candidatos') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })

    const valor = interaction.values[0]

    // Remover pergunta (vem do rec_rem_q)
    const db = getDb()
    const r  = db.prepare('DELETE FROM perguntas WHERE id = ?').run(parseInt(valor))
    if (r.changes > 0) {
      await interaction.editReply({ content: '✅ Pergunta removida!', components: [] })

      const painelCh = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.painel_formulario)
      if (painelCh) {
        const msgs = await painelCh.messages.fetch({ limit: 10 })
        const msg  = msgs.find(m => m.author.id === interaction.client.user.id && m.embeds[0]?.footer?.text?.includes('PAINEL_FORM'))
        if (msg) await msg.edit({ embeds: [buildPainelFormularioEmbed()] })
      }
    } else {
      await interaction.editReply({ content: '❌ Item não encontrado.', components: [] })
    }
    return
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────────

const customIds = [
  'rec_fechar','rec_assumir','rec_renomear','rec_enviar_form','rec_cancel_timer',
  'rec_aprovar_m','rec_reprovar_m','rec_blacklist','rec_gerar_tkt',
  'rec_add_q','rec_edit_q','rec_rem_q','rec_timer_q','rec_view_q','rec_refresh_q','rec_export_q',
  'rec_gerar_rel_v14','rec_blacklist_v14','sel_cand_v14','sel_rec_v14','rec_select_candidatos',
  'modal_fechar_ticket','modal_renomear','modal_aprovar_membro','modal_blacklist',
  'modal_add_pergunta','modal_editar_pergunta','modal_confirmar_relatorio',
]

module.exports = {
  customIds,
  execute,
  buildPainelFormularioEmbed,
  buildTicketRecView,
  atualizarRankingRecrutadores,
  atualizarRankingTickets,
  buildRecContent,
}