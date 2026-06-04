// src/systems/tickets.js
'use strict'

const {
  ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  PermissionFlagsBits,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
  MediaGalleryBuilder, MediaGalleryItemBuilder,
  MessageFlags,
} = require('discord.js')

const {
  ROLES, CHANNEL_IDS, _PERM_TICKET_ROLE_ID,
} = require('../config/settings.js')

const { gerarEEnviarTranscript } = require('./transcript.js')

// ══════════════════════════════════════════════════════════════════════════════
//  CONSTANTES
// ══════════════════════════════════════════════════════════════════════════════

const PERM_TICKET_ROLE_ID = _PERM_TICKET_ROLE_ID

const customIds = [
  'tkt_select_v14', 'close_v14',
  'rec_aceitar_v14', 'rec_fechar_v14',
  'sup_aceitar_v14', 'sup_fechar_v14',
  'eli_aceitar_v14', 'eli_fechar_v14',
  'par_aceitar_v14', 'par_fechar_v14',
  'sup_modal_v14', 'eli_modal_v14', 'par_modal_v14',
]

// ticketContextMap: canal.id → { tipo, openerTag, openerId, userMention, extraData }
const ticketContextMap = new Map()

// ══════════════════════════════════════════════════════════════════════════════
//  TIMER DE INATIVIDADE (idêntico ao _timer_inatividade do PY)
//  Fecha o ticket automaticamente após X segundos sem atividade
// ══════════════════════════════════════════════════════════════════════════════

async function _timerInatividade(canal, segundos) {
  await new Promise(res => setTimeout(res, segundos * 1000))

  // Canal pode ter sido excluído — verifica antes de prosseguir
  try { await canal.fetch() } catch { return }

  // Se já foi fechado manualmente, ticketContextMap não tem mais a entrada
  if (!ticketContextMap.has(canal.id)) return

  const { EmbedBuilder } = require('discord.js')
  try {
    await canal.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('⏱️ Ticket Fechado por Inatividade')
          .setDescription(
            'Este ticket foi fechado automaticamente por inatividade (1h30).\n' +
            'Se precisar de ajuda, abra um novo ticket.'
          )
          .setColor(0xed4245),
      ],
    })
  } catch { return }

  await new Promise(res => setTimeout(res, 5000))

  ticketContextMap.delete(canal.id)

  const botUser = canal.guild.members.me?.user ?? canal.client.user
  await gerarEEnviarTranscript(canal, botUser).catch(() => {})
  try { await canal.delete('Ticket fechado por inatividade') } catch {}
}

// ══════════════════════════════════════════════════════════════════════════════
//  BUILDERS DE CONTENT (markdown nativo — idêntico ao PY)
// ══════════════════════════════════════════════════════════════════════════════

function buildRecContent(userMention, responsavel = 'Aguardando...') {
  return (
    `# 🎖️ MS-13 — Recrutamento\n` +
    `Bem-vindo ao processo seletivo, ${userMention}. Leia com atenção antes de prosseguir.\n\n` +
    `> **Categoria:** Recrutamento\n` +
    `> **Responsável:** ${responsavel}\n\n` +
    `## 📌 Etapas\n\n` +
    `> **1 — Regras**\n` +
    `> Leia as regras do servidor antes de responder. Desconhecimento não é justificativa.\n\n` +
    `> **2 — Identificação**\n` +
    `> Informe sua **idade real** e **nome no jogo**. Dados falsos resultam em reprovação imediata.\n\n` +
    `> **3 — Prints obrigatórios**\n` +
    `> → Print do **ESC** — total de horas jogadas\n` +
    `> → Print da **GARAGEM** — veículos que você possui\n\n` +
    `> **4 — Formulário**\n` +
    `> Aguarde o recrutador assumir o ticket e clique em **Enviar Formulário** quando solicitado.\n\n` +
    `> **5 — Resultado**\n` +
    `> Você receberá **Aprovado** ou **Reprovado**. Decisões são finais.\n\n` +
    `## ⚠️ Avisos\n\n` +
    `> Respostas falsas resultam em **reprovação automática**.\n` +
    `> Comportamento inadequado pode gerar **blacklist permanente**.\n` +
    `> Ticket fecha após **1h30** sem atividade.`
  )
}

function buildSuporteContent(userMention, motivo = '—', responsavel = 'Aguardando...') {
  return (
    `# Olá, ${userMention}! <@&${PERM_TICKET_ROLE_ID}>\n` +
    `Seu suporte foi aberto com sucesso e nossa equipe irá atendê-lo em breve.\n` +
    `> **Categoria:** Suporte Geral e Atendimento\n` +
    `> **Responsável:** ${responsavel}\n\n` +
    `**Motivo:** ${motivo}\n\n` +
    `Descreva sua situação abaixo para que possamos ajudar da melhor forma.`
  )
}

function buildEliteContent(userMention, assunto = '—', responsavel = 'Aguardando...') {
  return (
    `# Olá, ${userMention}! <@&${PERM_TICKET_ROLE_ID}>\n` +
    `Seu ticket elite foi aberto com sucesso. Nossa equipe irá atendê-lo em breve.\n` +
    `> **Categoria:** Ticket Elite\n` +
    `> **Responsável:** ${responsavel}\n\n` +
    `**Assunto:** ${assunto}\n\n` +
    `Descreva sua situação abaixo para que possamos ajudar da melhor forma.`
  )
}

function buildParceriaContent(userMention, proposta = '—', responsavel = 'Aguardando...') {
  return (
    `# Olá, ${userMention}! <@&${PERM_TICKET_ROLE_ID}>\n` +
    `Sua proposta de parceria foi registrada. Nossa liderança irá analisá-la em breve.\n` +
    `> **Categoria:** Proposta de Parceria\n` +
    `> **Responsável:** ${responsavel}\n\n` +
    `**Proposta:** ${proposta}\n\n` +
    `Aguarde o retorno da liderança. Fique à vontade para adicionar mais detalhes abaixo.`
  )
}

function buildEncerradoContent(userMention) {
  return (
    `# 🔒 Atendimento Encerrado\n` +
    `> Operador responsável\n` +
    `> ${userMention}\n\n` +
    `⏳ Canal será excluído automaticamente em 3 segundos.`
  )
}

// ══════════════════════════════════════════════════════════════════════════════
//  CENTRAL DE TICKETS — Components V2 (idêntico ao PY)
//  Layout: Container(azul) → título → separator → texto → banner(MediaGallery)
//          → ActionRow(select) → separator → footer
// ══════════════════════════════════════════════════════════════════════════════

const _BANNER_URL = 'https://cdn.discordapp.com/attachments/1472256808742555961/1507956176632025169/image.png?ex=6a19b7e0&is=6a186660&hm=ef2d7169da2078ef3f1e2a1272fc63286c83c56b8f4d8f08aef410e38396190a&'

function buildCentralTicketsMessage() {
  const select = new StringSelectMenuBuilder()
    .setCustomId('tkt_select_v14')
    .setPlaceholder('Selecione o tipo de atendimento...')
    .addOptions([
      { label: 'Suporte Geral',       description: 'Dúvidas, problemas ou pedidos de ajuda.',             value: 'suporte',      emoji: '🔹' },
      { label: 'Recrutamento',        description: 'Iniciar o processo seletivo para entrar na MS-13.',  value: 'recrutamento', emoji: '🔹' },
      { label: 'Ticket Elite',        description: 'Atendimento exclusivo para membros da Elite.',         value: 'elite',        emoji: '🔹' },
      { label: 'Proposta de Parceria',description: 'Propor uma aliança ou parceria com a MS-13.',          value: 'parceria',     emoji: '🤝' },
    ])

  const selectRow = new ActionRowBuilder().addComponents(select)

  const container = new ContainerBuilder()
    .setAccentColor(0x0000FF)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## CENTRAL DE ATENDIMENTO MS-13')
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        'Abra um ticket na categoria correspondente para falar com nossa liderança sobre ' +
        '**recrutamento, suporte, Elite ou parcerias** com a MS-13.\n\n' +
        'Selecione abaixo a opção que melhor descreve o seu atendimento.'
      )
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(_BANNER_URL)
      )
    )
    .addActionRowComponents(selectRow)
    .addSeparatorComponents(
      new SeparatorBuilder()
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# © MS-13 Roleplay • Todos os direitos reservados.')
    )

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  }
}

// Mantido como alias para compatibilidade com index.js / setup commands
async function buildCentralTicketsView(guild) {
  return buildCentralTicketsMessage()
}

// ══════════════════════════════════════════════════════════════════════════════
//  BOTÕES DOS PAINÉIS DE TICKET
// ══════════════════════════════════════════════════════════════════════════════

function buildTicketButtons(tipo, aceito = false) {
  const map = {
    recrutamento: { aceitarId: 'rec_aceitar_v14', fecharId: 'rec_fechar_v14' },
    suporte:      { aceitarId: 'sup_aceitar_v14', fecharId: 'sup_fechar_v14' },
    elite:        { aceitarId: 'eli_aceitar_v14', fecharId: 'eli_fechar_v14' },
    parceria:     { aceitarId: 'par_aceitar_v14', fecharId: 'par_fechar_v14' },
  }
  const cfg = map[tipo] ?? map.suporte

  if (aceito) {
    // suporte: após aceitar mostra só o botão Fechar
    if (tipo === 'suporte') {
      return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(cfg.fecharId).setLabel('🔒 Fechar').setStyle(ButtonStyle.Danger),
      )
    }
    return new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(cfg.aceitarId).setLabel('✅ Assumido').setStyle(ButtonStyle.Success).setDisabled(true),
      new ButtonBuilder().setCustomId(cfg.fecharId).setLabel('🔒 Fechar').setStyle(ButtonStyle.Danger),
    )
  }

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(cfg.aceitarId).setLabel('✅ Aceitar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(cfg.fecharId).setLabel('🔒 Fechar').setStyle(ButtonStyle.Danger),
  )
}

// ══════════════════════════════════════════════════════════════════════════════
//  TRANSCRIPT — delegado para src/systems/transcript.js
// ══════════════════════════════════════════════════════════════════════════════
// gerarEEnviarTranscript(channel, fechadoPor) importado no topo

// ══════════════════════════════════════════════════════════════════════════════
//  CRIAÇÃO DE CANAL
// ══════════════════════════════════════════════════════════════════════════════

async function criarCanalTicket(guild, user, tipo) {
  const centralChannel = guild.channels.cache.get(CHANNEL_IDS.central_tickets)
  const parentId       = centralChannel?.parentId ?? null

  const permOverwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: user.id,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles] },
    ...[...ROLES.isento].map(roleId => ({
      id: roleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages, PermissionFlagsBits.AttachFiles],
    })),
  ]

  const prefixos  = { recrutamento: 'recrutamento', suporte: 'suporte', elite: 'elite', parceria: 'parceria' }
  const prefixo   = prefixos[tipo] ?? 'ticket'
  const baseName  = user.username.toLowerCase().replace(/[^a-z0-9]/g, '-').slice(0, 20).replace(/-+$/, '') || 'usuario'
  const nomeCanal = `${prefixo}-${baseName}`

  return guild.channels.create({
    name: nomeCanal,
    type: 0,
    parent: parentId,
    permissionOverwrites: permOverwrites,
    topic: `owner:${user.id} | Ticket ${tipo} — ${user.tag} | ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
  })
}

// ══════════════════════════════════════════════════════════════════════════════
//  FECHAR TICKET — lógica compartilhada
// ══════════════════════════════════════════════════════════════════════════════

async function fecharTicket(interaction) {
  const canal     = interaction.channel
  const ctx       = ticketContextMap.get(canal.id)

  const msgInicialBackup = {
    content: interaction.message.content,
    embeds: interaction.message.embeds
  };

  await interaction.deferUpdate()

  try {
    await interaction.message.edit({ content: buildEncerradoContent(interaction.user.toString()), components: [] })
  } catch {}

  ticketContextMap.delete(canal.id)

  await gerarEEnviarTranscript(canal, interaction.user, msgInicialBackup)

  setTimeout(async () => {
    try { await canal.delete('Ticket fechado') } catch {}
  }, 3000)
}

// ══════════════════════════════════════════════════════════════════════════════
//  HANDLER PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════

async function execute(interaction) {
  const id = interaction.customId

  // ── SELECT ───────────────────────────────────────────────────────────────────
  if (id === 'tkt_select_v14') {
    const tipo = interaction.values[0]

    if (tipo === 'recrutamento') {
      // Recrutamento não tem modal — cria canal direto
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: true })
      }
      try {
        const { guild, user } = interaction
        const existente = guild.channels.cache.find(c =>
          c.topic?.includes(`owner:${user.id}`) &&
          c.name.startsWith('recrutamento-')
        )
        if (existente) {
          return interaction.editReply({
            content: (
              `# ⚠️ Ticket já existente\n` +
              `Você já possui um ticket de **recrutamento** aberto.\n\n` +
              `> Canal do ticket\n` +
              `> ${existente}\n\n` +
              `📝 Para evitar duplicatas, finalize o atendimento atual antes de abrir um novo.`
            ),
          })
        }
        const canal = await criarCanalTicket(guild, user, 'recrutamento')
        ticketContextMap.set(canal.id, { tipo: 'recrutamento', openerTag: user.tag, openerId: user.id, userMention: user.toString(), extraData: null })
        await canal.send({ content: buildRecContent(user.toString()), components: [buildTicketButtons('recrutamento')] })
        _timerInatividade(canal, 5400)  // 1h30 — idêntico ao Python
        return interaction.editReply({
          content: (
            `# 🚀 Ticket Aberto\n` +
            `Seu canal de suporte foi criado.\n\n` +
            `> 📁 ${canal}\n\n` +
            `💡 Explique seu problema com o máximo de detalhes para agilizar o atendimento.`
          ),
        })
      } catch (err) {
        console.error('[tickets] Erro ao criar ticket recrutamento:', err)
        try { await interaction.editReply({ content: `❌ Erro ao criar ticket: \`${err.message}\`` }) } catch {}
      }
      return
    }

    if (tipo === 'suporte') {
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId('sup_modal_v14')
          .setTitle('🛡️ Suporte Geral')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('sup_motivo')
                .setLabel('Descreva seu problema ou dúvida')
                .setPlaceholder('Ex: Preciso de ajuda com...')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000),
            ),
          )
      )
    }

    if (tipo === 'elite') {
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId('eli_modal_v14')
          .setTitle('💀 Ticket Elite')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('eli_assunto')
                .setLabel('Descreva o assunto')
                .setPlaceholder('Ex: Preciso falar sobre...')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000),
            ),
          )
      )
    }

    if (tipo === 'parceria') {
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId('par_modal_v14')
          .setTitle('🤝 Proposta de Parceria')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('par_proposta')
                .setLabel('Descreva sua proposta de parceria')
                .setPlaceholder('Ex: Somos a facção X e gostaríamos de...')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000),
            ),
          )
      )
    }

    return
  }

  // ── MODAIS ───────────────────────────────────────────────────────────────────
  if (['sup_modal_v14', 'eli_modal_v14', 'par_modal_v14'].includes(id)) {
    const tipoMap = { sup_modal_v14: 'suporte', eli_modal_v14: 'elite', par_modal_v14: 'parceria' }
    const tipo    = tipoMap[id]

    const extraData = id === 'sup_modal_v14'
      ? interaction.fields.getTextInputValue('sup_motivo')
      : id === 'eli_modal_v14'
        ? interaction.fields.getTextInputValue('eli_assunto')
        : interaction.fields.getTextInputValue('par_proposta')

    const { guild, user } = interaction

    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ ephemeral: true })
    }

    try {
      const existente = guild.channels.cache.find(c =>
        c.topic?.includes(`owner:${user.id}`) &&
        ['suporte-', 'elite-', 'parceria-'].some(p => c.name.startsWith(p))
      )
      if (existente) {
        return interaction.editReply({
          content: (
            `# ⚠️ Ticket já existente\n` +
            `Você já possui um ticket de **${tipo}** aberto.\n\n` +
            `> Canal do ticket\n` +
            `> ${existente}\n\n` +
            `📝 Para evitar duplicatas, finalize o atendimento atual antes de abrir um novo.`
          ),
        })
      }

      const canal = await criarCanalTicket(guild, user, tipo)
      ticketContextMap.set(canal.id, { tipo, openerTag: user.tag, openerId: user.id, userMention: user.toString(), extraData })

      let content
      if (tipo === 'suporte')  content = buildSuporteContent(user.toString(), extraData)
      if (tipo === 'elite')    content = buildEliteContent(user.toString(), extraData)
      if (tipo === 'parceria') content = buildParceriaContent(user.toString(), extraData)

      await canal.send({ content, components: [buildTicketButtons(tipo)] })

      await interaction.editReply({
        content: (
          `# 🚀 Ticket Aberto\n` +
          `Seu canal de suporte foi criado.\n\n` +
          `> 📁 ${canal}\n\n` +
          `💡 Explique seu problema com o máximo de detalhes para agilizar o atendimento.`
        ),
      })
    } catch (err) {
      console.error('[tickets] Erro ao criar ticket:', err)
      try {
        await interaction.editReply({ content: `❌ Erro ao criar ticket: \`${err.message}\`` })
      } catch {}
    }
    return
  }

  // ── ACEITAR ───────────────────────────────────────────────────────────────────
  if (['rec_aceitar_v14', 'sup_aceitar_v14', 'eli_aceitar_v14', 'par_aceitar_v14'].includes(id)) {
    const membro  = interaction.member
    const isStaff = ROLES.isento.some(r => membro.roles.cache.has(r))
    if (!isStaff) return interaction.reply({ content: '❌ Apenas a equipe pode aceitar tickets.', ephemeral: true })

    const canal = interaction.channel
    const ctx   = ticketContextMap.get(canal.id)
    if (!ctx) return interaction.reply({ content: '❌ Contexto do ticket não encontrado.', ephemeral: true })

    const { tipo, userMention, extraData } = ctx

    let novoContent
    if (tipo === 'recrutamento') novoContent = buildRecContent(userMention, interaction.user.toString())
    if (tipo === 'suporte')      novoContent = buildSuporteContent(userMention, extraData, interaction.user.toString())
    if (tipo === 'elite')        novoContent = buildEliteContent(userMention, extraData, interaction.user.toString())
    if (tipo === 'parceria')     novoContent = buildParceriaContent(userMention, extraData, interaction.user.toString())

    try {
      await interaction.deferUpdate()
      await interaction.message.edit({
        content:    novoContent,
        components: [buildTicketButtons(tipo, true)],
      })
    } catch (err) {
      console.error('[tickets] Erro ao aceitar:', err)
      if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Erro ao assumir ticket.', ephemeral: true })
    }
    return
  }

  // ── FECHAR ───────────────────────────────────────────────────────────────────
  if (['rec_fechar_v14', 'sup_fechar_v14', 'eli_fechar_v14', 'par_fechar_v14', 'close_v14'].includes(id)) {
    const membro  = interaction.member
    const isStaff = ROLES.isento.some(r => membro.roles.cache.has(r))
    const ctx     = ticketContextMap.get(interaction.channel.id)
    const isOwner = ctx?.openerId === interaction.user.id

    if (!isStaff && !isOwner) {
      return interaction.reply({ content: '❌ Apenas staff ou o dono do ticket pode fechar.', ephemeral: true })
    }

    if (interaction.replied || interaction.deferred) return

    await fecharTicket(interaction)
    return
  }
}

module.exports = { customIds, execute, buildCentralTicketsView, buildCentralTicketsMessage }