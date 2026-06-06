// src/systems/gerencia.js — Painel de Gerência (Components V2)
'use strict'

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
  MessageFlags,
} = require('discord.js')

const {
  COLOR_MS13, COLOR_ERROR, COLOR_WARNING, COLOR_SUCCESS,
  FOOTER_TEXT, ROLES, ROLE_IDS, ADV_CARGO_IDS,
  CHANNEL_IDS, REC_CHANNEL_IDS, MS13_ROLE_ID, CIDADAO_LOW_ID,
  LOG_PD_CHANNEL_ID,
} = require('../config/settings.js')

// ─── customIds registrados neste sistema ──────────────────────────────────────
const customIds = [
  'mgr_adv', 'mgr_exo',
  'select_advertencias_v13', 'select_exoneracao_v13',
  'cont_select_v13',
  'bl_sim_v14', 'bl_nao_v14',
  'modal_advertencia', 'modal_exoneracao',
  'ger_exo_cont_',  // prefixo dinâmico — targetId embutido no customId
]

// ─── Contexto de fluxo multi-step ─────────────────────────────────────────────
const selectContextMap = new Map()

// ─── Painel principal (Components V2) ─────────────────────────────────────────
function buildEmbedGerencia() {
  const container = new ContainerBuilder()
    .setAccentColor(COLOR_ERROR)

  // Cabeçalho
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '# 🔐 MS-13 — Painel de Gerência\n' +
      '-# Área restrita à liderança e gerência da facção'
    )
  )

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(2))

  // Seção: Advertências
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '## ⚠️ Aplicar Advertência\n' +
      '> Aplica advertência formal e acumulativa ao membro.\n' +
      '> **ADV 1** e **ADV 2** aplicam cargo temporário de advertência.\n' +
      '> **ADV 3** dispara **expulsão automática** da facção.\n' +
      '> O membro recebe notificação via **DM** após cada ação.'
    )
  )

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mgr_adv')
        .setLabel('⚠️ Advertência')
        .setStyle(ButtonStyle.Danger),
    )
  )

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(1))

  // Seção: Exoneração
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '## 🚪 Exonerar Membro\n' +
      '> Remove o membro permanentemente da facção (PD).\n' +
      '> Todos os cargos MS-13 são retirados automaticamente.\n' +
      '> Após a exoneração, você poderá adicionar o membro à **blacklist**.\n' +
      '> ⚠️ Esta ação é **permanente** — confirme com a liderança antes.'
    )
  )

  container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('mgr_exo')
        .setLabel('🚪 Exonerar Membro')
        .setStyle(ButtonStyle.Danger),
    )
  )

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(2))

  // Permissões + rodapé
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      '> 🔴 **Líder / Sub-Líder** — Advertências e Exonerações\n' +
      '> 🟠 **Resp. Recrutamentos** — Somente Advertências\n' +
      `-# ${FOOTER_TEXT}`
    )
  )

  return { components: [container], flags: MessageFlags.IsComponentsV2 }
}

// Alias para /iniciar
async function buildCentralGerenciaView(guild) {
  return buildEmbedGerencia()
}

// ─── Helpers de permissão ──────────────────────────────────────────────────────
function hasRole(member, roleIds) {
  return roleIds.some(id => member.roles.cache.has(id))
}
function canAdvertir(member) {
  return (
    member.permissions.has('Administrator') ||
    hasRole(member, [ROLE_IDS.lider, ROLE_IDS.sub_lider, ROLE_IDS.recrutador])
  )
}
function canExonerar(member) {
  return (
    member.permissions.has('Administrator') ||
    hasRole(member, [ROLE_IDS.lider, ROLE_IDS.sub_lider])
  )
}

// Retorna 0, 1, 2 ou 3 — quantas advs o membro já tem
function getAdvAtual(member) {
  if (member.roles.cache.has(ADV_CARGO_IDS[3])) return 3
  if (member.roles.cache.has(ADV_CARGO_IDS[2])) return 2
  if (member.roles.cache.has(ADV_CARGO_IDS[1])) return 1
  return 0
}

async function sendDM(user, container) {
  try { await user.send({ components: [container], flags: MessageFlags.IsComponentsV2 }) } catch {}
}

// ─── Helpers de log Components V2 minimalistas ──────────────────────────────────────────────
function logAdv(proxAdv, targetId, targetTag, executorId, motivo, prova) {
  const cor    = proxAdv >= 3 ? COLOR_ERROR : COLOR_WARNING
  const titulo = proxAdv >= 3
    ? '🚨 Expulsão Automática — 3ª Advertência'
    : `⚠️ Advertência ${proxAdv} Aplicada`

  return new ContainerBuilder()
    .setAccentColor(cor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${titulo}\n\n` +
        `> 👤 **Membro:** <@${targetId}> \`${targetTag}\`\n` +
        `> ⚙️ **Executor:** <@${executorId}>\n` +
        `> 🔢 **ADV:** ADV ${proxAdv}\n` +
        `> 📝 **Motivo:** ${motivo}\n` +
        `> 🔗 **Prova:** ${prova}`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ⚠️ Gerência MS-13 • ${FOOTER_TEXT}`)
    )
}

function logExo(targetId, targetTag, executorId, motivo, prova) {
  return new ContainerBuilder()
    .setAccentColor(COLOR_ERROR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 🚪 Membro Exonerado\n\n` +
        `> 👤 **Membro:** <@${targetId}> \`${targetTag}\`\n` +
        `> ⚙️ **Executor:** <@${executorId}>\n` +
        `> 📝 **Motivo:** ${motivo}\n` +
        `> 🔗 **Prova:** ${prova}`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# 🚪 Exoneração MS-13 • ${FOOTER_TEXT}`)
    )
}

function logBlacklist(targetId, targetTag, executorId, motivo, prova) {
  return new ContainerBuilder()
    .setAccentColor(0x2C2F33)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ⛔ Adicionado à Blacklist\n\n` +
        `> 👤 **Membro:** <@${targetId}> \`${targetTag}\`\n` +
        `> ⚙️ **Executor:** <@${executorId}>\n` +
        `> 📝 **Motivo:** ${motivo}\n` +
        `> 🔗 **Prova:** ${prova}`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# ⛔ Blacklist MS-13 • ${FOOTER_TEXT}`)
    )
}

function dmAdv(proxAdv, motivo) {
  const titulo = proxAdv >= 3
    ? '🚨 Você foi expulso(a) da MS-13'
    : `⚠️ Você recebeu ADV ${proxAdv} — MS-13`
  const desc = proxAdv >= 3
    ? `Você acumulou **3 advertências** e foi **expulso(a) automaticamente** da facção.\n\n**Motivo:** ${motivo}`
    : `Você recebeu a **${proxAdv}ª advertência** na MS-13.\n\n**Motivo:** ${motivo}` +
      (proxAdv === 2 ? '\n\n> ‼️ Na próxima advertência você será **expulso(a) automaticamente**.' : '')

  return new ContainerBuilder()
    .setAccentColor(proxAdv >= 3 ? COLOR_ERROR : COLOR_WARNING)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`## ${titulo}\n\n${desc}`)
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# MS-13 Roleplay • Notificação Oficial`)
    )
}

function dmExo(motivo) {
  return new ContainerBuilder()
    .setAccentColor(COLOR_ERROR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## 🚪 Você foi exonerado(a) da MS-13\n\n` +
        `Você foi **exonerado(a)** da facção.\n\n` +
        `**Motivo:** ${motivo}`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# MS-13 Roleplay • Notificação Oficial`)
    )
}

// ─── Handler central ──────────────────────────────────────────────────────────
async function execute(interaction) {
  const { customId, guild, member } = interaction

  // ── Botão: Advertência ────────────────────────────────────────────────────
  if (customId === 'mgr_adv') {
    if (!canAdvertir(member))
      return interaction.reply({ content: '❌ Sem permissão para aplicar advertências.', ephemeral: true })

    return interaction.reply({
      content:
        '# ⚠️ Aplicar Advertência\n' +
        '> Selecione o membro que receberá a advertência.',
      components: [
        new ActionRowBuilder().addComponents(
          new UserSelectMenuBuilder()
            .setCustomId('select_advertencias_v13')
            .setPlaceholder('Selecione o membro...')
            .setMinValues(1)
            .setMaxValues(1)
        ),
      ],
      ephemeral: true,
    })
  }

  // ── Botão: Exoneração ─────────────────────────────────────────────────────
  if (customId === 'mgr_exo') {
    if (!canExonerar(member))
      return interaction.reply({ content: '❌ Apenas Líder ou Sub-Líder podem exonerar membros.', ephemeral: true })

    return interaction.reply({
      content:
        '# 🚪 Exonerar Membro\n' +
        '> Selecione o membro a ser exonerado.',
      components: [
        new ActionRowBuilder().addComponents(
          new UserSelectMenuBuilder()
            .setCustomId('select_exoneracao_v13')
            .setPlaceholder('Selecione o membro...')
            .setMinValues(1)
            .setMaxValues(1)
        ),
      ],
      ephemeral: true,
    })
  }

  // ── Select: membro para advertir ──────────────────────────────────────────
  if (customId === 'select_advertencias_v13') {
    const targetId = interaction.values[0]
    const target   = await guild.members.fetch(targetId).catch(() => null)
    if (!target)
      return interaction.reply({ content: '❌ Membro não encontrado.', ephemeral: true })

    selectContextMap.set(interaction.user.id, { type: 'adv', targetId, targetTag: target.user.tag })

    const advAtual = getAdvAtual(target)
    const proxAdv  = advAtual + 1
    const aviso    = proxAdv >= 3 ? '\n> ‼️ Esta será a **3ª advertência** — resultará em **expulsão automática**.' : ''

    return interaction.update({
      content:
        '# ⚠️ Confirmar Advertência\n' +
        `> **Membro:** ${target.user.tag}\n` +
        `> **ADV atual:** ${advAtual === 0 ? 'Nenhuma' : `ADV ${advAtual}`}\n` +
        `> **Próxima ADV:** ADV ${proxAdv}` +
        aviso +
        '\n\nClique em **Continuar** para preencher o motivo.',
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('cont_select_v13').setLabel('Continuar').setStyle(ButtonStyle.Primary)
        ),
      ],
    })
  }

  // ── Select: membro para exonerar ─────────────────────────────────────────
  if (customId === 'select_exoneracao_v13') {
    const targetId = interaction.values[0]
    const target   = await guild.members.fetch(targetId).catch(() => null)
    if (!target)
      return interaction.reply({ content: '❌ Membro não encontrado.', ephemeral: true })

    selectContextMap.set(interaction.user.id, { type: 'exo', targetId, targetTag: target.user.tag })

    return interaction.update({
      content:
        '# 🚪 Confirmar Exoneração\n' +
        `> **Membro:** ${target.user.tag}\n` +
        '> ⚠️ Esta ação é **permanente** e removerá todos os cargos da facção.\n\n' +
        'Clique em **Continuar** para preencher o motivo.',
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`ger_exo_cont_${targetId}`).setLabel('Continuar').setStyle(ButtonStyle.Primary)
        ),
      ],
    })
  }

  // ── Botão: Continuar Exoneração (customId dinâmico — targetId embutido) ──────
  // Formato: ger_exo_cont_{targetId}
  // Resolve o bug de "Contexto perdido" quando o Map some entre steps
  if (customId.startsWith('ger_exo_cont_')) {
    const embeddedTargetId = customId.slice('ger_exo_cont_'.length)

    // Tenta recuperar targetTag do Map; se não tiver, busca o membro no Discord
    let ctx = selectContextMap.get(interaction.user.id)
    if (!ctx || ctx.type !== 'exo') {
      // Map perdido (ex: bot reiniciou) — reconstrói contexto mínimo a partir do Discord
      const target = await guild.members.fetch(embeddedTargetId).catch(() => null)
      if (!target)
        return interaction.reply({ content: '❌ Membro não encontrado. Reinicie o processo.', ephemeral: true })
      ctx = { type: 'exo', targetId: embeddedTargetId, targetTag: target.user.tag }
      selectContextMap.set(interaction.user.id, ctx)
    }

    const modal = new ModalBuilder()
      .setCustomId('modal_exoneracao')
      .setTitle('🚪 Exonerar Membro')
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('exo_motivo')
          .setLabel('Motivo da exoneração')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(500)
          .setPlaceholder('Descreva o motivo da exoneração...')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('exo_prova')
          .setLabel('Link da prova (opcional)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(300)
          .setPlaceholder('https://imgur.com/...')
      ),
    )
    return interaction.showModal(modal)
  }

  // ── Botão: Continuar → abre modal ─────────────────────────────────────────
  if (customId === 'cont_select_v13') {
    const ctx = selectContextMap.get(interaction.user.id)
    if (!ctx)
      return interaction.reply({ content: '❌ Contexto perdido. Reinicie o processo.', ephemeral: true })

    if (ctx.type === 'adv') {
      const modal = new ModalBuilder()
        .setCustomId('modal_advertencia')
        .setTitle('⚠️ Aplicar Advertência')
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('adv_motivo')
            .setLabel('Motivo da advertência')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500)
            .setPlaceholder('Descreva o motivo da advertência...')
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('adv_prova')
            .setLabel('Link da prova (opcional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(300)
            .setPlaceholder('https://imgur.com/...')
        ),
      )
      return interaction.showModal(modal)
    }

  }

  // ── Modal: Advertência ────────────────────────────────────────────────────
  if (customId === 'modal_advertencia') {
    await interaction.deferReply({ ephemeral: true })

    const ctx = selectContextMap.get(interaction.user.id)
    if (!ctx || ctx.type !== 'adv')
      return interaction.editReply({ content: '❌ Contexto perdido. Reinicie o processo.' })

    const motivo   = interaction.fields.getTextInputValue('adv_motivo')
    const prova    = interaction.fields.getTextInputValue('adv_prova') || 'Não informado'
    const target   = await guild.members.fetch(ctx.targetId).catch(() => null)
    if (!target) return interaction.editReply({ content: '❌ Membro não encontrado no servidor.' })

    const advAtual = getAdvAtual(target)
    const proxAdv  = advAtual + 1

    // Remove adv anterior se existir
    if (advAtual >= 1 && ADV_CARGO_IDS[advAtual])
      await target.roles.remove(ADV_CARGO_IDS[advAtual]).catch(() => {})

    // ── 3ª ADV → expulsão automática ──────────────────────────────────────
    if (proxAdv >= 3) {
      if (ADV_CARGO_IDS[3]) await target.roles.add(ADV_CARGO_IDS[3]).catch(() => {})
      if (target.roles.cache.has(MS13_ROLE_ID)) await target.roles.remove(MS13_ROLE_ID).catch(() => {})

      const todosCargos = [
        ...ROLES.isento, ...ROLES.elite, ...ROLES.membro,
        ROLE_IDS.meta_paga, ROLE_IDS.etapa2,
      ].filter(id => target.roles.cache.has(id))
      for (const id of todosCargos) await target.roles.remove(id).catch(() => {})
      await target.setNickname(null).catch(() => {})

      const logCh = guild.channels.cache.get(CHANNEL_IDS.logs_adv_gerencia)
      const pubCh = guild.channels.cache.get(CHANNEL_IDS.pub_adv)
      if (logCh) await logCh.send({ components: [logAdv(3, ctx.targetId, ctx.targetTag, interaction.user.id, motivo, prova)], flags: MessageFlags.IsComponentsV2 })
      if (pubCh) await pubCh.send({
        components: [
          new ContainerBuilder()
            .setAccentColor(COLOR_ERROR)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                `## 📢 Expulsão Automática — MS-13\n\n` +
                `> **${ctx.targetTag}** foi expulso(a) automaticamente após acumular **3 advertências**.\n` +
                `> 📝 **Motivo:** ${motivo}`
              )
            )
        ],
        flags: MessageFlags.IsComponentsV2,
      })

      await sendDM(target.user, dmAdv(3, motivo))

      selectContextMap.delete(interaction.user.id)
      return interaction.editReply({
        content: `✅ **${ctx.targetTag}** foi **expulso(a) automaticamente** (3ª advertência).`,
      })
    }

    // ── ADV 1 ou 2 → aplica cargo ─────────────────────────────────────────
    await target.roles.add(ADV_CARGO_IDS[proxAdv]).catch(() => {})

    const logCh = guild.channels.cache.get(CHANNEL_IDS.logs_adv_gerencia)
    const pubCh = guild.channels.cache.get(CHANNEL_IDS.pub_adv)

    if (logCh) await logCh.send({ components: [logAdv(proxAdv, ctx.targetId, ctx.targetTag, interaction.user.id, motivo, prova)], flags: MessageFlags.IsComponentsV2 })

    if (pubCh) await pubCh.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(COLOR_WARNING)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## 📢 Advertência ${proxAdv} — MS-13\n\n` +
              `> **${ctx.targetTag}** recebeu a **ADV ${proxAdv}**.\n` +
              `> 📝 **Motivo:** ${motivo}`
            )
          )
      ],
      flags: MessageFlags.IsComponentsV2,
    })

    await sendDM(target.user, dmAdv(proxAdv, motivo))

    selectContextMap.delete(interaction.user.id)
    return interaction.editReply({
      content: `✅ **ADV ${proxAdv}** aplicada para **${ctx.targetTag}**.`,
    })
  }

  // ── Modal: Exoneração ─────────────────────────────────────────────────────
  if (customId === 'modal_exoneracao') {
    await interaction.deferReply({ ephemeral: true })

    const ctx = selectContextMap.get(interaction.user.id)
    if (!ctx || ctx.type !== 'exo')
      return interaction.editReply({ content: '❌ Contexto perdido. Reinicie o processo.' })

    const motivo = interaction.fields.getTextInputValue('exo_motivo')
    const prova  = interaction.fields.getTextInputValue('exo_prova') || 'Não informado'
    const target = await guild.members.fetch(ctx.targetId).catch(() => null)
    if (!target) return interaction.editReply({ content: '❌ Membro não encontrado no servidor.' })

    // Remove todos os cargos MS-13
    const todosCargos = [
      MS13_ROLE_ID,
      ...ROLES.isento, ...ROLES.elite, ...ROLES.membro,
      ROLE_IDS.meta_paga, ROLE_IDS.etapa2,
      ADV_CARGO_IDS[1], ADV_CARGO_IDS[2], ADV_CARGO_IDS[3],
    ].filter(id => id && target.roles.cache.has(id))

    for (const id of todosCargos) await target.roles.remove(id).catch(() => {})
    await target.setNickname(null).catch(() => {})
    // Aplica cargo Cidadão Low após sair da facção
    if (CIDADAO_LOW_ID) await target.roles.add(CIDADAO_LOW_ID).catch(() => {})

    // Guarda contexto para o prompt de blacklist
    selectContextMap.set(interaction.user.id, {
      ...ctx, motivo, prova, exoExecutorId: interaction.user.id,
    })

    // Log no canal de PD (logs oficiais da facção)
    const logPdCh = guild.channels.cache.get(LOG_PD_CHANNEL_ID)
    const exoContainer = logExo(ctx.targetId, ctx.targetTag, interaction.user.id, motivo, prova)
    if (logPdCh) await logPdCh.send({ components: [exoContainer], flags: MessageFlags.IsComponentsV2 })

    // DM para o membro
    await sendDM(target.user, dmExo(motivo))

    // Prompt de blacklist
    return interaction.editReply({
      content:
        `✅ **${ctx.targetTag}** foi exonerado(a) com sucesso.\n\n` +
        '> Deseja adicionar este membro à **blacklist** de recrutamento?',
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('bl_sim_v14')
            .setLabel('✅ Sim, adicionar à blacklist')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('bl_nao_v14')
            .setLabel('❌ Não')
            .setStyle(ButtonStyle.Secondary),
        ),
      ],
    })
  }

  // ── Botão: Confirmar blacklist ────────────────────────────────────────────
  if (customId === 'bl_sim_v14') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferUpdate()

    const ctx = selectContextMap.get(interaction.user.id)
    if (!ctx) return interaction.editReply({ content: '❌ Contexto perdido.', components: [] })

    // Integração com o sistema de blacklist SQLite — mesmo banco do recrutamento
    try {
      const { getDb } = require('./rankingEngine.js')
      getDb().prepare('INSERT OR REPLACE INTO blacklist (user_id, motivo, adicionado_por) VALUES (?, ?, ?)')
        .run(ctx.targetId, ctx.motivo, interaction.user.id)
    } catch (err) {
      console.error('[gerencia] blacklist insert error:', err)
    }

    // Log permanente no canal de logs de blacklist
    const blLogCh = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.logs_blacklist)
    if (blLogCh) await blLogCh.send({
      components: [logBlacklist(ctx.targetId, ctx.targetTag, ctx.exoExecutorId, ctx.motivo, ctx.prova)],
      flags: MessageFlags.IsComponentsV2,
    })

    selectContextMap.delete(interaction.user.id)
    return interaction.editReply({
      content: `✅ **${ctx.targetTag}** foi adicionado(a) à **blacklist** e não poderá ser recrutado(a).`,
      components: [],
    })
  }

  // ── Botão: Recusar blacklist ──────────────────────────────────────────────
  if (customId === 'bl_nao_v14') {
    if (interaction.replied || interaction.deferred) return
    await interaction.deferUpdate()

    const ctx = selectContextMap.get(interaction.user.id)
    selectContextMap.delete(interaction.user.id)

    return interaction.editReply({
      content: `✅ Exoneração de **${ctx?.targetTag ?? 'membro'}** concluída. Sem blacklist.`,
      components: [],
    })
  }
}

module.exports = { customIds, execute, buildEmbedGerencia, buildCentralGerenciaView }