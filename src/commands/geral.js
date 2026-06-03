const { SlashCommandBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js')

// ─── Constantes ───────────────────────────────────────────────────────────────
const CHANNEL_IDS = {
  central_tickets:   '1488504060117123084',
  central_registros: '1487024883626938570',
  central_gerencia:  '1487025285340598322',
}

const COLOR_MS13 = 0x0000FF
const FOOTER_TEXT = 'MS-13 Roleplay © Todos os direitos reservados'

// ─── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Tenta editar a última mensagem do bot no canal.
 * Se não existir (ou falhar), cria uma nova.
 */
async function smartPost(channel, payload) {
  try {
    const messages = await channel.messages.fetch({ limit: 20 })
    const botMsg = messages.find(m => m.author.id === channel.client.user.id)
    if (botMsg) {
      await botMsg.edit(payload)
      return botMsg
    }
  } catch (_) { /* ignora erros de fetch/edit */ }
  return channel.send(payload)
}

// ─── Comando: /iniciar ────────────────────────────────────────────────────────
const iniciar = {
  data: new SlashCommandBuilder()
    .setName('iniciar')
    .setDescription('Posta (ou edita) os painéis centrais nos canais configurados.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })

    try {
      const { guild, client } = interaction

      // ── Painel de Tickets ────────────────────────────────────────────────────
      const ticketsChannel = guild.channels.cache.get(CHANNEL_IDS.central_tickets)
      if (ticketsChannel) {
        // CentralTicketsView DEVE usar IsComponentsV2
        const { buildCentralTicketsView } = require('../systems/tickets')
        const ticketsPayload = await buildCentralTicketsView(guild)
        await smartPost(ticketsChannel, {
          ...ticketsPayload,
          flags: MessageFlags.IsComponentsV2,
        })
      }

      // ── Painel de Registros ──────────────────────────────────────────────────
      const registrosChannel = guild.channels.cache.get(CHANNEL_IDS.central_registros)
      if (registrosChannel) {
        const { buildCentralRegistrosView } = require('../systems/registros')
        const registrosPayload = await buildCentralRegistrosView(guild)
        await smartPost(registrosChannel, registrosPayload)
      }

      // ── Painel de Gerência ───────────────────────────────────────────────────
      const gerenciaChannel = guild.channels.cache.get(CHANNEL_IDS.central_gerencia)
      if (gerenciaChannel) {
        const { buildCentralGerenciaView } = require('../systems/gerencia')
        const gerenciaPayload = await buildCentralGerenciaView(guild)
        await smartPost(gerenciaChannel, gerenciaPayload)
      }

      await interaction.editReply({ content: '✅ Painéis postados/atualizados com sucesso!' })
    } catch (err) {
      console.error('[/iniciar]', err)
      if (!interaction.replied && !interaction.deferred)
        return interaction.reply({ content: '❌ Erro ao iniciar painéis.', ephemeral: true })
      await interaction.editReply({ content: `❌ Erro ao iniciar painéis: \`${err.message}\`` })
    }
  },
}

// ─── Comando: /atualizar-paineis ──────────────────────────────────────────────
const atualizarPaineis = {
  data: new SlashCommandBuilder()
    .setName('atualizar-paineis')
    .setDescription('Apaga todas as mensagens do bot nos canais de painel e recria tudo.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })

    try {
      const { guild, client } = interaction

      const channelEntries = [
        { id: CHANNEL_IDS.central_tickets,   builder: 'buildCentralTicketsView',   system: 'tickets',   useV2: true },
        { id: CHANNEL_IDS.central_registros, builder: 'buildCentralRegistrosView', system: 'registros', useV2: false },
        { id: CHANNEL_IDS.central_gerencia,  builder: 'buildCentralGerenciaView',  system: 'gerencia',  useV2: false },
      ]

      for (const entry of channelEntries) {
        const channel = guild.channels.cache.get(entry.id)
        if (!channel) continue

        // Apaga mensagens antigas do bot
        const messages = await channel.messages.fetch({ limit: 50 })
        const botMsgs  = messages.filter(m => m.author.id === client.user.id)
        for (const [, msg] of botMsgs) {
          await msg.delete().catch(() => {})
        }

        // Cria painel novo
        const sys     = require(`../systems/${entry.system}`)
        const payload = await sys[entry.builder](guild)

        await channel.send({
          ...payload,
          ...(entry.useV2 ? { flags: MessageFlags.IsComponentsV2 } : {}),
        })
      }

      await interaction.editReply({ content: '✅ Todos os painéis foram recriados!' })
    } catch (err) {
      console.error('[/atualizar-paineis]', err)
      if (!interaction.replied && !interaction.deferred)
        return interaction.reply({ content: '❌ Erro ao atualizar painéis.', ephemeral: true })
      await interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

// ─── Comando: /status-bot ─────────────────────────────────────────────────────
const statusBot = {
  data: new SlashCommandBuilder()
    .setName('status-bot')
    .setDescription('Exibe informações de status e saúde do bot.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })

    try {
      const { client } = interaction
      const moment     = require('moment-timezone')
      const os         = require('os')

      const uptimeMs  = client.uptime ?? 0
      const uptimeSec = Math.floor(uptimeMs / 1000)
      const hh        = Math.floor(uptimeSec / 3600)
      const mm        = Math.floor((uptimeSec % 3600) / 60)
      const ss        = uptimeSec % 60

      const memUsed   = process.memoryUsage()
      const heapMB    = (memUsed.heapUsed / 1024 / 1024).toFixed(1)
      const rssMB     = (memUsed.rss     / 1024 / 1024).toFixed(1)

      const pingAPI   = client.ws.ping
      const guildCount = client.guilds.cache.size
      const agora     = moment().tz('America/Sao_Paulo').format('DD/MM/YYYY HH:mm:ss')

      const { EmbedBuilder } = require('discord.js')
      const embed = new EmbedBuilder()
        .setTitle('🤖 Status do Bot MS-13')
        .setColor(COLOR_MS13)
        .addFields(
          { name: '🟢 Online desde',     value: `${hh}h ${mm}m ${ss}s`,       inline: true },
          { name: '📡 Ping WebSocket',   value: `${pingAPI}ms`,                inline: true },
          { name: '🏠 Servidores',       value: `${guildCount}`,               inline: true },
          { name: '💾 Heap usado',       value: `${heapMB} MB`,                inline: true },
          { name: '💿 RSS (memória)',    value: `${rssMB} MB`,                 inline: true },
          { name: '📦 Node.js',         value: process.version,               inline: true },
          { name: '🕒 Horário (BR)',     value: agora,                         inline: false },
        )
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp()

      await interaction.editReply({ embeds: [embed] })
    } catch (err) {
      console.error('[/status-bot]', err)
      if (!interaction.replied && !interaction.deferred)
        return interaction.reply({ content: '❌ Erro ao obter status.', ephemeral: true })
      await interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = [iniciar, atualizarPaineis, statusBot]
