// src/systems/tickets.js — Etapa 5
'use strict'

const {
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder,
  PermissionFlagsBits, MessageFlags, ContainerBuilder, TextDisplayBuilder,
  SeparatorBuilder, SeparatorSpacingSize, AttachmentBuilder,
} = require('discord.js')

const { COLOR_MS13, COLOR_SUCCESS, COLOR_ERROR, COLOR_WARNING, COLOR_INFO, FOOTER_TEXT, ROLES, CHANNEL_IDS } = require('../config/settings.js')

const customIds = [
  'tkt_select_v14', 'close_v14',
  'sup_aceitar_v14', 'sup_fechar_v14',
  'eli_aceitar_v14', 'eli_fechar_v14',
  'par_aceitar_v14', 'par_fechar_v14',
  'sup_modal_v14',
]

const ticketContextMap = new Map()

function buildEmbedCentralTickets() {
  const container = new ContainerBuilder()
  const header = new TextDisplayBuilder().setContent(
    '# 🎫 Central de Tickets — MS-13\n' +
    '> Selecione o tipo de atendimento desejado abaixo.\n' +
    '> Nossa equipe irá te atender o mais breve possível.'
  )
  const sep  = new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)
  const info = new TextDisplayBuilder().setContent(
    '**📋 Tipos de atendimento disponíveis:**\n' +
    '・ **Suporte** — Dúvidas, problemas ou denúncias internas\n' +
    '・ **Elite** — Solicitações relacionadas ao setor Elite\n' +
    '・ **Parceria** — Proposta de parceria com a facção\n\n' +
    '*Ao abrir um ticket, seja objetivo e aguarde o atendimento.*'
  )
  const sep2 = new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
  const row  = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('tkt_select_v14')
      .setPlaceholder('📂 Escolha o tipo de ticket...')
      .addOptions([
        { label: 'Suporte',   description: 'Dúvidas, problemas ou denúncias internas', value: 'suporte',  emoji: '🛠️' },
        { label: 'Elite',     description: 'Solicitações do setor Elite',               value: 'elite',    emoji: '⚔️' },
        { label: 'Parceria',  description: 'Proposta de parceria com a MS-13',          value: 'parceria', emoji: '🤝' },
      ])
  )
  container.addTextDisplayComponents(header)
  container.addSeparatorComponents(sep)
  container.addTextDisplayComponents(info)
  container.addSeparatorComponents(sep2)
  container.addActionRowComponents(row)
  return container
}

// Alias para /iniciar
async function buildCentralTicketsView(guild) {
  return { components: [buildEmbedCentralTickets()] }
}

function buildPainelTicket(tipo, user) {
  const configs = {
    suporte:  { titulo: '🛠️ Ticket de Suporte', cor: COLOR_INFO,    desc: `**Usuário:** ${user}\n**Tipo:** Suporte\n\nDescreva seu problema.`,       aceitarId: 'sup_aceitar_v14', fecharId: 'sup_fechar_v14' },
    elite:    { titulo: '⚔️ Ticket Elite',       cor: COLOR_WARNING, desc: `**Usuário:** ${user}\n**Tipo:** Elite\n\nAguarde um responsável.`,         aceitarId: 'eli_aceitar_v14', fecharId: 'eli_fechar_v14' },
    parceria: { titulo: '🤝 Ticket de Parceria', cor: COLOR_MS13,    desc: `**Usuário:** ${user}\n**Tipo:** Parceria\n\nAguarde a liderança.`,         aceitarId: 'par_aceitar_v14', fecharId: 'par_fechar_v14' },
  }
  const cfg   = configs[tipo]
  const embed = new EmbedBuilder().setTitle(cfg.titulo).setDescription(cfg.desc).setColor(cfg.cor).setFooter({ text: FOOTER_TEXT }).setTimestamp()
  const row   = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(cfg.aceitarId).setLabel('✅ Aceitar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(cfg.fecharId).setLabel('🔒 Fechar Ticket').setStyle(ButtonStyle.Danger),
  )
  return { embed, row }
}

async function gerarTranscript(channel) {
  try {
    const messages = await channel.messages.fetch({ limit: 100 })
    const sorted   = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    return sorted.map(m => `[${new Date(m.createdTimestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}] ${m.author.tag}: ${m.content || '[sem texto]'}`).join('\n')
  } catch { return '[falha ao gerar transcript]' }
}

async function postarTranscript(guild, channel, tipo, opener) {
  try {
    const logsChannel = guild.channels.cache.get(CHANNEL_IDS.logs_geral)
    if (!logsChannel) return
    const conteudo = await gerarTranscript(channel)
    const arquivo  = new AttachmentBuilder(Buffer.from(conteudo, 'utf8'), { name: `transcript-${channel.name}.txt` })
    const embed    = new EmbedBuilder().setTitle('📋 Transcript de Ticket Fechado').setDescription(`**Canal:** #${channel.name}\n**Tipo:** ${tipo}\n**Aberto por:** ${opener}`).setColor(COLOR_ERROR).setFooter({ text: FOOTER_TEXT }).setTimestamp()
    await logsChannel.send({ embeds: [embed], files: [arquivo] })
  } catch (err) { console.error('[tickets] Erro ao postar transcript:', err) }
}

async function criarCanalTicket(guild, user, tipo) {
  const centralChannel = guild.channels.cache.get(CHANNEL_IDS.central_tickets)
  const parentId       = centralChannel?.parentId ?? null
  const permOverwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
    ...[...ROLES.isento].map(roleId => ({ id: roleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.AttachFiles] })),
  ]
  const tipoNome = { suporte: 'sup', elite: 'eli', parceria: 'par' }[tipo]
  const nomeCanal = `${tipoNome}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`
  return guild.channels.create({
    name: nomeCanal, type: 0, parent: parentId, permissionOverwrites: permOverwrites,
    topic: `Ticket ${tipo} — ${user.tag} | ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
  })
}

async function execute(interaction) {
  const id = interaction.customId

  if (id === 'tkt_select_v14') {
    const tipo = interaction.values[0]
    const { guild, user } = interaction
    await interaction.deferReply({ ephemeral: true })
    try {
      const existente = guild.channels.cache.find(c => c.topic?.includes(user.tag) && ['sup-','eli-','par-'].some(p => c.name.startsWith(p)))
      if (existente) return interaction.editReply({ content: `❌ Você já tem um ticket aberto: ${existente}. Feche-o antes.` })
      const canal = await criarCanalTicket(guild, user, tipo)
      ticketContextMap.set(canal.id, { tipo, openerTag: user.tag, openerId: user.id })
      const { embed, row } = buildPainelTicket(tipo, user.toString())
      await canal.send({ content: `${user} — Seu ticket foi criado!`, embeds: [embed], components: [row] })
      if (tipo === 'suporte') await canal.send({ embeds: [new EmbedBuilder().setDescription('📝 **Aguardando detalhes do suporte.**\nUm atendente irá solicitar as informações ao aceitar o ticket.').setColor(COLOR_INFO)] })
      await interaction.editReply({ content: `✅ Ticket criado: ${canal}` })
    } catch (err) {
      console.error('[tickets] Erro ao criar ticket:', err)
      await interaction.editReply({ content: '❌ Erro ao criar o ticket. Tente novamente.' })
    }
    return
  }

  if (['sup_aceitar_v14','eli_aceitar_v14','par_aceitar_v14'].includes(id)) {
    const membro  = interaction.member
    const isStaff = ROLES.isento.some(r => membro.roles.cache.has(r))
    if (!isStaff) return interaction.reply({ content: '❌ Apenas a equipe pode aceitar tickets.', ephemeral: true })
    const canal = interaction.channel
    const ctx   = ticketContextMap.get(canal.id)
    const tipo  = ctx?.tipo ?? 'desconhecido'
    if (id === 'sup_aceitar_v14') {
      return interaction.showModal(
        new ModalBuilder().setCustomId('sup_modal_v14').setTitle('📋 Detalhes do Suporte').addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sup_assunto').setLabel('Assunto').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sup_descricao').setLabel('Descrição detalhada').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000)),
        )
      )
    }
    await interaction.deferReply()
    try {
      const tipoPrefix = { suporte: 'sup', elite: 'eli', parceria: 'par' }[tipo] ?? 'sup'
      const novaRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`${tipoPrefix}_aceitar_v14`).setLabel('✅ Assumido').setStyle(ButtonStyle.Success).setDisabled(true),
        new ButtonBuilder().setCustomId(`${tipoPrefix}_fechar_v14`).setLabel('🔒 Fechar Ticket').setStyle(ButtonStyle.Danger),
      )
      await interaction.message.edit({ components: [novaRow] })
      await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('✅ Ticket Assumido').setDescription(`**Atendente:** ${interaction.user}\n**Tipo:** ${tipo}\n\nO ticket foi assumido.`).setColor(COLOR_SUCCESS).setFooter({ text: FOOTER_TEXT }).setTimestamp()] })
    } catch (err) { console.error('[tickets] Erro ao aceitar:', err); await interaction.editReply({ content: '❌ Erro ao assumir ticket.' }) }
    return
  }

  if (id === 'sup_modal_v14') {
    const assunto   = interaction.fields.getTextInputValue('sup_assunto')
    const descricao = interaction.fields.getTextInputValue('sup_descricao')
    return interaction.reply({ embeds: [new EmbedBuilder().setTitle('📋 Detalhes do Suporte Registrados').addFields({ name: 'Assunto', value: assunto }, { name: 'Descrição', value: descricao }, { name: 'Atendente', value: interaction.user.toString() }).setColor(COLOR_INFO).setFooter({ text: FOOTER_TEXT }).setTimestamp()] })
  }

  if (['sup_fechar_v14','eli_fechar_v14','par_fechar_v14','close_v14'].includes(id)) {
    const membro  = interaction.member
    const isStaff = ROLES.isento.some(r => membro.roles.cache.has(r))
    const canal   = interaction.channel
    const ctx     = ticketContextMap.get(canal.id)
    const isOwner = ctx?.openerId === interaction.user.id
    if (!isStaff && !isOwner) return interaction.reply({ content: '❌ Apenas staff ou o dono pode fechar.', ephemeral: true })
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply()
    try {
      const tipo      = ctx?.tipo ?? 'desconhecido'
      const openerTag = ctx?.openerTag ?? 'Desconhecido'
      await postarTranscript(interaction.guild, canal, tipo, openerTag)
      await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🔒 Ticket Encerrado').setDescription(`**Fechado por:** ${interaction.user}\n**Tipo:** ${tipo}\n\nTranscript salvo nos logs. Canal deletado em **5 segundos**.`).setColor(COLOR_ERROR).setFooter({ text: FOOTER_TEXT }).setTimestamp()] })
      ticketContextMap.delete(canal.id)
      setTimeout(async () => { try { await canal.delete('Ticket fechado') } catch {} }, 5000)
    } catch (err) { console.error('[tickets] Erro ao fechar:', err); if (!interaction.replied) await interaction.editReply({ content: '❌ Erro ao fechar ticket.' }) }
    return
  }
}

module.exports = { customIds, execute, buildEmbedCentralTickets, buildCentralTicketsView }
