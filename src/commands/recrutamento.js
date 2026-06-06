// src/commands/recrutamento.js
'use strict'

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  PermissionsBitField,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
} = require('discord.js')
const moment   = require('moment-timezone')

const {
  BR_TZ, COLOR_REC, COLOR_MS13, COLOR_SUCCESS, COLOR_ERROR,
  FOOTER_TEXT, REC_CHANNEL_IDS, _PERM_TICKET_ROLE_ID,
} = require('../config/settings.js')

const {
  atualizarRanking,
  buildPayloadRankingRecrutadoresVazio,
  buildPayloadRankingAtendentesVazio,
  getDb,
  agora,
} = require('../systems/rankingEngine.js')

const BANNER_REC     = 'https://cdn.discordapp.com/attachments/1489797401039474808/1512449213932503130/banner_rec.png?ex=6a242198&is=6a22d018&hm=cc997879c7a773d6dc2aa147c5b01c9f6bd0a9e68d59b7772f068733f6cb4e2b&'
const BANNER_TICKETS = 'https://cdn.discordapp.com/attachments/1489797401039474808/1512449212594520257/banner_tickets.png?ex=6a242198&is=6a22d018&hm=99391c2d19ee698b5ec61e59f15db5147bb360a6d8a033e0b4ea66bd013d5ad2&'

// ─────────────────────────────────────────────────────────────────────────────
// Helper: encontra msg do bot no canal pelo identificador e edita ou envia
// ─────────────────────────────────────────────────────────────────────────────
async function upsertBotMsg(channel, payload, clientId, identifier) {
  const msgs = await channel.messages.fetch({ limit: 50 })
  const existing = msgs.find(m =>
    m.author.id === clientId &&
    JSON.stringify(m.components).includes(identifier)
  )
  if (existing) { await existing.edit(payload); return { updated: true } }
  await channel.send(payload)
  return { updated: false }
}

// ─────────────────────────────────────────────────────────────────────────────
// /painel-formulario — posta ou atualiza o painel de gerenciamento do formulário
// ─────────────────────────────────────────────────────────────────────────────
const painelFormulario = {
  data: new SlashCommandBuilder()
    .setName('painel-formulario')
    .setDescription('Posta ou atualiza o painel do formulário de recrutamento.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })
    try {
      const { buildPainelFormularioContainer } = require('../systems/recrutamento')
      const ch = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.painel_formulario)
      if (!ch) return interaction.editReply({ content: '❌ Canal `painel_formulario` não encontrado em `settings.js`.' })
      const r = await upsertBotMsg(ch, buildPainelFormularioContainer(), interaction.client.user.id, 'PAINEL_FORM')
      return interaction.editReply({ content: r.updated ? '🔄 Painel **atualizado**!' : '✅ Painel **enviado**!' })
    } catch (err) {
      console.error('[/painel-formulario]', err)
      return interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// /enviar-msgs-rec — envia/atualiza TODOS os painéis fixos do sistema
// ─────────────────────────────────────────────────────────────────────────────
const enviarMsgsRec = {
  data: new SlashCommandBuilder()
    .setName('enviar-msgs-rec')
    .setDescription('Envia ou atualiza todas as mensagens fixas do sistema de recrutamento.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })
    try {
      const {
        buildPainelFormularioContainer,
        buildPainelRelatorio,
        buildPainelBlacklist,
        buildEstatisticasGerais,
      } = require('../systems/recrutamento')

      const paineis = [
        { id: REC_CHANNEL_IDS.painel_formulario, builder: () => buildPainelFormularioContainer(), key: 'PAINEL_FORM',  nome: 'Formulário'         },
        { id: REC_CHANNEL_IDS.relatorio_rec,     builder: () => buildEstatisticasGerais(),        key: 'STATS_GERAIS', nome: 'Estatísticas Gerais' },
        { id: REC_CHANNEL_IDS.relatorio_rec,     builder: () => buildPainelRelatorio(),           key: 'Relatórios',   nome: 'Painel Relatório'    },
        { id: REC_CHANNEL_IDS.blacklist,          builder: () => buildPainelBlacklist(),           key: 'Blacklist',    nome: 'Blacklist'            },
      ]

      const linhas = []

      for (const p of paineis) {
        const ch = interaction.guild.channels.cache.get(p.id)
        if (!ch) { linhas.push(`❌ **${p.nome}** — canal não encontrado (\`${p.id}\`)`); continue }
        try {
          const r = await upsertBotMsg(ch, p.builder(), interaction.client.user.id, p.key)
          linhas.push(`${r.updated ? '🔄' : '✅'} **${p.nome}** — ${r.updated ? 'atualizado' : 'enviado'} em ${ch}`)
        } catch (e) {
          linhas.push(`❌ **${p.nome}** — \`${e.message}\``)
        }
      }

      // Também sincroniza os dois rankings
      try {
        await atualizarRanking('recrutadores', interaction.guild)
        linhas.push('🔄 **Ranking Recrutadores** — sincronizado')
      } catch (e) { linhas.push(`❌ **Ranking Recrutadores** — \`${e.message}\``) }

      try {
        await atualizarRanking('atendentes', interaction.guild)
        linhas.push('🔄 **Ranking Atendentes** — sincronizado')
      } catch (e) { linhas.push(`❌ **Ranking Atendentes** — \`${e.message}\``) }

      return interaction.editReply({
        content: `## 📋 /enviar-msgs-rec\n\n${linhas.map(l => `> ${l}`).join('\n')}`,
      })
    } catch (err) {
      console.error('[/enviar-msgs-rec]', err)
      return interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// /sincronizar-top-rec — força atualização do ranking de recrutadores
// ─────────────────────────────────────────────────────────────────────────────
const sincronizarTopRec = {
  data: new SlashCommandBuilder()
    .setName('sincronizar-top-rec')
    .setDescription('Sincroniza o ranking de recrutadores com os dados atuais do banco.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })
    try {
      await atualizarRanking('recrutadores', interaction.guild)
      return interaction.editReply({ content: '✅ Ranking de **recrutadores** sincronizado!' })
    } catch (err) {
      console.error('[/sincronizar-top-rec]', err)
      return interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// /sincronizar-top-atd — força atualização do ranking de atendentes
// ─────────────────────────────────────────────────────────────────────────────
const sincronizarTopAtd = {
  data: new SlashCommandBuilder()
    .setName('sincronizar-top-atd')
    .setDescription('Sincroniza o ranking de atendentes com os dados atuais do banco.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })
    try {
      await atualizarRanking('atendentes', interaction.guild)
      return interaction.editReply({ content: '✅ Ranking de **atendentes** sincronizado!' })
    } catch (err) {
      console.error('[/sincronizar-top-atd]', err)
      return interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// /resetar-rec-rank — reseta ranking de recrutadores no DB + painel visual
// ─────────────────────────────────────────────────────────────────────────────
const resetarRecRank = {
  data: new SlashCommandBuilder()
    .setName('resetar-rec-rank')
    .setDescription('Reseta o ranking de recrutadores (fecha todos os registros no DB).')
    .addStringOption(o =>
      o.setName('confirmar').setDescription('Digite exatamente "CONFIRMAR"').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })
    try {
      if (interaction.options.getString('confirmar') !== 'CONFIRMAR')
        return interaction.editReply({ content: '❌ Digite exatamente **CONFIRMAR** para prosseguir.' })

      // ✅ Usa a conexão compartilhada — a mesma que atualizarRanking usa
      const info = getDb().prepare("UPDATE recrutamentos SET status='fechado' WHERE status != 'fechado'").run()

      // Atualiza o visual do canal com payload vazio
      const ch = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.recrutadores)
      if (ch) {
        const payload  = buildPayloadRankingRecrutadoresVazio()
        const msgs     = await ch.messages.fetch({ limit: 50 })
        const existing = msgs.find(m => m.author.id === interaction.client.user.id && JSON.stringify(m.components).includes('RANK_REC'))
        if (existing) await existing.edit(payload).catch(() => null)
        else await ch.send(payload).catch(() => null)
      }

      const box = new ContainerBuilder()
        .setAccentColor(COLOR_SUCCESS)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            '## ✅ RANKING DE RECRUTADORES RESETADO\n\n' +
            `> **Registros fechados:** \`${info.changes}\`\n` +
            `> **Por:** <@${interaction.user.id}>\n` +
            `> **Data:** ${agora()}\n\n` +
            '> A competição recomeça agora! 🔫'
          )
        )
      return interaction.editReply({ components: [box], flags: MessageFlags.IsComponentsV2 })
    } catch (err) {
      console.error('[/resetar-rec-rank]', err)
      return interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// /resetar-atd-rank — reseta ranking de atendentes no DB + painel visual
// ─────────────────────────────────────────────────────────────────────────────
const resetarAtdRank = {
  data: new SlashCommandBuilder()
    .setName('resetar-atd-rank')
    .setDescription('Reseta o ranking de atendentes (fecha todos os atendimentos no DB).')
    .addStringOption(o =>
      o.setName('confirmar').setDescription('Digite exatamente "CONFIRMAR"').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })
    try {
      if (interaction.options.getString('confirmar') !== 'CONFIRMAR')
        return interaction.editReply({ content: '❌ Digite exatamente **CONFIRMAR** para prosseguir.' })

      // ✅ Usa a conexão compartilhada — a mesma que atualizarRanking usa
      const info = getDb().prepare("UPDATE atendimentos SET status='fechado' WHERE status != 'fechado'").run()

      const ch = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.top_tickets)
      if (ch) {
        const payload  = buildPayloadRankingAtendentesVazio()
        const msgs     = await ch.messages.fetch({ limit: 50 })
        const existing = msgs.find(m => m.author.id === interaction.client.user.id && JSON.stringify(m.components).includes('RANK_ATD'))
        if (existing) await existing.edit(payload).catch(() => null)
        else await ch.send(payload).catch(() => null)
      }

      const box = new ContainerBuilder()
        .setAccentColor(COLOR_SUCCESS)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            '## ✅ RANKING DE ATENDENTES RESETADO\n\n' +
            `> **Registros fechados:** \`${info.changes}\`\n` +
            `> **Por:** <@${interaction.user.id}>\n` +
            `> **Data:** ${agora()}\n\n` +
            '> A competição recomeça agora!'
          )
        )
      return interaction.editReply({ components: [box], flags: MessageFlags.IsComponentsV2 })
    } catch (err) {
      console.error('[/resetar-atd-rank]', err)
      return interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// /resetar-top-rec — reseta APENAS o visual do ranking de recrutadores
// ─────────────────────────────────────────────────────────────────────────────
const resetarTopRec = {
  data: new SlashCommandBuilder()
    .setName('resetar-top-rec')
    .setDescription('Reseta apenas o visual do ranking de recrutadores (não afeta o DB).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })
    try {
      const ch = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.recrutadores)
      if (!ch) return interaction.editReply({ content: '❌ Canal não encontrado.' })
      const payload  = buildPayloadRankingRecrutadoresVazio()
      const msgs     = await ch.messages.fetch({ limit: 50 })
      const existing = msgs.find(m => m.author.id === interaction.client.user.id && JSON.stringify(m.components).includes('RANK_REC'))
      if (existing) await existing.edit(payload)
      else await ch.send(payload)
      return interaction.editReply({ content: '✅ Painel visual de recrutadores **resetado**.' })
    } catch (err) {
      console.error('[/resetar-top-rec]', err)
      return interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// /criar-canal-ticket — staff cria ticket manualmente para um candidato
// ─────────────────────────────────────────────────────────────────────────────
const criarCanalTicket = {
  data: new SlashCommandBuilder()
    .setName('criar-canal-ticket')
    .setDescription('Cria manualmente um canal de ticket de recrutamento para um candidato.')
    .addUserOption(o => o.setName('candidato').setDescription('Usuário candidato').setRequired(true))
    .addStringOption(o => o.setName('nome-personagem').setDescription('Nome do personagem no MTA').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })
    try {
      const { guild }      = interaction
      const candidato      = interaction.options.getUser('candidato')
      const nomePersonagem = interaction.options.getString('nome-personagem')
      const member         = await guild.members.fetch(candidato.id).catch(() => null)
      if (!member) return interaction.editReply({ content: `❌ **${candidato.tag}** não está no servidor.` })

      const db = getDb()

      // ✅ Anti-duplicação
      const existente = db.prepare("SELECT ticket_id FROM recrutamentos WHERE candidato_id=? AND status='aberto' LIMIT 1").get(candidato.id)
      if (existente) {
        const canalExist = guild.channels.cache.get(existente.ticket_id)
        return interaction.editReply({
          content: canalExist
            ? `⚠️ **${candidato.tag}** já tem ticket aberto: ${canalExist}. Feche-o antes.`
            : `⚠️ **${candidato.tag}** já tem um registro aberto no banco. Use \`/resetar-rec-rank\` se necessário.`,
        })
      }

      // Blacklist
      const naBl = db.prepare('SELECT motivo FROM blacklist WHERE user_id=?').get(candidato.id)
      if (naBl) return interaction.editReply({ content: `🚫 **${candidato.tag}** está na blacklist.\n> **Motivo:** ${naBl.motivo}` })

      const cat       = REC_CHANNEL_IDS.categoria_rec !== '0' ? guild.channels.cache.get(REC_CHANNEL_IDS.categoria_rec) : null
      const nomeSan   = nomePersonagem.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase().slice(0, 40)
      const nomeCanal = `rec-${nomeSan}-${candidato.id.slice(-4)}`

      const canal = await guild.channels.create({
        name:   nomeCanal,
        type:   ChannelType.GuildText,
        parent: cat ?? undefined,
        topic:  `Candidato: ${candidato.id}`,
        permissionOverwrites: [
          { id: guild.id,              deny:  [PermissionsBitField.Flags.ViewChannel] },
          { id: candidato.id,          allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          { id: _PERM_TICKET_ROLE_ID,  allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages] },
        ],
      })

      db.prepare("INSERT OR IGNORE INTO recrutamentos (candidato_id, ticket_id, status) VALUES (?, ?, 'aberto')").run(candidato.id, canal.id)

      const { buildTicketAberturaContainer } = require('../systems/recrutamento')
      await canal.send(buildTicketAberturaContainer(candidato.id, agora()))

      const box = new ContainerBuilder()
        .setAccentColor(COLOR_REC)
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(BANNER_REC))
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            '## ✅ TICKET CRIADO\n\n' +
            `> **Candidato:** <@${candidato.id}>\n` +
            `> **Personagem:** \`${nomePersonagem}\`\n` +
            `> **Canal:** ${canal}\n` +
            `> **Por:** <@${interaction.user.id}>\n` +
            `> **Data:** ${agora()}`
          )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# © MS-13 Roleplay • Recrutamento'))

      return interaction.editReply({ components: [box], flags: MessageFlags.IsComponentsV2 })
    } catch (err) {
      console.error('[/criar-canal-ticket]', err)
      return interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
module.exports = [
  painelFormulario,
  enviarMsgsRec,
  sincronizarTopRec,
  sincronizarTopAtd,
  resetarRecRank,
  resetarAtdRank,
  resetarTopRec,
  criarCanalTicket,
]