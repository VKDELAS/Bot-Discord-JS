const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ChannelType,
  PermissionsBitField,
} = require('discord.js')
const moment = require('moment-timezone')

// ─── Constantes ───────────────────────────────────────────────────────────────
const BR_TZ       = 'America/Sao_Paulo'
const COLOR_MS13  = 0x0000FF
const COLOR_REC   = 0x9B59B6
const COLOR_ERROR = 0xE74C3C
const FOOTER_TEXT = 'MS-13 Roleplay © Todos os direitos reservados'

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

const ROLE_IDS = {
  lider:      '1469085061373628437',
  sub_lider:  '1471295287896178892',
  recrutador: '1469085227757605002',
}

// ─── Comando: /painel-formulario ──────────────────────────────────────────────
const painelFormulario = {
  data: new SlashCommandBuilder()
    .setName('painel-formulario')
    .setDescription('Posta/atualiza o painel de formulário de recrutamento.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })

    try {
      const { guild } = interaction

      // Import dentro da função → evita circular
      const { buildPainelFormulario } = require('../systems/recrutamento')

      const channel = guild.channels.cache.get(REC_CHANNEL_IDS.painel_formulario)
      if (!channel) {
        return interaction.editReply({ content: '❌ Canal de painel de formulário não encontrado.' })
      }

      const messages = await channel.messages.fetch({ limit: 20 })
      const botMsg   = messages.find(m => m.author.id === guild.client.user.id)

      const payload = await buildPainelFormulario(guild)

      if (botMsg) await botMsg.edit(payload)
      else await channel.send(payload)

      await interaction.editReply({ content: '✅ Painel de formulário atualizado!' })
    } catch (err) {
      console.error('[/painel-formulario]', err)
      if (!interaction.replied && !interaction.deferred)
        return interaction.reply({ content: '❌ Erro.', ephemeral: true })
      await interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

// ─── Comando: /enviar-msgs-rec ────────────────────────────────────────────────
const enviarMsgsRec = {
  data: new SlashCommandBuilder()
    .setName('enviar-msgs-rec')
    .setDescription('Envia/atualiza todas as mensagens fixas do sistema de recrutamento.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })

    try {
      const { guild } = interaction
      const { buildPainelFormulario, buildPainelRelatorio, buildPainelBlacklist } = require('../systems/recrutamento')

      const canais = [
        { id: REC_CHANNEL_IDS.painel_formulario, builder: buildPainelFormulario },
        { id: REC_CHANNEL_IDS.relatorio_rec,     builder: buildPainelRelatorio  },
        { id: REC_CHANNEL_IDS.blacklist,          builder: buildPainelBlacklist  },
      ]

      let enviados = 0
      for (const { id, builder } of canais) {
        const channel = guild.channels.cache.get(id)
        if (!channel) continue

        const messages = await channel.messages.fetch({ limit: 20 })
        const botMsg   = messages.find(m => m.author.id === guild.client.user.id)
        const payload  = await builder(guild)

        if (botMsg) await botMsg.edit(payload)
        else await channel.send(payload)
        enviados++
      }

      await interaction.editReply({ content: `✅ ${enviados} mensagem(s) enviada(s)/atualizada(s) no sistema de recrutamento.` })
    } catch (err) {
      console.error('[/enviar-msgs-rec]', err)
      if (!interaction.replied && !interaction.deferred)
        return interaction.reply({ content: '❌ Erro.', ephemeral: true })
      await interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

// ─── Comando: /sincronizar-top-rec ────────────────────────────────────────────
const sincronizarTopRec = {
  data: new SlashCommandBuilder()
    .setName('sincronizar-top-rec')
    .setDescription('Sincroniza e atualiza o painel de top recrutadores.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })

    try {
      const { guild } = interaction
      const { buildTopRecrutadores } = require('../systems/recrutamento')

      const channel = guild.channels.cache.get(REC_CHANNEL_IDS.top_tickets)
      if (!channel) {
        return interaction.editReply({ content: '❌ Canal de top recrutadores não encontrado.' })
      }

      const messages = await channel.messages.fetch({ limit: 20 })
      const botMsg   = messages.find(m => m.author.id === guild.client.user.id)
      const payload  = await buildTopRecrutadores(guild)

      if (botMsg) await botMsg.edit(payload)
      else await channel.send(payload)

      await interaction.editReply({ content: '✅ Top recrutadores sincronizado!' })
    } catch (err) {
      console.error('[/sincronizar-top-rec]', err)
      if (!interaction.replied && !interaction.deferred)
        return interaction.reply({ content: '❌ Erro.', ephemeral: true })
      await interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

// ─── Comando: /resetar-rec-rank ───────────────────────────────────────────────
const resetarRecRank = {
  data: new SlashCommandBuilder()
    .setName('resetar-rec-rank')
    .setDescription('Reseta o ranking de recrutamento (tickets fechados) de TODOS os recrutadores.')
    .addStringOption(opt =>
      opt.setName('confirmar')
        .setDescription('Digite "CONFIRMAR" para prosseguir')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })

    try {
      const confirmacao = interaction.options.getString('confirmar')
      if (confirmacao !== 'CONFIRMAR') {
        return interaction.editReply({ content: '❌ Operação cancelada. Digite exatamente **CONFIRMAR** para prosseguir.' })
      }

      // Import dentro da função → evita circular
      const db = require('../database/manager')

      // Reseta contagem de tickets no banco
      db.prepare('UPDATE recrutadores SET tickets_fechados = 0').run()

      const { guild } = interaction
      const { buildTopRecrutadores } = require('../systems/recrutamento')

      // Atualiza painel automaticamente após reset
      const channel = guild.channels.cache.get(REC_CHANNEL_IDS.top_tickets)
      if (channel) {
        const messages = await channel.messages.fetch({ limit: 20 })
        const botMsg   = messages.find(m => m.author.id === guild.client.user.id)
        const payload  = await buildTopRecrutadores(guild)

        if (botMsg) await botMsg.edit(payload)
        else await channel.send(payload)
      }

      const agora = moment().tz(BR_TZ).format('DD/MM/YYYY HH:mm')
      await interaction.editReply({
        content: `✅ Ranking de recrutamento resetado com sucesso em **${agora}**!`,
      })
    } catch (err) {
      console.error('[/resetar-rec-rank]', err)
      if (!interaction.replied && !interaction.deferred)
        return interaction.reply({ content: '❌ Erro.', ephemeral: true })
      await interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

// ─── Comando: /resetar-top-rec ────────────────────────────────────────────────
const resetarTopRec = {
  data: new SlashCommandBuilder()
    .setName('resetar-top-rec')
    .setDescription('Reseta APENAS o painel visual do top recrutadores (não apaga dados do banco).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })

    try {
      const { guild } = interaction
      const { buildTopRecrutadoresVazio } = require('../systems/recrutamento')

      const channel = guild.channels.cache.get(REC_CHANNEL_IDS.top_tickets)
      if (!channel) {
        return interaction.editReply({ content: '❌ Canal de top recrutadores não encontrado.' })
      }

      const messages = await channel.messages.fetch({ limit: 20 })
      const botMsg   = messages.find(m => m.author.id === guild.client.user.id)
      const payload  = await buildTopRecrutadoresVazio()

      if (botMsg) await botMsg.edit(payload)
      else await channel.send(payload)

      await interaction.editReply({ content: '✅ Painel de top recrutadores resetado visualmente.' })
    } catch (err) {
      console.error('[/resetar-top-rec]', err)
      if (!interaction.replied && !interaction.deferred)
        return interaction.reply({ content: '❌ Erro.', ephemeral: true })
      await interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

// ─── Comando: /criar-canal-ticket ─────────────────────────────────────────────
const criarCanalTicket = {
  data: new SlashCommandBuilder()
    .setName('criar-canal-ticket')
    .setDescription('Cria manualmente um canal de ticket de recrutamento para um usuário.')
    .addUserOption(opt =>
      opt.setName('candidato')
        .setDescription('Usuário que será o candidato do ticket')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('nome-personagem')
        .setDescription('Nome do personagem no MTA (ex: John_Silva)')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })

    try {
      const { guild } = interaction
      const candidatoUser    = interaction.options.getUser('candidato')
      const nomePersonagem   = interaction.options.getString('nome-personagem')

      const candidatoMember = await guild.members.fetch(candidatoUser.id).catch(() => null)
      if (!candidatoMember) {
        return interaction.editReply({ content: '❌ Candidato não encontrado no servidor.' })
      }

      // Categoria de recrutamento (se 0, cria sem categoria)
      const categoriaId = REC_CHANNEL_IDS.categoria_rec
      const categoria   = categoriaId !== '0'
        ? guild.channels.cache.get(categoriaId)
        : null

      const nomeSanitizado = nomePersonagem.replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
      const nomeCanal      = `ticket-${nomeSanitizado}-${candidatoUser.id.slice(-4)}`

      const canal = await guild.channels.create({
        name:   nomeCanal,
        type:   ChannelType.GuildText,
        parent: categoria ?? undefined,
        permissionOverwrites: [
          {
            id:   guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel],
          },
          {
            id:    candidatoUser.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
          },
          {
            id:    _PERM_TICKET_ROLE_ID,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages],
          },
        ],
      })

      const embed = new EmbedBuilder()
        .setTitle('🎟️ Ticket de Recrutamento — MS-13')
        .setDescription(
          `Olá ${candidatoMember}! Seu ticket de recrutamento foi criado.\n\n` +
          `**Personagem:** \`${nomePersonagem}\`\n` +
          `Aguarde um recrutador para continuar o processo.`
        )
        .setColor(COLOR_REC)
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp()

      await canal.send({ embeds: [embed] })

      await interaction.editReply({
        content: `✅ Canal criado: ${canal} para **${candidatoUser.tag}** (\`${nomePersonagem}\`).`,
      })
    } catch (err) {
      console.error('[/criar-canal-ticket]', err)
      if (!interaction.replied && !interaction.deferred)
        return interaction.reply({ content: '❌ Erro.', ephemeral: true })
      await interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = [
  painelFormulario,
  enviarMsgsRec,
  sincronizarTopRec,
  resetarRecRank,
  resetarTopRec,
  criarCanalTicket,
]
