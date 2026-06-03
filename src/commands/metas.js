const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js')
const moment = require('moment-timezone')

// ─── Constantes ───────────────────────────────────────────────────────────────
const BR_TZ       = 'America/Sao_Paulo'
const META_VALOR  = 70_000
const COLOR_MS13  = 0x0000FF
const COLOR_INFO  = 0x3498DB
const FOOTER_TEXT = 'MS-13 Roleplay © Todos os direitos reservados'

const ROLES = {
  isento:  ['1469085061373628437','1471295287896178892','1469085227757605002',
             '1469085338046697572','1469085446108741780','1469131886533017671'],
  elite:   ['1471297185227346183','1471297000845742292','1477356816366047445'],
  membro:  ['1471296434505646110','1471296807349911604','1471295722937647239','1469085564920795371'],
}

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

const ROLE_IDS = {
  meta_paga: '1486403263657152674',
}

const PRODUTOS_META_LISTA = 'Pólvora (~220 un.), Ferro (~190 un.), Kevlar (~70 un.) e Tecido (~60 un.)\n*(meta padrão: 2 rotas completas)*'

// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Retorna a categoria do membro: 'isento' | 'elite' | 'membro' | null */
function categoriaMembro(member) {
  for (const [cat, ids] of Object.entries(ROLES)) {
    if (ids.some(id => member.roles.cache.has(id))) return cat
  }
  return null
}

/** Retorna o nome do cargo mais alto reconhecido do membro */
function cargoNome(member) {
  for (const [id, nome] of Object.entries(ROLE_NAMES)) {
    if (member.roles.cache.has(id)) return nome
  }
  return 'Sem cargo reconhecido'
}

// ─── Comando: /meta-status ────────────────────────────────────────────────────
module.exports = {
  data: new SlashCommandBuilder()
    .setName('meta-status')
    .setDescription('Exibe o status da meta semanal — geral ou de um membro específico.')
    .addUserOption(opt =>
      opt.setName('membro')
        .setDescription('Membro para consultar (deixe em branco para ver o geral)')
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true })

    try {
      const { guild } = interaction

      // Import dentro da função para evitar circular dependency (metas→registros)
      const db = require('../database/manager')

      const targetUser = interaction.options.getUser('membro')

      // ── Status individual ────────────────────────────────────────────────────
      if (targetUser) {
        const member = await guild.members.fetch(targetUser.id).catch(() => null)
        if (!member) {
          return interaction.editReply({ content: '❌ Membro não encontrado no servidor.' })
        }

        const cat   = categoriaMembro(member)
        const cargo = cargoNome(member)
        const isPago = member.roles.cache.has(ROLE_IDS.meta_paga)

        // Busca progresso no banco
        const row = db.prepare(
          'SELECT valor_entregue, semana FROM metas WHERE user_id = ?'
        ).get(targetUser.id)

        const valorEntregue = row?.valor_entregue ?? 0
        const progresso     = Math.min((valorEntregue / META_VALOR) * 100, 100).toFixed(1)
        const barSize       = 20
        const filled        = Math.round((progresso / 100) * barSize)
        const bar           = '█'.repeat(filled) + '░'.repeat(barSize - filled)

        let statusEmoji = '⏳'
        let statusTexto = 'Em andamento'
        if (cat === 'isento') { statusEmoji = '🔓'; statusTexto = 'Isento' }
        else if (isPago)      { statusEmoji = '✅'; statusTexto = 'Paga' }
        else if (valorEntregue >= META_VALOR) { statusEmoji = '✅'; statusTexto = 'Concluída (aguardando confirmação)' }

        const embed = new EmbedBuilder()
          .setTitle(`📊 Meta — ${member.displayName}`)
          .setColor(isPago || cat === 'isento' ? COLOR_MS13 : COLOR_INFO)
          .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: '👤 Cargo',          value: cargo,                                 inline: true },
            { name: '📂 Categoria',      value: cat ?? 'Desconhecida',                 inline: true },
            { name: '📌 Status',         value: `${statusEmoji} ${statusTexto}`,        inline: true },
            { name: '💰 Valor entregue', value: `$${valorEntregue.toLocaleString('pt-BR')} / $${META_VALOR.toLocaleString('pt-BR')}`, inline: false },
            { name: '📈 Progresso',      value: `\`[${bar}] ${progresso}%\``,           inline: false },
            { name: '📦 Produtos aceitos', value: PRODUTOS_META_LISTA,                 inline: false },
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp()

        return interaction.editReply({ embeds: [embed] })
      }

      // ── Status geral ─────────────────────────────────────────────────────────
      const semanaAtual = moment().tz(BR_TZ).isoWeek()
      const anoAtual    = moment().tz(BR_TZ).year()

      const rows = db.prepare(
        'SELECT user_id, valor_entregue FROM metas WHERE semana = ? AND ano = ?'
      ).all(semanaAtual, anoAtual)

      // Busca membros MS-13 no servidor
      await guild.members.fetch()
      const ms13RoleId = '1469085564920795371'
      const ms13Members = guild.members.cache.filter(m =>
        !m.user.bot && m.roles.cache.has(ms13RoleId)
      )

      let totalMembros = 0
      let pagos        = 0
      let emAndamento  = 0
      let isentos      = 0
      let pendentes    = 0

      for (const [, member] of ms13Members) {
        totalMembros++
        const cat = categoriaMembro(member)
        if (cat === 'isento') { isentos++; continue }

        const isPago = member.roles.cache.has(ROLE_IDS.meta_paga)
        if (isPago) { pagos++; continue }

        const row = rows.find(r => r.user_id === member.id)
        if (row && row.valor_entregue > 0) emAndamento++
        else pendentes++
      }

      const pct = totalMembros > 0
        ? ((pagos / (totalMembros - isentos)) * 100).toFixed(1)
        : '0.0'

      const embed = new EmbedBuilder()
        .setTitle(`📊 Status Geral das Metas — Semana ${semanaAtual}/${anoAtual}`)
        .setColor(COLOR_MS13)
        .addFields(
          { name: '👥 Total MS-13',      value: `${totalMembros}`, inline: true },
          { name: '✅ Metas pagas',      value: `${pagos}`,         inline: true },
          { name: '⏳ Em andamento',     value: `${emAndamento}`,   inline: true },
          { name: '❌ Pendentes',        value: `${pendentes}`,     inline: true },
          { name: '🔓 Isentos',         value: `${isentos}`,       inline: true },
          { name: '📈 Taxa conclusão',   value: `${pct}%`,          inline: true },
          { name: '💰 Valor da meta',    value: `$${META_VALOR.toLocaleString('pt-BR')}`, inline: false },
          { name: '📦 Produtos aceitos', value: PRODUTOS_META_LISTA, inline: false },
        )
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp()

      await interaction.editReply({ embeds: [embed] })
    } catch (err) {
      console.error('[/meta-status]', err)
      if (!interaction.replied && !interaction.deferred)
        return interaction.reply({ content: '❌ Erro ao buscar status das metas.', ephemeral: true })
      await interaction.editReply({ content: `❌ Erro: \`${err.message}\`` })
    }
  },
}
