// ============================================================
// ETAPA 5 — Sistema de Tickets
// src/systems/tickets.js
// ============================================================

const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
} = require('discord.js')

// ─── Constantes locais ───────────────────────────────────────
const {
  COLOR_MS13, COLOR_SUCCESS, COLOR_ERROR, COLOR_WARNING, COLOR_INFO,
  FOOTER_TEXT,
  ROLES,
  CHANNEL_IDS,
  ROLE_IDS,
} = require('../config/settings.js')

// ─── customIds exportados ────────────────────────────────────
const customIds = [
  'tkt_select_v14',
  'close_v14',
  'sup_aceitar_v14', 'sup_fechar_v14',
  'eli_aceitar_v14', 'eli_fechar_v14',
  'par_aceitar_v14', 'par_fechar_v14',
]

// ─── Mapa de contexto por usuário (evita importar globais) ───
// Guardamos { tipo } por userId caso seja necessário no futuro
const ticketContextMap = new Map()

// ────────────────────────────────────────────────────────────
// BUILDER: CentralTicketsView (Components V2 — único lugar!)
// ────────────────────────────────────────────────────────────
function buildEmbedCentralTickets() {
  // Components V2: usamos Container + TextDisplay + Separator + ActionRow
  const container = new ContainerBuilder()

  const header = new TextDisplayBuilder().setContent(
    '# 🎫 Central de Tickets — MS-13\n' +
    '> Selecione o tipo de atendimento desejado abaixo.\n' +
    '> Nossa equipe irá te atender o mais breve possível.'
  )

  const sep = new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).setDivider(true)

  const info = new TextDisplayBuilder().setContent(
    '**📋 Tipos de atendimento disponíveis:**\n' +
    '・ **Suporte** — Dúvidas, problemas ou denúncias internas\n' +
    '・ **Elite** — Solicitações relacionadas ao setor Elite\n' +
    '・ **Parceria** — Proposta de parceria com a facção\n\n' +
    '*Ao abrir um ticket, seja objetivo e aguarde o atendimento.*'
  )

  const sep2 = new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)

  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('tkt_select_v14')
      .setPlaceholder('📂 Escolha o tipo de ticket...')
      .addOptions([
        {
          label: 'Suporte',
          description: 'Dúvidas, problemas ou denúncias internas',
          value: 'suporte',
          emoji: '🛠️',
        },
        {
          label: 'Elite',
          description: 'Solicitações do setor Elite',
          value: 'elite',
          emoji: '⚔️',
        },
        {
          label: 'Parceria',
          description: 'Proposta de parceria com a MS-13',
          value: 'parceria',
          emoji: '🤝',
        },
      ])
  )

  container.addTextDisplayComponents(header)
  container.addSeparatorComponents(sep)
  container.addTextDisplayComponents(info)
  container.addSeparatorComponents(sep2)
  container.addActionRowComponents(row)

  return container
}

// ────────────────────────────────────────────────────────────
// HELPER: embed padrão do painel do ticket (dentro do canal)
// ────────────────────────────────────────────────────────────
function buildPainelTicket(tipo, user) {
  const configs = {
    suporte: {
      titulo: '🛠️ Ticket de Suporte',
      cor: COLOR_INFO,
      desc: `**Usuário:** ${user}\n**Tipo:** Suporte\n\nDescreva seu problema ou dúvida. Nossa equipe irá te atender em breve.`,
      aceitarId: 'sup_aceitar_v14',
      fecharId:  'sup_fechar_v14',
    },
    elite: {
      titulo: '⚔️ Ticket Elite',
      cor: COLOR_WARNING,
      desc: `**Usuário:** ${user}\n**Tipo:** Elite\n\nSua solicitação foi registrada. Aguarde um responsável do setor Elite.`,
      aceitarId: 'eli_aceitar_v14',
      fecharId:  'eli_fechar_v14',
    },
    parceria: {
      titulo: '🤝 Ticket de Parceria',
      cor: COLOR_MS13,
      desc: `**Usuário:** ${user}\n**Tipo:** Parceria\n\nSua proposta foi registrada. Aguarde uma resposta da liderança.`,
      aceitarId: 'par_aceitar_v14',
      fecharId:  'par_fechar_v14',
    },
  }

  const cfg = configs[tipo]

  const embed = new EmbedBuilder()
    .setTitle(cfg.titulo)
    .setDescription(cfg.desc)
    .setColor(cfg.cor)
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp()

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(cfg.aceitarId)
      .setLabel('✅ Aceitar')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(cfg.fecharId)
      .setLabel('🔒 Fechar Ticket')
      .setStyle(ButtonStyle.Danger),
  )

  return { embed, row }
}

// ────────────────────────────────────────────────────────────
// HELPER: modal de suporte (abre automaticamente ao criar ticket)
// ────────────────────────────────────────────────────────────
function buildModalSuporte() {
  return new ModalBuilder()
    .setCustomId('sup_modal_v14')
    .setTitle('📋 Detalhes do Suporte')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('sup_assunto')
          .setLabel('Assunto')
          .setPlaceholder('Resumo do problema ou dúvida')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('sup_descricao')
          .setLabel('Descrição detalhada')
          .setPlaceholder('Descreva com detalhes o que aconteceu...')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
      ),
    )
}

// ────────────────────────────────────────────────────────────
// HELPER: gerar transcript simples (texto) do canal
// ────────────────────────────────────────────────────────────
async function gerarTranscript(channel) {
  try {
    const messages = await channel.messages.fetch({ limit: 100 })
    const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp)

    const lines = sorted.map(m => {
      const ts  = new Date(m.createdTimestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      const tag = m.author.tag
      const txt = m.content || '[sem texto]'
      return `[${ts}] ${tag}: ${txt}`
    })

    return lines.join('\n')
  } catch {
    return '[falha ao gerar transcript]'
  }
}

// ────────────────────────────────────────────────────────────
// HELPER: postar transcript nos logs
// ────────────────────────────────────────────────────────────
async function postarTranscript(guild, channel, tipo, opener) {
  try {
    const logsChannel = guild.channels.cache.get(CHANNEL_IDS.logs_geral)
    if (!logsChannel) return

    const conteudo = await gerarTranscript(channel)
    const buf = Buffer.from(conteudo, 'utf8')
    const { AttachmentBuilder } = require('discord.js')
    const arquivo = new AttachmentBuilder(buf, { name: `transcript-${channel.name}.txt` })

    const embed = new EmbedBuilder()
      .setTitle('📋 Transcript de Ticket Fechado')
      .setDescription(
        `**Canal:** #${channel.name}\n` +
        `**Tipo:** ${tipo}\n` +
        `**Aberto por:** ${opener}`
      )
      .setColor(COLOR_ERROR)
      .setFooter({ text: FOOTER_TEXT })
      .setTimestamp()

    await logsChannel.send({ embeds: [embed], files: [arquivo] })
  } catch (err) {
    console.error('[tickets] Erro ao postar transcript:', err)
  }
}

// ────────────────────────────────────────────────────────────
// HELPER: criar canal de ticket
// ────────────────────────────────────────────────────────────
async function criarCanalTicket(guild, user, tipo) {
  // Pegar categoria do canal central de tickets para herdar
  const centralChannel = guild.channels.cache.get(CHANNEL_IDS.central_tickets)
  const parentId = centralChannel?.parentId ?? null

  // Permissões base: ninguém vê, user vê, staff vê
  const permOverwrites = [
    {
      id: guild.id, // @everyone
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
    // Staff: todos os cargos isentos têm acesso
    ...[...ROLES.isento].map(roleId => ({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.AttachFiles,
      ],
    })),
  ]

  const tipoNome = { suporte: 'sup', elite: 'eli', parceria: 'par' }[tipo]
  const nomeCanal = `${tipoNome}-${user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`

  const canal = await guild.channels.create({
    name: nomeCanal,
    type: 0, // GUILD_TEXT
    parent: parentId,
    permissionOverwrites: permOverwrites,
    topic: `Ticket ${tipo} — ${user.tag} | ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
  })

  return canal
}

// ────────────────────────────────────────────────────────────
// EXECUTE — dispatcher principal
// ────────────────────────────────────────────────────────────
async function execute(interaction) {
  const id = interaction.customId

  // ── SELECT: tipo de ticket ──────────────────────────────
  if (id === 'tkt_select_v14') {
    const tipo = interaction.values[0] // 'suporte' | 'elite' | 'parceria'
    const { guild, user } = interaction

    await interaction.deferReply({ ephemeral: true })

    try {
      // Verificar se usuário já tem ticket aberto
      const existente = guild.channels.cache.find(c =>
        c.topic?.includes(user.tag) &&
        ['sup-', 'eli-', 'par-'].some(p => c.name.startsWith(p))
      )

      if (existente) {
        return await interaction.editReply({
          content: `❌ Você já tem um ticket aberto: ${existente}. Feche-o antes de abrir outro.`,
        })
      }

      const canal = await criarCanalTicket(guild, user, tipo)
      ticketContextMap.set(canal.id, { tipo, openerTag: user.tag, openerId: user.id })

      const { embed, row } = buildPainelTicket(tipo, user.toString())

      const msgInicial = await canal.send({
        content: `${user} — Seu ticket foi criado! ${tipo === 'suporte' ? 'Preencha o formulário abaixo.' : 'Aguarde o atendimento.'}`,
        embeds: [embed],
        components: [row],
      })

      // Suporte: abrir Modal automaticamente via followUp
      // (não é possível mostrar modal em resposta a select com defer,
      //  mas podemos informar o usuário e abrir quando clicar em "aceitar")
      // → Enviamos aviso no canal sobre o formulário
      if (tipo === 'suporte') {
        await canal.send({
          embeds: [
            new EmbedBuilder()
              .setDescription('📝 **Aguardando detalhes do suporte.**\nUm atendente irá solicitar as informações ao aceitar o ticket.')
              .setColor(COLOR_INFO),
          ],
        })
      }

      await interaction.editReply({
        content: `✅ Ticket criado com sucesso! Acesse: ${canal}`,
      })
    } catch (err) {
      console.error('[tickets] Erro ao criar ticket:', err)
      await interaction.editReply({ content: '❌ Erro ao criar o ticket. Tente novamente.' })
    }
    return
  }

  // ── BOTÃO: ACEITAR (suporte / elite / parceria) ─────────
  if (['sup_aceitar_v14', 'eli_aceitar_v14', 'par_aceitar_v14'].includes(id)) {
    // Verificar se é staff
    const membro = interaction.member
    const isStaff = ROLES.isento.some(r => membro.roles.cache.has(r))
    if (!isStaff) {
      return interaction.reply({ content: '❌ Apenas a equipe pode aceitar tickets.', ephemeral: true })
    }

    const canal = interaction.channel
    const ctx   = ticketContextMap.get(canal.id)
    const tipo  = ctx?.tipo ?? 'desconhecido'

    // Se suporte: abre modal de detalhes
    if (id === 'sup_aceitar_v14') {
      return await interaction.showModal(buildModalSuporte())
    }

    await interaction.deferReply()

    // Alterar permissões: remover mensagens do usuário (só staff fala agora não — manter abertas)
    try {
      const embed = new EmbedBuilder()
        .setTitle('✅ Ticket Assumido')
        .setDescription(
          `**Atendente:** ${interaction.user}\n` +
          `**Tipo:** ${tipo}\n\n` +
          `O ticket foi assumido. Por favor, descreva sua situação detalhadamente.`
        )
        .setColor(COLOR_SUCCESS)
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp()

      // Desabilitar botão aceitar, manter fechar
      const tipoPrefix = { suporte: 'sup', elite: 'eli', parceria: 'par' }[tipo] ?? 'sup'
      const novaRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${tipoPrefix}_aceitar_v14`)
          .setLabel('✅ Assumido')
          .setStyle(ButtonStyle.Success)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId(`${tipoPrefix}_fechar_v14`)
          .setLabel('🔒 Fechar Ticket')
          .setStyle(ButtonStyle.Danger),
      )

      await interaction.message.edit({ components: [novaRow] })
      await interaction.editReply({ embeds: [embed] })
    } catch (err) {
      console.error('[tickets] Erro ao aceitar ticket:', err)
      await interaction.editReply({ content: '❌ Erro ao assumir ticket.' })
    }
    return
  }

  // ── MODAL SUBMIT: sup_modal_v14 ─────────────────────────
  if (id === 'sup_modal_v14') {
    const assunto   = interaction.fields.getTextInputValue('sup_assunto')
    const descricao = interaction.fields.getTextInputValue('sup_descricao')

    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('📋 Detalhes do Suporte Registrados')
          .addFields(
            { name: 'Assunto',    value: assunto,   inline: false },
            { name: 'Descrição',  value: descricao, inline: false },
            { name: 'Atendente', value: interaction.user.toString(), inline: false },
          )
          .setColor(COLOR_INFO)
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp(),
      ],
    })
    return
  }

  // ── BOTÃO: FECHAR (todos os tipos) ──────────────────────
  if (['sup_fechar_v14', 'eli_fechar_v14', 'par_fechar_v14', 'close_v14'].includes(id)) {
    // Staff ou dono do ticket podem fechar
    const membro  = interaction.member
    const isStaff = ROLES.isento.some(r => membro.roles.cache.has(r))
    const canal   = interaction.channel
    const ctx     = ticketContextMap.get(canal.id)
    const isOwner = ctx?.openerId === interaction.user.id

    if (!isStaff && !isOwner) {
      return interaction.reply({ content: '❌ Apenas staff ou o dono do ticket pode fechar.', ephemeral: true })
    }

    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply()

    try {
      const tipo     = ctx?.tipo ?? 'desconhecido'
      const openerTag = ctx?.openerTag ?? 'Desconhecido'

      // Gerar e postar transcript
      await postarTranscript(interaction.guild, canal, tipo, openerTag)

      const embed = new EmbedBuilder()
        .setTitle('🔒 Ticket Encerrado')
        .setDescription(
          `**Fechado por:** ${interaction.user}\n` +
          `**Tipo:** ${tipo}\n\n` +
          `O transcript foi salvo nos logs. Este canal será deletado em **5 segundos**.`
        )
        .setColor(COLOR_ERROR)
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp()

      await interaction.editReply({ embeds: [embed] })

      // Remover do mapa
      ticketContextMap.delete(canal.id)

      // Deletar canal após 5s
      setTimeout(async () => {
        try { await canal.delete('Ticket fechado') } catch {}
      }, 5000)
    } catch (err) {
      console.error('[tickets] Erro ao fechar ticket:', err)
      if (!interaction.replied) await interaction.editReply({ content: '❌ Erro ao fechar ticket.' })
    }
    return
  }
}

// ────────────────────────────────────────────────────────────
// EXPORTS
// ────────────────────────────────────────────────────────────
module.exports = { customIds, execute, buildEmbedCentralTickets }
