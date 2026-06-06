// src/systems/recrutamento.js
'use strict'

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  StringSelectMenuBuilder, UserSelectMenuBuilder,
  PermissionFlagsBits, ChannelType,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
  MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags,
} = require('discord.js')

const {
  ROLES, ROLE_IDS, MS13_ROLE_ID, CHANNEL_IDS,
  COLOR_MS13, COLOR_SUCCESS, COLOR_ERROR, COLOR_REC,
  FOOTER_TEXT, REC_CHANNEL_IDS, _PERM_TICKET_ROLE_ID,
} = require('../config/settings.js')

const {
  getDb, agora,
  atualizarRanking,
  buildPayloadRankingRecrutadores,
  buildPayloadRankingRecrutadoresVazio,
} = require('./rankingEngine.js')

// ─────────────────────────────────────────────────────────────────────────────
// Constantes visuais
// ─────────────────────────────────────────────────────────────────────────────
const BANNER_REC = 'https://cdn.discordapp.com/attachments/1489797401039474808/1512449213932503130/banner_rec.png?ex=6a242198&is=6a22d018&hm=cc997879c7a773d6dc2aa147c5b01c9f6bd0a9e68d59b7772f068733f6cb4e2b&'
const BANNER_RELATORIO = 'https://cdn.discordapp.com/attachments/1489797401039474808/1512449211675705455/banner_relatorio_de_rec.png?ex=6a242198&is=6a22d018&hm=7c6ac939810e4aac185f4563d05e4573ae325d39dca7749317446a6d662f5889&'
const BANNER_BLACKLIST  = 'https://cdn.discordapp.com/attachments/1489797401039474808/1512449213261156402/Banner_blacklist.png?ex=6a242198&is=6a22d018&hm=01e46996d5da34d6764892d4aa185d2e3e23711bf657b74f52044f12bb3eb120&'
const BANNER_FORMULARIO = 'https://cdn.discordapp.com/attachments/1489797401039474808/1512454181313839257/Banner_Painel_formulario.png?ex=6a242638&is=6a22d4b8&hm=b6f6c22387111be74771f0cbb0bf9de465e728eddfe27476ac86f65c26f84c9f&'

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de permissão
// ─────────────────────────────────────────────────────────────────────────────
function isStaff(member)      { return ROLES.isento.some(id => member.roles.cache.has(id)) }
function isRecrutador(member) { return member.roles.cache.has(ROLE_IDS.recrutador) || isStaff(member) }

// ─────────────────────────────────────────────────────────────────────────────
// Mapa temporário para blacklist (user select → confirmar)
// ─────────────────────────────────────────────────────────────────────────────
const _blPendente = new Map() // staffId → userId a adicionar

// ─────────────────────────────────────────────────────────────────────────────
// DB helpers
// ─────────────────────────────────────────────────────────────────────────────
function getTicketAberto(candidatoId) {
  return getDb()
    .prepare("SELECT * FROM recrutamentos WHERE candidato_id=? AND status='aberto' LIMIT 1")
    .get(candidatoId)
}

function jaFoiAprovado(candidatoId) {
  return !!getDb()
    .prepare("SELECT id FROM recrutamentos WHERE candidato_id=? AND status='aprovado' LIMIT 1")
    .get(candidatoId)
}

// ─────────────────────────────────────────────────────────────────────────────
// Painel principal do canal de recrutadores
// ─────────────────────────────────────────────────────────────────────────────
function buildPainelRecrutamento() {
  const container = new ContainerBuilder()
    .setAccentColor(COLOR_MS13)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(BANNER_REC)
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '# 🔫 RECRUTAMENTO — MS-13\n' +
        '> Sistema oficial de seleção de novos membros da facção.\n' +
        '> Use os painéis abaixo para gerenciar candidatos e acompanhar o ranking.'
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '## 📋 Como funciona\n\n' +
        '> **1.** Um ticket é aberto quando um candidato entra no processo.\n' +
        '> **2.** Um recrutador assume e conduz a entrevista.\n' +
        '> **3.** Após a entrevista, use **Aprovar** ou **Reprovar**.\n' +
        '> **4.** Aprovações são contabilizadas no ranking em tempo real.'
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# © MS-13 Roleplay • Recrutamento`)
    )

  return { components: [container], flags: MessageFlags.IsComponentsV2 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mensagem inicial do ticket de recrutamento
// ─────────────────────────────────────────────────────────────────────────────
function buildTicketAberturaContainer(candidatoId, abertoEm) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rec_fechar').setLabel('🔒 Fechar').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('rec_assumir').setLabel('✋ Assumir').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('rec_renomear').setLabel('✏️ Renomear').setStyle(ButtonStyle.Secondary),
  )
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rec_enviar_form').setLabel('📋 Formulário').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('rec_cancel_timer').setLabel('⏹ Cancelar Timer').setStyle(ButtonStyle.Secondary),
  )
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rec_aprovar_m').setLabel('✅ Aprovar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('rec_reprovar_m').setLabel('❌ Reprovar').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('rec_blacklist').setLabel('🚫 Blacklist').setStyle(ButtonStyle.Danger),
  )

  const container = new ContainerBuilder()
    .setAccentColor(COLOR_REC)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(BANNER_REC)
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '# 🎫 TICKET DE RECRUTAMENTO\n\n' +
        `> **Candidato:** <@${candidatoId}>\n` +
        `> **Responsável:** Aguardando recrutador\n` +
        `> **Aberto em:** ${abertoEm}\n` +
        '> **Status:** 🟡 Aguardando atendimento'
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '## ⚙️ Ações\n' +
        '> Use os botões para gerenciar este ticket.\n' +
        '> ⚠️ A aprovação credita automaticamente no ranking.'
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(row1)
    .addActionRowComponents(row2)
    .addActionRowComponents(row3)
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# © MS-13 Roleplay • Ticket de Recrutamento`)
    )

  return { components: [container], flags: MessageFlags.IsComponentsV2 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Painel de formulário
// ─────────────────────────────────────────────────────────────────────────────
function buildPainelFormularioContainer() {
  const perguntas = getDb().prepare('SELECT * FROM perguntas ORDER BY ordem ASC').all()

  const listaTexto = perguntas.length === 0
    ? '> *Nenhuma pergunta cadastrada ainda.*'
    : perguntas.map((p, i) =>
        `> **${i + 1}.** [ID: \`${p.id}\`] ${p.texto}\n` +
        `> ↳ Obrigatória: ${p.obrigatoria ? '✅' : '❌'} | Máx: ${p.max_chars} chars`
      ).join('\n\n')

  const container = new ContainerBuilder()
    .setAccentColor(COLOR_REC)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(BANNER_FORMULARIO))
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '# 📋 PAINEL DE FORMULÁRIO\n' +
        '> Gerencie as perguntas utilizadas nas entrevistas de recrutamento.'
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 📝 Perguntas Cadastradas (${perguntas.length})\n\n` + listaTexto
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rec_add_q').setLabel('➕ Adicionar').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('rec_edit_q').setLabel('✏️ Editar').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('rec_rem_q').setLabel('🗑 Remover').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('rec_timer_q').setLabel('⏱ Timer').setStyle(ButtonStyle.Secondary),
      )
    )
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rec_view_q').setLabel('👁 Ver').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('rec_refresh_q').setLabel('🔄 Atualizar').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('rec_export_q').setLabel('📤 Exportar').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('rec_import_q').setLabel('📥 Importar').setStyle(ButtonStyle.Primary),
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('-# PAINEL_FORM — ' + FOOTER_TEXT)
    )

  return { components: [container], flags: MessageFlags.IsComponentsV2 }
}

function buildPainelFormulario() { return buildPainelFormularioContainer() }

function buildPainelRelatorio() {
  const container = new ContainerBuilder()
    .setAccentColor(COLOR_REC)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(BANNER_RELATORIO))
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '# 📊 RELATÓRIO DE RECRUTAMENTO\n' +
        '> Gere o relatório de aprovações do seu usuário.'
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rec_gerar_rel_v14').setLabel('📊 Gerar Relatório').setStyle(ButtonStyle.Primary)
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# © MS-13 Roleplay • Relatórios`)
    )
  return { components: [container], flags: MessageFlags.IsComponentsV2 }
}

function buildPainelBlacklist() {
  const container = new ContainerBuilder()
    .setAccentColor(COLOR_ERROR)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(BANNER_BLACKLIST))
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '# 🚫 BLACKLIST — RECRUTAMENTO\n' +
        '> Usuários impedidos de participar do processo seletivo.'
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('rec_blacklist_v14').setLabel('👁 Ver Blacklist').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('rec_bl_adicionar').setLabel('➕ Adicionar').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('rec_bl_remover').setLabel('🗑️ Remover').setStyle(ButtonStyle.Secondary),
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# © MS-13 Roleplay • Blacklist`)
    )
  return { components: [container], flags: MessageFlags.IsComponentsV2 }
}

// ─────────────────────────────────────────────────────────────────────────────
// Embed de estatísticas gerais — fica fixo no canal, atualiza a cada aprovação
// ─────────────────────────────────────────────────────────────────────────────
function buildEstatisticasGerais() {
  const db = getDb()

  // Totais gerais (sem duplicação por candidato — conta o status final de cada um)
  const totalAprov = db.prepare(
    "SELECT COUNT(DISTINCT candidato_id) AS c FROM recrutamentos WHERE status='aprovado'"
  ).get()?.c ?? 0

  const totalRepr = db.prepare(
    "SELECT COUNT(DISTINCT candidato_id) AS c FROM recrutamentos WHERE status='reprovado'"
  ).get()?.c ?? 0

  const totalGeral = totalAprov + totalRepr

  // Top 3 recrutadores para dar um gostinho no embed geral
  const top3 = db.prepare(
    "SELECT recrutador_id, COUNT(DISTINCT candidato_id) AS total FROM recrutamentos WHERE status='aprovado' GROUP BY recrutador_id ORDER BY total DESC LIMIT 3"
  ).all()

  const top3Texto = top3.length === 0
    ? '> *Nenhum recrutador com aprovações ainda.*'
    : top3.map((r, i) => {
        const medal = ['🥇', '🥈', '🥉'][i] ?? '🏅'
        return `> ${medal} <@${r.recrutador_id}> — \`${r.total}\` aprovação${r.total !== 1 ? 'ões' : ''}`
      }).join('\n')

  const container = new ContainerBuilder()
    .setAccentColor(COLOR_REC)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '# 📊 ESTATÍSTICAS DE RECRUTAMENTO — MS-13'
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 📈 Totais Gerais\n\n` +
        `> ✅ **Aprovados:** \`${totalAprov}\`\n` +
        `> ❌ **Reprovados:** \`${totalRepr}\`\n` +
        `> 👥 **Total processado:** \`${totalGeral}\``
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 🏆 Top Recrutadores\n\n` + top3Texto
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# 🔄 Atualizado automaticamente • STATS_GERAIS • ${FOOTER_TEXT}`
      )
    )

  return { components: [container], flags: MessageFlags.IsComponentsV2 }
}

async function atualizarEstatisticasGerais(guild) {
  const ch = guild.channels.cache.get(REC_CHANNEL_IDS.relatorio_rec)
  if (!ch) return
  try {
    const msgs     = await ch.messages.fetch({ limit: 50 })
    const existing = msgs.find(m =>
      m.author.id === guild.client.user.id &&
      JSON.stringify(m.components).includes('STATS_GERAIS')
    )
    const payload = buildEstatisticasGerais()
    if (existing) await existing.edit(payload).catch(() => null)
    else await ch.send(payload).catch(() => null)
  } catch { /* silencia erros de canal */ }
}

// compat
function buildTopRecrutadores(guild) {
  return Promise.resolve(buildPayloadRankingRecrutadores(guild))
}
function buildTopRecrutadoresVazio() {
  return Promise.resolve(buildPayloadRankingRecrutadoresVazio())
}
function buildRecContent(userMention, responsavel) {
  return `## 🎫 Ticket de Recrutamento\n> **Candidato:** ${userMention}\n> **Responsável:** ${responsavel || 'Aguardando'}\n> **Aberto em:** ${agora()}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Atualiza painel do formulário no canal
// ─────────────────────────────────────────────────────────────────────────────
async function _atualizarPainelFormulario(guild, clientId) {
  const ch = guild.channels.cache.get(REC_CHANNEL_IDS.painel_formulario)
  if (!ch) return
  const msgs = await ch.messages.fetch({ limit: 20 })
  const msg  = msgs.find(m => m.author.id === clientId && JSON.stringify(m.components).includes('PAINEL_FORM'))
  if (msg) await msg.edit(buildPainelFormularioContainer()).catch(() => null)
}

// ─────────────────────────────────────────────────────────────────────────────
// Entrevista sequencial
// ─────────────────────────────────────────────────────────────────────────────
async function _conduzirEntrevista(channel, candidatoId) {
  const db        = getDb()
  const perguntas = db.prepare('SELECT * FROM perguntas ORDER BY ordem ASC').all()
  if (perguntas.length === 0) {
    await channel.send({ content: '⚠️ Nenhuma pergunta cadastrada no formulário.' })
    return null
  }

  const respostas    = []
  const msgIdsApagar = [] // todas as msgs de pergunta/resposta/aviso para apagar ao fim
  let   nome_ic_auto = null
  let   id_mta_auto  = null

  for (let idx = 0; idx < perguntas.length; idx++) {
    const p = perguntas[idx]

    const qMsg = await channel.send({
      content: (
        `## ❓ Pergunta ${idx + 1}/${perguntas.length}\n\n` +
        `> ${p.texto}\n\n` +
        `> ${p.obrigatoria ? '✅ Obrigatória' : '❌ Opcional'} | Máx: ${p.max_chars} chars\n` +
        `-# ⏳ Você tem **5 minutos** para responder.`
      ),
    })
    msgIdsApagar.push(qMsg.id)

    let respostaValida = false
    while (!respostaValida) {
      let coletadas
      try {
        coletadas = await channel.awaitMessages({
          filter: m => m.author.id === candidatoId,
          max: 1, time: 300_000, errors: ['time'],
        })
      } catch {
        // ✅ Tempo esgotado → reprova imediatamente e fecha o canal
        await channel.send({
          content: (
            `# ⏰ Tempo Esgotado\n` +
            `Você não respondeu dentro do prazo de **5 minutos**.\n\n` +
            `> ❌ Candidato **reprovado automaticamente** por inatividade.\n\n` +
            `-# ⏳ Ticket fechado em 5 segundos • Omertà — O silêncio é lei.`
          ),
        })
        db.prepare("UPDATE recrutamentos SET status='reprovado', fechado_em=datetime('now','localtime') WHERE candidato_id=? AND status='aberto'")
          .run(candidatoId)
        await new Promise(r => setTimeout(r, 5_000))
        await channel.delete().catch(() => null)
        return null
      }

      const msgResposta = coletadas.first()
      const r = msgResposta.content.trim()
      msgIdsApagar.push(msgResposta.id)

      if (p.obrigatoria && !r) {
        const av = await channel.send({ content: '⚠️ Esta pergunta é **obrigatória**. Responda para continuar.' })
        msgIdsApagar.push(av.id)
        continue
      }
      if (r.length > p.max_chars) {
        const av = await channel.send({ content: `⚠️ Muito longo! Máximo **${p.max_chars}** chars. Sua resposta tem **${r.length}**. Tente novamente.` })
        msgIdsApagar.push(av.id)
        continue
      }

      respostaValida = true

      // Pergunta 1 = nome IC + ID MTA juntos (ex: "João Silva / 1234" ou "João Silva 1234")
      // Tenta separar pelo padrão: texto / número  OU  texto - número  OU  só o número no fim
      if (idx === 0) {
        const match = r.match(/^(.+?)[\s\/\-|]+(\d+)\s*$/)
        if (match) {
          nome_ic_auto = match[1].trim()
          id_mta_auto  = match[2].trim()
        } else {
          // Sem número identificável — salva tudo como nome e deixa ID em branco
          nome_ic_auto = r
          id_mta_auto  = ''
        }
      }

      respostas.push({ pergunta: p.texto, resposta: r || '(sem resposta)' })

      // Confirmação rápida (some em 3s)
      const conf = await channel.send({ content: `> ✅ Resposta **${idx + 1}/${perguntas.length}** registrada!` })
      msgIdsApagar.push(conf.id)
      setTimeout(() => conf.delete().catch(() => null), 3_000)
    }
  }

  // ✅ Apaga todas as msgs de pergunta/resposta — deixa só o resumão
  await channel.bulkDelete(msgIdsApagar, true).catch(async () => {
    for (const msgId of msgIdsApagar) {
      await channel.messages.fetch(msgId).then(m => m.delete()).catch(() => null)
    }
  })

  // Salva nome IC e ID MTA para pré-preencher o modal de aprovação
  // Sempre salva — mesmo que venha vazio, assim o modal abre sem travar
  db.prepare('INSERT OR REPLACE INTO respostas_entrevista (canal_id, nome_ic, id_mta) VALUES (?, ?, ?)')
    .run(channel.id, nome_ic_auto ?? '', id_mta_auto ?? '')

  return respostas
}

// ─────────────────────────────────────────────────────────────────────────────
// Aprovar membro — atualiza ranking ao final
// ─────────────────────────────────────────────────────────────────────────────
async function _aprovarMembro(interaction, nomeIC, idMTA) {
  const guild       = interaction.guild
  const candidatoId = interaction.channel.topic?.match(/\d{17,19}/)?.[0]

  if (!candidatoId) return interaction.editReply({ content: '❌ Candidato não identificado no tópico do canal.' })

  // ✅ Bloqueio anti-duplicação
  if (jaFoiAprovado(candidatoId)) {
    return interaction.editReply({
      content: `⚠️ <@${candidatoId}> **já foi aprovado anteriormente.** Ação bloqueada para evitar duplicação no ranking.`,
    })
  }

  const member = await guild.members.fetch(candidatoId).catch(() => null)
  if (!member) return interaction.editReply({ content: '❌ Candidato não encontrado no servidor.' })

  const novoNick = `Ⓜ・ ${nomeIC} ${idMTA}`
  const erros = []

  await member.setNickname(novoNick).catch(e => erros.push(`nick: ${e.message}`))

  const rolesAdicionar = [ROLE_IDS.etapa2, ROLE_IDS.membro, MS13_ROLE_ID].filter(Boolean)
  await member.roles.add(rolesAdicionar).catch(e => erros.push(`cargo: ${e.message}`))

  const db = getDb()
  const res = db.prepare(`
    UPDATE recrutamentos
    SET status='aprovado', recrutador_id=?, fechado_em=datetime('now','localtime')
    WHERE candidato_id=? AND status='aberto'
  `).run(interaction.user.id, candidatoId)

  // Edge case: ticket aberto fora do sistema normal
  if (res.changes === 0) {
    db.prepare(`
      INSERT INTO recrutamentos (candidato_id, recrutador_id, ticket_id, status, fechado_em)
      VALUES (?, ?, ?, 'aprovado', datetime('now','localtime'))
    `).run(candidatoId, interaction.user.id, interaction.channel.id)
  }

  // Log
  const logCh = guild.channels.cache.get(CHANNEL_IDS.logs_recrutamento)
  if (logCh) {
    const logBox = new ContainerBuilder()
      .setAccentColor(COLOR_SUCCESS)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '## ✅ NOVO MEMBRO APROVADO\n\n' +
          `> **Candidato:** <@${candidatoId}>\n` +
          `> **Aprovado por:** <@${interaction.user.id}>\n` +
          `> **Nick:** \`${novoNick}\`\n` +
          `> **Data:** ${agora()}`
        )
      )
    await logCh.send({ components: [logBox], flags: MessageFlags.IsComponentsV2 }).catch(() => null)
  }

  // Resposta no ticket
  const aprovBox = new ContainerBuilder()
    .setAccentColor(COLOR_SUCCESS)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '## ✅ MEMBRO APROVADO!\n\n' +
        `> ${member} foi aprovado como **Morador** da MS-13.\n` +
        `> **Nick:** \`${novoNick}\`\n` +
        '> Bem-vindo à família! 🔫'
      )
    )
  // Adiciona erros de hierarquia ao embed se houver
  if (erros.length > 0) {
    const temHierarquia = erros.some(e => e.includes('50013') || e.includes('Missing Permissions'))
    await interaction.followUp({
      content: temHierarquia
        ? '⚠️ Nick/Cargo não aplicado — bot sem hierarquia suficiente. Suba o cargo do bot acima dos membros.'
        : `⚠️ Erros: ${erros.join(', ')}`,
      ephemeral: true,
    }).catch(() => null)
  }

  await interaction.editReply({ components: [aprovBox], flags: MessageFlags.IsComponentsV2 })

  // DM ao candidato — igual ao Python AprovarMembroModal
  member.send({
    embeds: [{
      title: '✅ Aprovado — 1ª Fase | MS-13',
      description: `Parabéns, **${nomeIC}**! Você foi aprovado na 1ª fase!\n\n🏷️ Nick: \`${novoNick}\`\n🎖️ Cargo: **♱ 2ª Etapa**\n\nVá para o canal de voz **AGUARDANDO**. 🔵`,
      color: 0x2ECC71,
    }],
  }).catch(() => null) // ignora se DM fechada

  // ✅ ATUALIZA RANKING EM TEMPO REAL
  await atualizarRanking('recrutadores', guild)
  // ✅ ATUALIZA ESTATÍSTICAS GERAIS
  await atualizarEstatisticasGerais(guild)
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler principal (interactions)
// ─────────────────────────────────────────────────────────────────────────────
async function execute(interaction) {
  const id = interaction.customId

  // ── Fechar ────────────────────────────────────────────────────────────────
  if (id === 'rec_fechar') {
    if (!isStaff(interaction.member))
      return interaction.reply({ content: '❌ Apenas staff pode fechar tickets.', ephemeral: true })
    return interaction.showModal(
      new ModalBuilder().setCustomId('modal_rec_fechar').setTitle('Fechar Ticket').addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('motivo_fechar').setLabel('Motivo do fechamento').setStyle(TextInputStyle.Paragraph).setRequired(true)
        )
      )
    )
  }

  if (id === 'modal_rec_fechar') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply()
    const motivo      = interaction.fields.getTextInputValue('motivo_fechar')
    const candidatoId = interaction.channel.topic?.match(/\d{17,19}/)?.[0]
    if (candidatoId) {
      getDb().prepare("UPDATE recrutamentos SET status='fechado', fechado_em=datetime('now','localtime') WHERE candidato_id=? AND status='aberto'").run(candidatoId)
    }
    const box = new ContainerBuilder()
      .setAccentColor(COLOR_ERROR)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## 🔒 TICKET FECHADO\n\n> **Por:** <@${interaction.user.id}>\n> **Motivo:** ${motivo}\n> **Data:** ${agora()}`
        )
      )
    await interaction.editReply({ components: [box], flags: MessageFlags.IsComponentsV2 })
    setTimeout(() => interaction.channel.delete().catch(() => null), 5_000)
    return
  }

  // ── Assumir ───────────────────────────────────────────────────────────────
  if (id === 'rec_assumir') {
    if (!isRecrutador(interaction.member))
      return interaction.reply({ content: '❌ Apenas recrutadores podem assumir tickets.', ephemeral: true })
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply()
    const candidatoId = interaction.channel.topic?.match(/\d{17,19}/)?.[0]
    if (candidatoId) {
      getDb().prepare("UPDATE recrutamentos SET recrutador_id=? WHERE candidato_id=? AND status='aberto'").run(interaction.user.id, candidatoId)
    }
    const box = new ContainerBuilder()
      .setAccentColor(COLOR_SUCCESS)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`> ✅ <@${interaction.user.id}> assumiu este ticket.`)
      )
    return interaction.editReply({ components: [box], flags: MessageFlags.IsComponentsV2 })
  }

  // ── Renomear ──────────────────────────────────────────────────────────────
  if (id === 'rec_renomear') {
    if (!isRecrutador(interaction.member))
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    return interaction.showModal(
      new ModalBuilder().setCustomId('modal_rec_renomear').setTitle('Renomear Canal').addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('novo_nome').setLabel('Novo nome do canal').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(90)
        )
      )
    )
  }

  if (id === 'modal_rec_renomear') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    const nome = interaction.fields.getTextInputValue('novo_nome').toLowerCase().replace(/\s+/g, '-')
    await interaction.channel.setName(nome).catch(() => null)
    return interaction.editReply({ content: `✅ Canal renomeado para **${nome}**.` })
  }

  // ── Formulário (entrevista) ───────────────────────────────────────────────
  if (id === 'rec_enviar_form') {
    if (!isRecrutador(interaction.member))
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    const candidatoId = interaction.channel.topic?.match(/\d{17,19}/)?.[0]
    if (!candidatoId) return interaction.editReply({ content: '❌ Candidato não identificado.' })
    await interaction.editReply({ content: '📋 Formulário iniciado — acompanhe o canal.' })
    const respostas = await _conduzirEntrevista(interaction.channel, candidatoId)
    if (!respostas) return
    const listaRespostas = respostas
      .map((r, i) => `**${i + 1}. ${r.pergunta}**\n> ${r.resposta}`)
      .join('\n\n')

    // ── Embed Components V2 com resumo do formulário ──────────────────────────
    const formBox = new ContainerBuilder()
      .setAccentColor(COLOR_REC)
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder().setURL(BANNER_REC)
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '# 📋 FORMULÁRIO CONCLUÍDO\n' +
          '> Todas as respostas foram registradas com sucesso.\n' +
          '> A liderança irá analisar e retornar em breve.'
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## 👤 Candidato\n` +
          `> <@${candidatoId}>\n` +
          `> 📅 **Data:** ${agora()}`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## 📝 Respostas\n\n${listaRespostas}`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `-# ✅ Formulário enviado • Não saia do ticket, aguarde o resultado.\n` +
          `-# © MS-13 Roleplay • Recrutamento`
        )
      )

    await interaction.channel.send({
      components: [formBox],
      flags: MessageFlags.IsComponentsV2,
    })
    return
  }

  if (id === 'rec_cancel_timer') {
    return interaction.reply({ content: '⏹ Timer cancelado.', ephemeral: true })
  }

  // ── Aprovar ───────────────────────────────────────────────────────────────
  if (id === 'rec_aprovar_m') {
    if (!isRecrutador(interaction.member))
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })

    // Pré-preenche com nome IC e ID MTA capturados automaticamente do formulário
    const salvo = getDb()
      .prepare('SELECT nome_ic, id_mta FROM respostas_entrevista WHERE canal_id=? LIMIT 1')
      .get(interaction.channel.id)

    return interaction.showModal(
      new ModalBuilder()
        .setCustomId('modal_rec_aprovar')
        .setTitle('✅ Aprovar Membro — 1ª Fase')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('nome_ic')
              .setLabel('Nome IC do personagem')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(salvo?.nome_ic ?? '')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('id_mta')
              .setLabel('ID MTA do personagem')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
              .setValue(salvo?.id_mta ?? '')
          )
        )
    )
  }

  if (id === 'modal_rec_aprovar') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply()
    return _aprovarMembro(
      interaction,
      interaction.fields.getTextInputValue('nome_ic').trim(),
      interaction.fields.getTextInputValue('id_mta').trim()
    )
  }

  // ── Reprovar ──────────────────────────────────────────────────────────────
  if (id === 'rec_reprovar_m') {
    if (!isRecrutador(interaction.member))
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply()
    const candidatoId = interaction.channel.topic?.match(/\d{17,19}/)?.[0]
    if (candidatoId) {
      getDb().prepare("UPDATE recrutamentos SET status='reprovado', fechado_em=datetime('now','localtime') WHERE candidato_id=? AND status='aberto'").run(candidatoId)
    }
    const box = new ContainerBuilder()
      .setAccentColor(COLOR_ERROR)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ❌ CANDIDATO REPROVADO\n\n> **Candidato:** <@${candidatoId}>\n> **Por:** <@${interaction.user.id}>\n> **Data:** ${agora()}`
        )
      )
    await interaction.editReply({ components: [box], flags: MessageFlags.IsComponentsV2 })
    setTimeout(() => interaction.channel.delete().catch(() => null), 8_000)
    return
  }

  // ── Blacklist ─────────────────────────────────────────────────────────────
  if (id === 'rec_blacklist') {
    if (!isStaff(interaction.member))
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    return interaction.showModal(
      new ModalBuilder().setCustomId('modal_rec_blacklist').setTitle('Adicionar à Blacklist').addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('motivo_bl').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(true)
        )
      )
    )
  }

  if (id === 'modal_rec_blacklist') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    const motivo      = interaction.fields.getTextInputValue('motivo_bl')
    const candidatoId = interaction.channel.topic?.match(/\d{17,19}/)?.[0]
    if (!candidatoId) return interaction.editReply({ content: '❌ Candidato não identificado.' })
    getDb().prepare('INSERT OR REPLACE INTO blacklist (user_id, motivo, adicionado_por) VALUES (?, ?, ?)').run(candidatoId, motivo, interaction.user.id)
    // Log permanente no canal de logs de blacklist
    const blLogCh = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.logs_blacklist)
    if (blLogCh) {
      const logBox = new ContainerBuilder()
        .setAccentColor(COLOR_ERROR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ⛔ Adicionado à Blacklist\n\n` +
            `> 👤 **Usuário:** <@${candidatoId}>\n` +
            `> ⚙️ **Por:** <@${interaction.user.id}>\n` +
            `> 📝 **Motivo:** ${motivo}\n` +
            `> 📅 **Data:** ${agora()}`
          )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# ⛔ Blacklist MS-13 • ${FOOTER_TEXT}`)
        )
      await blLogCh.send({ components: [logBox], flags: MessageFlags.IsComponentsV2 }).catch(() => null)
    }
    await interaction.editReply({ content: `✅ <@${candidatoId}> adicionado(a) à blacklist.\n> 📝 **Motivo:** ${motivo}` })
    setTimeout(() => interaction.channel.delete().catch(() => null), 8_000)
    return
  }

  // ── Gerar ticket manualmente ──────────────────────────────────────────────
  if (id === 'rec_gerar_tkt') {
    if (!isStaff(interaction.member))
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    const { guild }     = interaction
    const candidatoId   = interaction.user.id

    // ✅ Anti-duplicação
    const existente = getTicketAberto(candidatoId)
    if (existente) {
      const canal = guild.channels.cache.get(existente.ticket_id)
      return interaction.editReply({
        content: canal
          ? `⚠️ Já existe ticket aberto: ${canal}. Feche-o antes.`
          : '⚠️ Já existe um ticket em aberto no banco. Feche-o antes.',
      })
    }
    const naBl = getDb().prepare('SELECT id FROM blacklist WHERE user_id=?').get(candidatoId)
    if (naBl) return interaction.editReply({ content: '🚫 Usuário está na blacklist.' })

    const cat    = REC_CHANNEL_IDS.categoria_rec !== '0' ? guild.channels.cache.get(REC_CHANNEL_IDS.categoria_rec) : null
    const novoCanal = await guild.channels.create({
      name:  `rec-${interaction.user.username}-${Date.now().toString().slice(-4)}`,
      type:  ChannelType.GuildText,
      parent: cat ?? undefined,
      topic: `Candidato: ${candidatoId}`,
      permissionOverwrites: [
        { id: guild.id,              deny:  [PermissionFlagsBits.ViewChannel] },
        { id: candidatoId,           allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: _PERM_TICKET_ROLE_ID,  allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ],
    })
    getDb().prepare("INSERT OR IGNORE INTO recrutamentos (candidato_id, ticket_id, status) VALUES (?, ?, 'aberto')").run(candidatoId, novoCanal.id)
    await novoCanal.send(buildTicketAberturaContainer(candidatoId, agora()))
    return interaction.editReply({ content: `✅ Ticket criado: ${novoCanal}` })
  }

  // ── Gerenciamento de perguntas ────────────────────────────────────────────
  if (id === 'rec_add_q') {
    return interaction.showModal(
      new ModalBuilder().setCustomId('modal_rec_add_q').setTitle('Adicionar Pergunta').addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('texto').setLabel('Texto da pergunta').setStyle(TextInputStyle.Paragraph).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('max_chars').setLabel('Máx. caracteres (padrão 500)').setStyle(TextInputStyle.Short).setRequired(false)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('obrigatoria').setLabel('Obrigatória? (sim/não)').setStyle(TextInputStyle.Short).setRequired(false)),
      )
    )
  }
  if (id === 'modal_rec_add_q') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    const texto       = interaction.fields.getTextInputValue('texto').trim()
    const maxChars    = parseInt(interaction.fields.getTextInputValue('max_chars')) || 500
    const obRaw       = interaction.fields.getTextInputValue('obrigatoria').trim().toLowerCase()
    const obrigatoria = (obRaw === 'não' || obRaw === 'nao' || obRaw === 'n') ? 0 : 1
    const db          = getDb()
    const ordem       = (db.prepare('SELECT MAX(ordem) AS m FROM perguntas').get()?.m ?? 0) + 1
    db.prepare('INSERT INTO perguntas (texto, obrigatoria, max_chars, ordem) VALUES (?, ?, ?, ?)').run(texto, obrigatoria, maxChars, ordem)
    await interaction.editReply({ content: '✅ Pergunta adicionada!' })
    await _atualizarPainelFormulario(interaction.guild, interaction.client.user.id)
    return
  }

  if (id === 'rec_edit_q') {
    return interaction.showModal(
      new ModalBuilder().setCustomId('modal_rec_edit_q').setTitle('Editar Pergunta').addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('id_p').setLabel('ID da pergunta').setStyle(TextInputStyle.Short).setRequired(true)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('novo_texto').setLabel('Novo texto').setStyle(TextInputStyle.Paragraph).setRequired(true)),
      )
    )
  }
  if (id === 'modal_rec_edit_q') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    const r = getDb().prepare('UPDATE perguntas SET texto=? WHERE id=?').run(
      interaction.fields.getTextInputValue('novo_texto').trim(),
      parseInt(interaction.fields.getTextInputValue('id_p'))
    )
    if (r.changes === 0) return interaction.editReply({ content: '❌ Pergunta não encontrada. Verifique o ID.' })
    await interaction.editReply({ content: '✅ Pergunta editada!' })
    await _atualizarPainelFormulario(interaction.guild, interaction.client.user.id)
    return
  }

  if (id === 'rec_rem_q') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    const perguntas = getDb().prepare('SELECT id, texto FROM perguntas ORDER BY ordem ASC').all()
    if (perguntas.length === 0) return interaction.editReply({ content: '❌ Nenhuma pergunta cadastrada.' })
    return interaction.editReply({
      content: 'Selecione a pergunta a remover:',
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('rec_select_rem_q')
            .setPlaceholder('Selecione a pergunta')
            .addOptions(perguntas.slice(0, 25).map(p => ({ label: p.texto.slice(0, 100), value: String(p.id) })))
        ),
      ],
    })
  }
  if (id === 'rec_select_rem_q') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    const r = getDb().prepare('DELETE FROM perguntas WHERE id=?').run(parseInt(interaction.values[0]))
    if (r.changes > 0) {
      await interaction.editReply({ content: '✅ Pergunta removida!', components: [] })
      await _atualizarPainelFormulario(interaction.guild, interaction.client.user.id)
    } else {
      await interaction.editReply({ content: '❌ Pergunta não encontrada.', components: [] })
    }
    return
  }

  if (id === 'rec_timer_q') return interaction.reply({ content: '⚠️ Timer configurável via `/painel-formulario`.', ephemeral: true })

  if (id === 'rec_view_q') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    return interaction.editReply(buildPainelFormularioContainer())
  }
  if (id === 'rec_refresh_q') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    await _atualizarPainelFormulario(interaction.guild, interaction.client.user.id)
    return interaction.editReply({ content: '✅ Painel atualizado!' })
  }
  if (id === 'rec_export_q') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    const perguntas = getDb().prepare('SELECT * FROM perguntas ORDER BY ordem ASC').all()
    return interaction.editReply({
      content: '📤 Exportação:',
      files: [{ attachment: Buffer.from(JSON.stringify(perguntas, null, 2), 'utf8'), name: 'perguntas.json' }],
    })
  }

  if (id === 'rec_import_q') {
    return interaction.showModal(
      new ModalBuilder()
        .setCustomId('modal_rec_import_q')
        .setTitle('📥 Importar Perguntas (JSON)')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('json_perguntas')
              .setLabel('Cole o JSON das perguntas aqui')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true)
              .setPlaceholder('[{"id":1,"texto":"Pergunta?","obrigatoria":1,"max_chars":500,"ordem":1}]')
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('modo_import')
              .setLabel('Modo: substituir ou adicionar')
              .setStyle(TextInputStyle.Short)
              .setRequired(false)
              .setPlaceholder('adicionar')
          )
        )
    )
  }

  if (id === 'modal_rec_import_q') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })

    let parsed
    try {
      const raw = interaction.fields.getTextInputValue('json_perguntas').trim()
      parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) throw new Error('JSON deve ser um array')
    } catch (e) {
      return interaction.editReply({ content: `❌ JSON inválido: ${e.message}` })
    }

    const modoRaw = interaction.fields.getTextInputValue('modo_import').trim().toLowerCase()
    const substituir = modoRaw === 'substituir'

    const db = getDb()

    if (substituir) {
      db.prepare('DELETE FROM perguntas').run()
    }

    const ordemAtual = substituir
      ? 0
      : (db.prepare('SELECT MAX(ordem) AS m FROM perguntas').get()?.m ?? 0)

    const stmt = db.prepare(
      'INSERT INTO perguntas (texto, obrigatoria, max_chars, ordem) VALUES (?, ?, ?, ?)'
    )

    let importadas = 0
    let erros = 0
    for (let i = 0; i < parsed.length; i++) {
      const p = parsed[i]
      if (!p.texto) { erros++; continue }
      const obrigatoria = p.obrigatoria !== undefined ? (p.obrigatoria ? 1 : 0) : 1
      const maxChars    = Number(p.max_chars) || 500
      const ordem       = ordemAtual + i + 1
      try {
        stmt.run(p.texto.trim(), obrigatoria, maxChars, ordem)
        importadas++
      } catch {
        erros++
      }
    }

    await interaction.editReply({
      content: (
        `✅ Importação concluída!\n\n` +
        `> 📥 **Importadas:** ${importadas}\n` +
        `> ⚠️ **Ignoradas (sem texto):** ${erros}\n` +
        `> 📋 **Modo:** ${substituir ? 'Substituição total' : 'Adicionadas ao final'}\n\n` +
        `-# IDs originais do JSON são ignorados — novos IDs são gerados automaticamente pelo banco.`
      ),
    })
    await _atualizarPainelFormulario(interaction.guild, interaction.client.user.id)
    return
  }

  // ── Relatório ─────────────────────────────────────────────────────────────
  if (id === 'rec_gerar_rel_v14') {
    if (!isRecrutador(interaction.member))
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })

    // Busca recrutadores que recrutaram pelo menos 1 pessoa
    const recrutadoresComRec = getDb().prepare(
      "SELECT DISTINCT recrutador_id FROM recrutamentos WHERE recrutador_id IS NOT NULL"
    ).all().map(r => r.recrutador_id)

    if (recrutadoresComRec.length === 0) {
      return interaction.editReply({ content: '⚠️ Nenhum recrutador com recrutamentos registrados ainda.' })
    }

    // Filtra os que estão no servidor para montar as opções do select
    const opcoes = []
    for (const uid of recrutadoresComRec.slice(0, 25)) {
      const membro = interaction.guild.members.cache.get(uid)
        || await interaction.guild.members.fetch(uid).catch(() => null)
      const nome = membro ? membro.displayName : `ID: ${uid}`
      // Conta total deste recrutador
      const total = getDb().prepare(
        "SELECT COUNT(DISTINCT candidato_id) AS c FROM recrutamentos WHERE recrutador_id=?"
      ).get(uid)?.c ?? 0
      opcoes.push({
        label: nome.slice(0, 100),
        description: `${total} recrutamento${total !== 1 ? 's' : ''} registrado${total !== 1 ? 's' : ''}`,
        value: uid,
      })
    }

    const container = new ContainerBuilder()
      .setAccentColor(COLOR_REC)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          '# 📊 Gerar Relatório\n' +
          '> Selecione o recrutador que deseja consultar.'
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addActionRowComponents(
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('rec_rel_select_rec')
            .setPlaceholder('👤 Selecione o recrutador...')
            .addOptions(opcoes)
        )
      )

    return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 })
  }

  if (id === 'rec_rel_select_rec') {
    if (!isRecrutador(interaction.member))
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })

    const uid    = interaction.values[0]
    const db     = getDb()
    const membro = interaction.guild.members.cache.get(uid)
      || await interaction.guild.members.fetch(uid).catch(() => null)
    const nomeDisplay = membro ? membro.displayName : `<@${uid}>`

    // Busca todos os recrutados deste recrutador com seus status
    const recrutados = db.prepare(
      "SELECT candidato_id, status, fechado_em FROM recrutamentos WHERE recrutador_id=? ORDER BY fechado_em DESC"
    ).all(uid)

    // Sem duplicação por candidato — considera o registro mais recente
    const vistosCandidatos = new Set()
    const aprovados  = []
    const reprovados = []
    for (const r of recrutados) {
      if (vistosCandidatos.has(r.candidato_id)) continue
      vistosCandidatos.add(r.candidato_id)
      if (r.status === 'aprovado')  aprovados.push(r)
      if (r.status === 'reprovado') reprovados.push(r)
    }

    const totalAprov = aprovados.length
    const totalRepr  = reprovados.length

    const listaAprovadosTexto = aprovados.length === 0
      ? '> *Nenhum aprovado ainda.*'
      : aprovados.map((r, i) => `> **${i + 1}.** <@${r.candidato_id}>`).join('\n')

    const listaReprovadosTexto = reprovados.length === 0
      ? '> *Nenhum reprovado.*'
      : reprovados.map((r, i) => `> **${i + 1}.** <@${r.candidato_id}>`).join('\n')

    const box = new ContainerBuilder()
      .setAccentColor(COLOR_REC)
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(BANNER_RELATORIO))
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 📊 RELATÓRIO DE RECRUTAMENTO\n` +
          `> 👤 **Recrutador:** <@${uid}> — **${nomeDisplay}**\n` +
          `> 📅 **Gerado em:** ${agora()}`
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## 📈 Resumo\n\n` +
          `> ✅ **Aprovados:** \`${totalAprov}\`\n` +
          `> ❌ **Reprovados:** \`${totalRepr}\``
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ✅ Aprovados (${totalAprov})\n\n` + listaAprovadosTexto
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `## ❌ Reprovados (${totalRepr})\n\n` + listaReprovadosTexto
        )
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# 📊 Relatório de Recrutamento • ${FOOTER_TEXT}`)
      )

    const relCh = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.relatorio_rec)
    const logCh = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.logs_relatorios_rec)

    // Canal relatorio_rec — posta e apaga após 5 minutos
    if (relCh) {
      relCh.send({ components: [box], flags: MessageFlags.IsComponentsV2 })
        .then(msg => setTimeout(() => msg.delete().catch(() => null), 5 * 60 * 1000))
        .catch(() => null)
    }

    // Canal de logs — apaga embed antigo do mesmo recrutador (se existir) e manda novo no final
    if (logCh) {
      try {
        const logMsgs = await logCh.messages.fetch({ limit: 100 })
        // Identificador único por recrutador no footer: REC_LOG_${uid}
        const antiga = logMsgs.find(m =>
          m.author.id === interaction.client.user.id &&
          JSON.stringify(m.components).includes(`REC_LOG_${uid}`)
        )
        if (antiga) await antiga.delete().catch(() => null)
      } catch { /* silencia */ }

      // Rebuild do box com identificador do recrutador no footer
      const boxLog = new ContainerBuilder()
        .setAccentColor(COLOR_REC)
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(BANNER_RELATORIO))
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `# 📊 RELATÓRIO DE RECRUTAMENTO\n` +
            `> 👤 **Recrutador:** <@${uid}> — **${nomeDisplay}**\n` +
            `> 📅 **Gerado em:** ${agora()}`
          )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## 📈 Resumo\n\n` +
            `> ✅ **Aprovados:** \`${totalAprov}\`\n` +
            `> ❌ **Reprovados:** \`${totalRepr}\``
          )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ✅ Aprovados (${totalAprov})\n\n` + listaAprovadosTexto
          )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ❌ Reprovados (${totalRepr})\n\n` + listaReprovadosTexto
          )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `-# 📊 Relatório de Recrutamento • REC_LOG_${uid} • ${FOOTER_TEXT}`
          )
        )

      await logCh.send({ components: [boxLog], flags: MessageFlags.IsComponentsV2 }).catch(() => null)
    }

    return interaction.editReply({ content: '✅ Relatório gerado e enviado no canal!' })
  }

  // ── Ver blacklist ─────────────────────────────────────────────────────────
  if (id === 'rec_blacklist_v14') {
    if (!isStaff(interaction.member))
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })

    const lista = getDb().prepare('SELECT * FROM blacklist ORDER BY adicionado_em DESC').all()

    if (lista.length === 0) {
      const vazioBox = new ContainerBuilder()
        .setAccentColor(COLOR_ERROR)
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(BANNER_BLACKLIST))
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            '# 🚫 BLACKLIST — MS-13\n\n' +
            '> ✅ Nenhum usuário na blacklist no momento.\n\n' +
            `-# ${FOOTER_TEXT}`
          )
        )
      return interaction.editReply({ components: [vazioBox], flags: MessageFlags.IsComponentsV2 })
    }

    // Divide em chunks de 10 para não estourar o limite de caracteres
    const chunks = []
    for (let i = 0; i < lista.length; i += 10) chunks.push(lista.slice(i, i + 10))

    const container = new ContainerBuilder()
      .setAccentColor(COLOR_ERROR)
      .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(BANNER_BLACKLIST))
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `# 🚫 BLACKLIST — MS-13\n` +
          `Lista de usuários impedidos de participar do processo seletivo.\n\n` +
          `> 📊 **Total na blacklist:** ${lista.length} usuário(s)`
        )
      )

    for (const chunk of chunks) {
      container
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            chunk.map((e, i) => {
              const idx = lista.indexOf(e) + 1
              return (
                `**${idx}.** <@${e.user_id}>\n` +
                `> ❌ **Motivo:** ${e.motivo || 'Não informado'}\n` +
                `> 👤 **Por:** <@${e.adicionado_por}>\n` +
                `> 📅 **Em:** ${e.adicionado_em}`
              )
            }).join('\n\n')
          )
        )
    }

    container
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`-# 🚫 Blacklist MS-13 • ${FOOTER_TEXT}`)
      )

    return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 })
  }

  // ── Adicionar à blacklist — user select (sem digitar ID) ──────────────────
  if (id === 'rec_bl_adicionar') {
    if (!isStaff(interaction.member))
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })

    const { UserSelectMenuBuilder } = require('discord.js')
    return interaction.reply({
      content: (
        `# 🚫 Adicionar à Blacklist\n` +
        `Selecione o usuário que deseja adicionar à blacklist do recrutamento.\n\n` +
        `> ⚠️ Ele não poderá abrir tickets de recrutamento enquanto estiver na lista.`
      ),
      components: [
        new ActionRowBuilder().addComponents(
          new UserSelectMenuBuilder()
            .setCustomId('rec_bl_user_select')
            .setPlaceholder('👤 Selecione o usuário...')
            .setMinValues(1)
            .setMaxValues(1)
        ),
      ],
      ephemeral: true,
    })
  }

  if (id === 'rec_bl_user_select') {
    if (!isStaff(interaction.member))
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })

    const userId    = interaction.values[0]
    const membro    = await interaction.guild.members.fetch(userId).catch(() => null)
    const nome      = membro ? membro.displayName : `<@${userId}>`
    const jaEsta    = getDb().prepare('SELECT motivo FROM blacklist WHERE user_id=?').get(userId)

    if (jaEsta) {
      return interaction.update({
        content: (
          `# ⚠️ Usuário já na Blacklist\n` +
          `**${nome}** já está na blacklist.\n\n` +
          `> ❌ **Motivo atual:** ${jaEsta.motivo}`
        ),
        components: [],
      })
    }

    _blPendente.set(interaction.user.id, userId)

    return interaction.update({
      content: (
        `# 🚫 Confirmar Blacklist\n` +
        `Você está prestes a adicionar **${nome}** à blacklist.\n\n` +
        `> ❌ Ele não poderá abrir tickets de recrutamento.\n` +
        `> ⚠️ Esta ação pode ser revertida manualmente no banco de dados.\n\n` +
        `Tem certeza?`
      ),
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('rec_bl_confirmar')
            .setLabel('✅ Confirmar Blacklist')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('rec_bl_cancelar')
            .setLabel('❌ Cancelar')
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
    })
  }

  if (id === 'rec_bl_confirmar') {
    if (!isStaff(interaction.member))
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })

    const userId = _blPendente.get(interaction.user.id)
    if (!userId) return interaction.update({ content: '❌ Sessão expirada. Tente novamente.', components: [] })
    _blPendente.delete(interaction.user.id)
    const membro = await interaction.guild.members.fetch(userId).catch(() => null)
    const nome   = membro ? membro.displayName : `<@${userId}>`

    getDb().prepare('INSERT OR REPLACE INTO blacklist (user_id, motivo, adicionado_por) VALUES (?, ?, ?)')
      .run(userId, 'Adicionado via painel de blacklist', interaction.user.id)

    // Log permanente no canal de logs de blacklist
    const blLogCh = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.logs_blacklist)
    if (blLogCh) {
      const logBox = new ContainerBuilder()
        .setAccentColor(COLOR_ERROR)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ⛔ Adicionado à Blacklist\n\n` +
            `> 👤 **Usuário:** <@${userId}>\n` +
            `> ⚙️ **Adicionado por:** <@${interaction.user.id}>\n` +
            `> 📝 **Motivo:** Adicionado via painel de blacklist\n` +
            `> 📅 **Data:** ${agora()}`
          )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# ⛔ Blacklist MS-13 • ${FOOTER_TEXT}`)
        )
      await blLogCh.send({ components: [logBox], flags: MessageFlags.IsComponentsV2 }).catch(() => null)
    }

    // Resposta ephemeral (só quem clicou vê)
    return interaction.update({
      content: `✅ **${nome}** adicionado(a) à blacklist com sucesso.\n> ❌ Não poderá abrir novos tickets de recrutamento.`,
      components: [],
    })
  }

  if (id === 'rec_bl_remover') {
    if (!isStaff(interaction.member))
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })

    const lista = getDb().prepare('SELECT user_id, motivo FROM blacklist ORDER BY adicionado_em DESC').all()

    if (lista.length === 0) {
      return interaction.reply({ content: '✅ A blacklist está vazia, nada para remover.', ephemeral: true })
    }

    // Busca nome dos membros do servidor para mostrar no select
    const opcoes = []
    for (const entry of lista.slice(0, 25)) {
      const membro = interaction.guild.members.cache.get(entry.user_id)
        || await interaction.guild.members.fetch(entry.user_id).catch(() => null)
      const nome   = membro ? membro.displayName : `ID: ${entry.user_id}`
      const motivo = (entry.motivo || 'Sem motivo').slice(0, 50)
      opcoes.push({
        label:       nome.slice(0, 100),
        description: `Motivo: ${motivo}`,
        value:       entry.user_id,
      })
    }

    return interaction.reply({
      content: (
        `# 🗑️ Remover da Blacklist\n` +
        `Selecione o usuário que deseja **remover**. Apenas quem está na blacklist aparece aqui.\n\n` +
        `> ⚠️ Após a remoção ele poderá abrir tickets de recrutamento novamente.`
      ),
      components: [
        new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('rec_bl_remover_select')
            .setPlaceholder('👤 Selecione o usuário para remover...')
            .addOptions(opcoes)
        ),
      ],
      ephemeral: true,
    })
  }

  if (id === 'rec_bl_remover_select') {
    if (!isStaff(interaction.member))
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })

    const userId  = interaction.values[0]
    const naBl    = getDb().prepare('SELECT motivo FROM blacklist WHERE user_id=?').get(userId)
    const membro  = await interaction.guild.members.fetch(userId).catch(() => null)
    const nome    = membro ? membro.displayName : `<@${userId}>`

    _blPendente.set(`rm_${interaction.user.id}`, userId)

    return interaction.update({
      content: (
        `# 🗑️ Confirmar Remoção\n` +
        `Você está prestes a **remover** **${nome}** da blacklist.\n\n` +
        `> 📋 **Motivo original:** ${naBl.motivo || 'Não informado'}\n` +
        `> ✅ Ele poderá abrir tickets de recrutamento novamente.\n\n` +
        `Tem certeza?`
      ),
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('rec_bl_remover_confirmar').setLabel('✅ Confirmar Remoção').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('rec_bl_cancelar').setLabel('❌ Cancelar').setStyle(ButtonStyle.Secondary),
        ),
      ],
    })
  }

  if (id === 'rec_bl_remover_confirmar') {
    if (!isStaff(interaction.member))
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })

    const userId = _blPendente.get(`rm_${interaction.user.id}`)
    if (!userId) return interaction.update({ content: '❌ Sessão expirada. Tente novamente.', components: [] })
    _blPendente.delete(`rm_${interaction.user.id}`)

    getDb().prepare('DELETE FROM blacklist WHERE user_id=?').run(userId)

    const membro = await interaction.guild.members.fetch(userId).catch(() => null)
    const nome   = membro ? membro.displayName : `<@${userId}>`

    // Log permanente no canal de logs de blacklist
    const blLogCh = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.logs_blacklist)
    if (blLogCh) {
      const logBox = new ContainerBuilder()
        .setAccentColor(0x2ECC71)
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ✅ Removido da Blacklist\n\n` +
            `> 👤 **Usuário:** <@${userId}>\n` +
            `> ⚙️ **Removido por:** <@${interaction.user.id}>\n` +
            `> 📅 **Data:** ${agora()}`
          )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`-# ✅ Blacklist MS-13 • ${FOOTER_TEXT}`)
        )
      await blLogCh.send({ components: [logBox], flags: MessageFlags.IsComponentsV2 }).catch(() => null)
    }

    // Resposta ephemeral (só quem clicou vê)
    return interaction.update({
      content: `✅ **${nome}** removido(a) da blacklist.\n> ✅ Pode abrir tickets de recrutamento novamente.`,
      components: [],
    })
  }

  if (id === 'rec_bl_cancelar') {
    return interaction.update({ content: '❌ Ação cancelada.', components: [] })
  }

  // compat IDs legados
  if (id === 'sel_cand_v14' || id === 'sel_rec_v14' || id === 'rec_select_candidatos') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferReply({ ephemeral: true })
    const r = getDb().prepare('DELETE FROM perguntas WHERE id=?').run(parseInt(interaction.values[0]))
    if (r.changes > 0) {
      await interaction.editReply({ content: '✅ Pergunta removida!', components: [] })
      await _atualizarPainelFormulario(interaction.guild, interaction.client.user.id)
    } else {
      await interaction.editReply({ content: '❌ Não encontrada.', components: [] })
    }
    return
  }
}

// ─────────────────────────────────────────────────────────────────────────────
const customIds = [
  'rec_fechar','rec_assumir','rec_renomear','rec_enviar_form','rec_cancel_timer',
  'rec_aprovar_m','rec_reprovar_m','rec_blacklist','rec_gerar_tkt',
  'rec_add_q','rec_edit_q','rec_rem_q','rec_timer_q','rec_view_q','rec_refresh_q','rec_export_q','rec_import_q',
  'rec_select_rem_q','rec_gerar_rel_v14','rec_rel_select_rec','rec_blacklist_v14',
  'rec_bl_adicionar','rec_bl_user_select','rec_bl_confirmar','rec_bl_cancelar',
  'rec_bl_remover','rec_bl_remover_select','rec_bl_remover_confirmar',
  'sel_cand_v14','sel_rec_v14','rec_select_candidatos',
  'modal_rec_fechar','modal_rec_renomear','modal_rec_aprovar','modal_rec_blacklist',
  'modal_rec_add_q','modal_rec_edit_q','modal_rec_import_q',
]

module.exports = {
  customIds,
  execute,
  buildPainelFormulario,
  buildPainelFormularioContainer,
  buildPainelRelatorio,
  buildPainelBlacklist,
  buildPainelRecrutamento,
  buildTopRecrutadores,
  buildTopRecrutadoresVazio,
  buildTicketAberturaContainer,
  buildRecContent,
  buildEstatisticasGerais,
  atualizarEstatisticasGerais,
  atualizarRankingRecrutadores: (guild) => atualizarRanking('recrutadores', guild),
}