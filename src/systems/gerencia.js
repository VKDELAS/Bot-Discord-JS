// src/systems/gerencia.js — Etapa 3: Sistema de Gerência
// MS-13 Bot | Discord.js v14

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} = require('discord.js');

// ─── Constantes (importadas de settings.js em produção) ───────────────────
const {
  COLOR_MS13, COLOR_SUCCESS, COLOR_ERROR, COLOR_WARNING, COLOR_INFO,
  FOOTER_TEXT, ROLES, ROLE_IDS, ADV_CARGO_IDS, CHANNEL_IDS, REC_CHANNEL_IDS,
  ROLE_NAMES, MS13_ROLE_ID,
} = require('../config/settings.js');

// ─── customIds exportados ─────────────────────────────────────────────────
const customIds = [
  'mgr_adv',
  'mgr_exo',
  'select_advertencias_v13',
  'select_exoneracao_v13',
  'cont_select_v13',
  'bl_sim_v14',
  'bl_nao_v14',
  'modal_advertencia',
  'modal_exoneracao',
];

// Map compartilhado: userId → { type: 'adv'|'exo', targetId, targetTag }
const selectContextMap = new Map();

// ─── Embed principal do painel de gerência ────────────────────────────────
function buildEmbedGerencia() {
  const embed = new EmbedBuilder()
    .setColor(COLOR_MS13)
    .setTitle('🔰 Painel de Gerência — MS-13')
    .setDescription(
      '> Use os botões abaixo para gerenciar membros da facção.\n\n' +
      '**📋 Advertência** — Aplica cargo de advertência acumulativo ao membro.\n' +
      '**🚫 Exoneração** — Remove o membro da facção com opção de blacklist.'
    )
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mgr_adv')
      .setLabel('📋 Advertência')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('mgr_exo')
      .setLabel('🚫 Exoneração')
      .setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row] };
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function hasRole(member, roleIds) {
  return roleIds.some(id => member.roles.cache.has(id));
}

function canAdvertir(member) {
  return hasRole(member, [
    ROLE_IDS.lider,
    ROLE_IDS.sub_lider,
    ROLE_IDS.recrutador,
  ]) || member.permissions.has('Administrator');
}

function canExonerar(member) {
  return hasRole(member, [
    ROLE_IDS.lider,
    ROLE_IDS.sub_lider,
  ]) || member.permissions.has('Administrator');
}

// Retorna qual ADV o membro já tem (0 = nenhum, 1, 2 ou 3)
function getAdvAtual(member) {
  if (member.roles.cache.has(ADV_CARGO_IDS[3])) return 3;
  if (member.roles.cache.has(ADV_CARGO_IDS[2])) return 2;
  if (member.roles.cache.has(ADV_CARGO_IDS[1])) return 1;
  return 0;
}

async function sendDM(user, embed) {
  try {
    await user.send({ embeds: [embed] });
  } catch {
    // DMs fechadas — silencia
  }
}

// ─── Executor principal ───────────────────────────────────────────────────

async function execute(interaction) {
  const { customId, guild, member } = interaction;

  // ── mgr_adv ──────────────────────────────────────────────────────────────
  if (customId === 'mgr_adv') {
    if (!canAdvertir(member)) {
      return interaction.reply({
        content: '❌ Você não tem permissão para aplicar advertências.',
        ephemeral: true,
      });
    }

    const row = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId('select_advertencias_v13')
        .setPlaceholder('Selecione o membro para advertir')
        .setMinValues(1)
        .setMaxValues(1),
    );

    return interaction.reply({
      content: '# 📋 Advertência\n> Selecione o membro que receberá a advertência.',
      components: [row],
      ephemeral: true,
    });
  }

  // ── mgr_exo ───────────────────────────────────────────────────────────────
  if (customId === 'mgr_exo') {
    if (!canExonerar(member)) {
      return interaction.reply({
        content: '❌ Você não tem permissão para exonerar membros.',
        ephemeral: true,
      });
    }

    const row = new ActionRowBuilder().addComponents(
      new UserSelectMenuBuilder()
        .setCustomId('select_exoneracao_v13')
        .setPlaceholder('Selecione o membro a ser exonerado')
        .setMinValues(1)
        .setMaxValues(1),
    );

    return interaction.reply({
      content: '# 🚫 Exoneração\n> Selecione o membro que será exonerado da facção.',
      components: [row],
      ephemeral: true,
    });
  }

  // ── select_advertencias_v13 ───────────────────────────────────────────────
  if (customId === 'select_advertencias_v13') {
    const targetId = interaction.values[0];
    const target = await guild.members.fetch(targetId).catch(() => null);

    if (!target) {
      return interaction.reply({ content: '❌ Membro não encontrado.', ephemeral: true });
    }

    // Guarda contexto para cont_select_v13
    selectContextMap.set(interaction.user.id, {
      type: 'adv',
      targetId,
      targetTag: target.user.tag,
    });

    const advAtual = getAdvAtual(target);
    const proxAdv  = advAtual + 1;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('cont_select_v13')
        .setLabel('Continuar')
        .setStyle(ButtonStyle.Primary),
    );

    return interaction.update({
      content:
        `# 📋 Advertência\n` +
        `> **Membro:** ${target.user.tag}\n` +
        `> **ADV atual:** ${advAtual === 0 ? 'Nenhuma' : `ADV ${advAtual}`}\n` +
        `> **Próxima ADV:** ADV ${proxAdv}${proxAdv === 3 ? ' *(expulsão automática)*' : ''}\n\n` +
        `Clique em **Continuar** para preencher os detalhes.`,
      components: [row],
    });
  }

  // ── select_exoneracao_v13 ─────────────────────────────────────────────────
  if (customId === 'select_exoneracao_v13') {
    const targetId = interaction.values[0];
    const target = await guild.members.fetch(targetId).catch(() => null);

    if (!target) {
      return interaction.reply({ content: '❌ Membro não encontrado.', ephemeral: true });
    }

    selectContextMap.set(interaction.user.id, {
      type: 'exo',
      targetId,
      targetTag: target.user.tag,
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('cont_select_v13')
        .setLabel('Continuar')
        .setStyle(ButtonStyle.Primary),
    );

    return interaction.update({
      content:
        `# 🚫 Exoneração\n` +
        `> **Membro:** ${target.user.tag}\n\n` +
        `Clique em **Continuar** para preencher os detalhes da exoneração.`,
      components: [row],
    });
  }

  // ── cont_select_v13 ───────────────────────────────────────────────────────
  if (customId === 'cont_select_v13') {
    const ctx = selectContextMap.get(interaction.user.id);

    if (!ctx) {
      return interaction.reply({
        content: '❌ Contexto perdido. Inicie o processo novamente.',
        ephemeral: true,
      });
    }

    if (ctx.type === 'adv') {
      const modal = new ModalBuilder()
        .setCustomId('modal_advertencia')
        .setTitle('📋 Aplicar Advertência');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('adv_motivo')
            .setLabel('Motivo da advertência')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('adv_prova')
            .setLabel('Link da prova (print/vídeo)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(300),
        ),
      );

      return interaction.showModal(modal);
    }

    if (ctx.type === 'exo') {
      const modal = new ModalBuilder()
        .setCustomId('modal_exoneracao')
        .setTitle('🚫 Exonerar Membro');

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('exo_motivo')
            .setLabel('Motivo da exoneração')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('exo_prova')
            .setLabel('Link da prova (opcional)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(300),
        ),
      );

      return interaction.showModal(modal);
    }
  }

  // ── modal_advertencia ─────────────────────────────────────────────────────
  if (customId === 'modal_advertencia') {
    await interaction.deferReply({ ephemeral: true });

    const ctx = selectContextMap.get(interaction.user.id);
    if (!ctx || ctx.type !== 'adv') {
      return interaction.editReply({ content: '❌ Contexto perdido. Reinicie o processo.' });
    }

    const motivo = interaction.fields.getTextInputValue('adv_motivo');
    const prova  = interaction.fields.getTextInputValue('adv_prova') || 'Não informado';

    const target = await guild.members.fetch(ctx.targetId).catch(() => null);
    if (!target) {
      return interaction.editReply({ content: '❌ Membro não encontrado no servidor.' });
    }

    const advAtual = getAdvAtual(target);
    const proxAdv  = advAtual + 1;

    // Remove ADV anterior se existir
    if (advAtual >= 1 && ADV_CARGO_IDS[advAtual]) {
      await target.roles.remove(ADV_CARGO_IDS[advAtual]).catch(() => {});
    }

    if (proxAdv >= 3) {
      // ── Expulsão automática na 3ª ADV ──────────────────────────────────
      // Aplica ADV 3 primeiro, depois aciona fluxo de exoneração
      if (ADV_CARGO_IDS[3]) {
        await target.roles.add(ADV_CARGO_IDS[3]).catch(() => {});
      }

      // Remove cargo MS-13
      if (target.roles.cache.has(MS13_ROLE_ID)) {
        await target.roles.remove(MS13_ROLE_ID).catch(() => {});
      }

      // Remove todos os cargos da facção
      const todosCargos = [
        ...ROLES.isento,
        ...ROLES.elite,
        ...ROLES.membro,
        ROLE_IDS.meta_paga,
        ROLE_IDS.etapa2,
      ].filter(id => target.roles.cache.has(id));

      for (const id of todosCargos) {
        await target.roles.remove(id).catch(() => {});
      }

      // Limpa nick
      await target.setNickname(null).catch(() => {});

      const logEmbed = new EmbedBuilder()
        .setColor(COLOR_ERROR)
        .setTitle('🚨 Expulsão Automática — 3ª Advertência')
        .addFields(
          { name: 'Membro',     value: `<@${ctx.targetId}> (${ctx.targetTag})`, inline: true },
          { name: 'Executor',   value: `<@${interaction.user.id}>`,              inline: true },
          { name: 'Motivo ADV', value: motivo },
          { name: 'Prova',      value: prova },
        )
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp();

      const pubEmbed = new EmbedBuilder()
        .setColor(COLOR_ERROR)
        .setTitle('📢 Expulsão — MS-13')
        .setDescription(
          `**${ctx.targetTag}** recebeu a **3ª advertência** e foi expulso(a) automaticamente.\n` +
          `**Motivo:** ${motivo}`
        )
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp();

      const dmEmbed = new EmbedBuilder()
        .setColor(COLOR_ERROR)
        .setTitle('🚨 Você foi expulso(a) da MS-13')
        .setDescription(
          `Você acumulou **3 advertências** e foi expulso(a) automaticamente da facção.\n\n` +
          `**Motivo:** ${motivo}`
        )
        .setFooter({ text: FOOTER_TEXT })
        .setTimestamp();

      const logCh = guild.channels.cache.get(CHANNEL_IDS.logs_adv_gerencia);
      const pubCh = guild.channels.cache.get(CHANNEL_IDS.pub_adv);

      if (logCh) await logCh.send({ embeds: [logEmbed] });
      if (pubCh) await pubCh.send({ embeds: [pubEmbed] });
      await sendDM(target.user, dmEmbed);

      selectContextMap.delete(interaction.user.id);

      return interaction.editReply({
        content: `✅ **${ctx.targetTag}** recebeu a 3ª advertência e foi **expulso(a) automaticamente**.`,
      });
    }

    // ── ADV 1 ou 2 ───────────────────────────────────────────────────────────
    await target.roles.add(ADV_CARGO_IDS[proxAdv]).catch(() => {});

    const logEmbed = new EmbedBuilder()
      .setColor(COLOR_WARNING)
      .setTitle(`⚠️ Advertência ${proxAdv} Aplicada`)
      .addFields(
        { name: 'Membro',   value: `<@${ctx.targetId}> (${ctx.targetTag})`, inline: true },
        { name: 'Executor', value: `<@${interaction.user.id}>`,              inline: true },
        { name: 'ADV',      value: `ADV ${proxAdv}`,                         inline: true },
        { name: 'Motivo',   value: motivo },
        { name: 'Prova',    value: prova },
      )
      .setFooter({ text: FOOTER_TEXT })
      .setTimestamp();

    const pubEmbed = new EmbedBuilder()
      .setColor(COLOR_WARNING)
      .setTitle(`📢 Advertência ${proxAdv} — MS-13`)
      .setDescription(
        `**${ctx.targetTag}** recebeu a **ADV ${proxAdv}**.\n` +
        `**Motivo:** ${motivo}`
      )
      .setFooter({ text: FOOTER_TEXT })
      .setTimestamp();

    const dmEmbed = new EmbedBuilder()
      .setColor(COLOR_WARNING)
      .setTitle(`⚠️ Você recebeu ADV ${proxAdv} — MS-13`)
      .setDescription(
        `Você recebeu a **${proxAdv}ª advertência** na MS-13.\n\n` +
        `**Motivo:** ${motivo}\n\n` +
        (proxAdv === 2
          ? '> ⚠️ **Atenção:** Na próxima advertência você será expulso(a) automaticamente.'
          : '')
      )
      .setFooter({ text: FOOTER_TEXT })
      .setTimestamp();

    const logCh = guild.channels.cache.get(CHANNEL_IDS.logs_adv_gerencia);
    const pubCh = guild.channels.cache.get(CHANNEL_IDS.pub_adv);

    if (logCh) await logCh.send({ embeds: [logEmbed] });
    if (pubCh) await pubCh.send({ embeds: [pubEmbed] });
    await sendDM(target.user, dmEmbed);

    selectContextMap.delete(interaction.user.id);

    return interaction.editReply({
      content: `✅ ADV ${proxAdv} aplicada para **${ctx.targetTag}**.`,
    });
  }

  // ── modal_exoneracao ──────────────────────────────────────────────────────
  if (customId === 'modal_exoneracao') {
    await interaction.deferReply({ ephemeral: true });

    const ctx = selectContextMap.get(interaction.user.id);
    if (!ctx || ctx.type !== 'exo') {
      return interaction.editReply({ content: '❌ Contexto perdido. Reinicie o processo.' });
    }

    const motivo = interaction.fields.getTextInputValue('exo_motivo');
    const prova  = interaction.fields.getTextInputValue('exo_prova') || 'Não informado';

    const target = await guild.members.fetch(ctx.targetId).catch(() => null);
    if (!target) {
      return interaction.editReply({ content: '❌ Membro não encontrado no servidor.' });
    }

    // Remove cargo MS-13 e todos os cargos da facção
    const todosCargos = [
      MS13_ROLE_ID,
      ...ROLES.isento,
      ...ROLES.elite,
      ...ROLES.membro,
      ROLE_IDS.meta_paga,
      ROLE_IDS.etapa2,
      ADV_CARGO_IDS[1],
      ADV_CARGO_IDS[2],
      ADV_CARGO_IDS[3],
    ].filter(id => id && target.roles.cache.has(id));

    for (const id of todosCargos) {
      await target.roles.remove(id).catch(() => {});
    }

    // Limpa nick
    await target.setNickname(null).catch(() => {});

    // Salva contexto para blacklist
    selectContextMap.set(interaction.user.id, {
      ...ctx,
      motivo,
      prova,
      exoExecutorId: interaction.user.id,
    });

    const logEmbed = new EmbedBuilder()
      .setColor(COLOR_ERROR)
      .setTitle('🚫 Membro Exonerado')
      .addFields(
        { name: 'Membro',   value: `<@${ctx.targetId}> (${ctx.targetTag})`, inline: true },
        { name: 'Executor', value: `<@${interaction.user.id}>`,              inline: true },
        { name: 'Motivo',   value: motivo },
        { name: 'Prova',    value: prova },
      )
      .setFooter({ text: FOOTER_TEXT })
      .setTimestamp();

    const logCh = guild.channels.cache.get(CHANNEL_IDS.logs_adv_gerencia);
    if (logCh) await logCh.send({ embeds: [logEmbed] });

    const dmEmbed = new EmbedBuilder()
      .setColor(COLOR_ERROR)
      .setTitle('🚫 Você foi exonerado(a) da MS-13')
      .setDescription(
        `Você foi **exonerado(a)** da facção MS-13.\n\n` +
        `**Motivo:** ${motivo}`
      )
      .setFooter({ text: FOOTER_TEXT })
      .setTimestamp();

    await sendDM(target.user, dmEmbed);

    // Pergunta sobre blacklist
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('bl_sim_v14')
        .setLabel('✅ Sim, adicionar à blacklist')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('bl_nao_v14')
        .setLabel('❌ Não, apenas exonerar')
        .setStyle(ButtonStyle.Secondary),
    );

    return interaction.editReply({
      content:
        `✅ **${ctx.targetTag}** foi exonerado(a) com sucesso.\n\n` +
        `> Deseja adicionar este membro à **blacklist de recrutamento**?`,
      components: [row],
    });
  }

  // ── bl_sim_v14 ────────────────────────────────────────────────────────────
  if (customId === 'bl_sim_v14') {
    if (interaction.replied || interaction.deferred) return;
    await interaction.deferUpdate();

    const ctx = selectContextMap.get(interaction.user.id);
    if (!ctx) {
      return interaction.editReply({ content: '❌ Contexto perdido.', components: [] });
    }

    const blEmbed = new EmbedBuilder()
      .setColor(COLOR_ERROR)
      .setTitle('⛔ Adicionado à Blacklist')
      .addFields(
        { name: 'Membro',   value: `<@${ctx.targetId}> (${ctx.targetTag})`, inline: true },
        { name: 'Executor', value: `<@${ctx.exoExecutorId}>`,                inline: true },
        { name: 'Motivo',   value: ctx.motivo },
        { name: 'Prova',    value: ctx.prova },
      )
      .setFooter({ text: FOOTER_TEXT })
      .setTimestamp();

    const blCh = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.blacklist);
    if (blCh) await blCh.send({ embeds: [blEmbed] });

    selectContextMap.delete(interaction.user.id);

    return interaction.editReply({
      content: `✅ **${ctx.targetTag}** foi adicionado(a) à blacklist de recrutamento.`,
      components: [],
    });
  }

  // ── bl_nao_v14 ────────────────────────────────────────────────────────────
  if (customId === 'bl_nao_v14') {
    if (interaction.replied || interaction.deferred) return;
    await interaction.deferUpdate();

    const ctx = selectContextMap.get(interaction.user.id);
    selectContextMap.delete(interaction.user.id);

    return interaction.editReply({
      content: `✅ Exoneração concluída. **${ctx?.targetTag ?? 'Membro'}** não foi adicionado(a) à blacklist.`,
      components: [],
    });
  }
}

module.exports = { customIds, execute, buildEmbedGerencia };
