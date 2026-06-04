// src/systems/gerencia.js — Etapa 3: Sistema de Gerência
const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, EmbedBuilder, StringSelectMenuBuilder,
} = require('discord.js');

const {
  COLOR_MS13, COLOR_SUCCESS, COLOR_ERROR, COLOR_WARNING, COLOR_INFO,
  FOOTER_TEXT, ROLES, ROLE_IDS, ADV_CARGO_IDS, CHANNEL_IDS, REC_CHANNEL_IDS,
  ROLE_NAMES, MS13_ROLE_ID,
} = require('../config/settings.js');

const customIds = [
  'mgr_adv', 'mgr_exo', 'select_advertencias_v13', 'select_exoneracao_v13',
  'cont_select_v13', 'bl_sim_v14', 'bl_nao_v14', 'modal_advertencia', 'modal_exoneracao',
];

const selectContextMap = new Map();

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
    new ButtonBuilder().setCustomId('mgr_adv').setLabel('📋 Advertência').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('mgr_exo').setLabel('🚫 Exoneração').setStyle(ButtonStyle.Danger),
  );
  return { embeds: [embed], components: [row] };
}

// Alias para o comando /iniciar
async function buildCentralGerenciaView(guild) {
  return buildEmbedGerencia();
}

function hasRole(member, roleIds) { return roleIds.some(id => member.roles.cache.has(id)); }
function canAdvertir(member) { return hasRole(member, [ROLE_IDS.lider, ROLE_IDS.sub_lider, ROLE_IDS.recrutador]) || member.permissions.has('Administrator'); }
function canExonerar(member) { return hasRole(member, [ROLE_IDS.lider, ROLE_IDS.sub_lider]) || member.permissions.has('Administrator'); }
function getAdvAtual(member) {
  if (member.roles.cache.has(ADV_CARGO_IDS[3])) return 3;
  if (member.roles.cache.has(ADV_CARGO_IDS[2])) return 2;
  if (member.roles.cache.has(ADV_CARGO_IDS[1])) return 1;
  return 0;
}
async function sendDM(user, embed) { try { await user.send({ embeds: [embed] }); } catch {} }

async function execute(interaction) {
  const { customId, guild, member } = interaction;

  if (customId === 'mgr_adv') {
    if (!canAdvertir(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    return interaction.reply({
      content: '# 📋 Advertência\n> Selecione o membro.',
      components: [new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder().setCustomId('select_advertencias_v13').setPlaceholder('Selecione o membro').setMinValues(1).setMaxValues(1)
      )],
      ephemeral: true,
    });
  }

  if (customId === 'mgr_exo') {
    if (!canExonerar(member)) return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true });
    return interaction.reply({
      content: '# 🚫 Exoneração\n> Selecione o membro.',
      components: [new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder().setCustomId('select_exoneracao_v13').setPlaceholder('Selecione o membro').setMinValues(1).setMaxValues(1)
      )],
      ephemeral: true,
    });
  }

  if (customId === 'select_advertencias_v13') {
    const targetId = interaction.values[0];
    const target   = await guild.members.fetch(targetId).catch(() => null);
    if (!target) return interaction.reply({ content: '❌ Membro não encontrado.', ephemeral: true });
    selectContextMap.set(interaction.user.id, { type: 'adv', targetId, targetTag: target.user.tag });
    const advAtual = getAdvAtual(target);
    const proxAdv  = advAtual + 1;
    return interaction.update({
      content: `# 📋 Advertência\n> **Membro:** ${target.user.tag}\n> **ADV atual:** ${advAtual === 0 ? 'Nenhuma' : `ADV ${advAtual}`}\n> **Próxima ADV:** ADV ${proxAdv}${proxAdv === 3 ? ' *(expulsão automática)*' : ''}\n\nClique em **Continuar**.`,
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('cont_select_v13').setLabel('Continuar').setStyle(ButtonStyle.Primary))],
    });
  }

  if (customId === 'select_exoneracao_v13') {
    const targetId = interaction.values[0];
    const target   = await guild.members.fetch(targetId).catch(() => null);
    if (!target) return interaction.reply({ content: '❌ Membro não encontrado.', ephemeral: true });
    selectContextMap.set(interaction.user.id, { type: 'exo', targetId, targetTag: target.user.tag });
    return interaction.update({
      content: `# 🚫 Exoneração\n> **Membro:** ${target.user.tag}\n\nClique em **Continuar**.`,
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('cont_select_v13').setLabel('Continuar').setStyle(ButtonStyle.Primary))],
    });
  }

  if (customId === 'cont_select_v13') {
    const ctx = selectContextMap.get(interaction.user.id);
    if (!ctx) return interaction.reply({ content: '❌ Contexto perdido.', ephemeral: true });
    if (ctx.type === 'adv') {
      const modal = new ModalBuilder().setCustomId('modal_advertencia').setTitle('📋 Aplicar Advertência');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('adv_motivo').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('adv_prova').setLabel('Link da prova').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(300)),
      );
      return interaction.showModal(modal);
    }
    if (ctx.type === 'exo') {
      const modal = new ModalBuilder().setCustomId('modal_exoneracao').setTitle('🚫 Exonerar Membro');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('exo_motivo').setLabel('Motivo').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('exo_prova').setLabel('Link da prova').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(300)),
      );
      return interaction.showModal(modal);
    }
  }

  if (customId === 'modal_advertencia') {
    await interaction.deferReply({ ephemeral: true });
    const ctx = selectContextMap.get(interaction.user.id);
    if (!ctx || ctx.type !== 'adv') return interaction.editReply({ content: '❌ Contexto perdido.' });
    const motivo   = interaction.fields.getTextInputValue('adv_motivo');
    const prova    = interaction.fields.getTextInputValue('adv_prova') || 'Não informado';
    const target   = await guild.members.fetch(ctx.targetId).catch(() => null);
    if (!target) return interaction.editReply({ content: '❌ Membro não encontrado.' });
    const advAtual = getAdvAtual(target);
    const proxAdv  = advAtual + 1;
    if (advAtual >= 1 && ADV_CARGO_IDS[advAtual]) await target.roles.remove(ADV_CARGO_IDS[advAtual]).catch(() => {});
    if (proxAdv >= 3) {
      if (ADV_CARGO_IDS[3]) await target.roles.add(ADV_CARGO_IDS[3]).catch(() => {});
      if (target.roles.cache.has(MS13_ROLE_ID)) await target.roles.remove(MS13_ROLE_ID).catch(() => {});
      const todosCargos = [...ROLES.isento, ...ROLES.elite, ...ROLES.membro, ROLE_IDS.meta_paga, ROLE_IDS.etapa2].filter(id => target.roles.cache.has(id));
      for (const id of todosCargos) await target.roles.remove(id).catch(() => {});
      await target.setNickname(null).catch(() => {});
      const logEmbed = new EmbedBuilder().setColor(COLOR_ERROR).setTitle('🚨 Expulsão Automática — 3ª Advertência')
        .addFields({ name: 'Membro', value: `<@${ctx.targetId}> (${ctx.targetTag})`, inline: true }, { name: 'Executor', value: `<@${interaction.user.id}>`, inline: true }, { name: 'Motivo ADV', value: motivo }, { name: 'Prova', value: prova }).setFooter({ text: FOOTER_TEXT }).setTimestamp();
      const logCh = guild.channels.cache.get(CHANNEL_IDS.logs_adv_gerencia);
      const pubCh = guild.channels.cache.get(CHANNEL_IDS.pub_adv);
      if (logCh) await logCh.send({ embeds: [logEmbed] });
      if (pubCh) await pubCh.send({ embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle('📢 Expulsão — MS-13').setDescription(`**${ctx.targetTag}** foi expulso(a) automaticamente.\n**Motivo:** ${motivo}`).setFooter({ text: FOOTER_TEXT }).setTimestamp()] });
      await sendDM(target.user, new EmbedBuilder().setColor(COLOR_ERROR).setTitle('🚨 Você foi expulso(a) da MS-13').setDescription(`Você acumulou **3 advertências**.\n\n**Motivo:** ${motivo}`).setFooter({ text: FOOTER_TEXT }).setTimestamp());
      selectContextMap.delete(interaction.user.id);
      return interaction.editReply({ content: `✅ **${ctx.targetTag}** foi **expulso(a) automaticamente**.` });
    }
    await target.roles.add(ADV_CARGO_IDS[proxAdv]).catch(() => {});
    const logCh = guild.channels.cache.get(CHANNEL_IDS.logs_adv_gerencia);
    const pubCh = guild.channels.cache.get(CHANNEL_IDS.pub_adv);
    if (logCh) await logCh.send({ embeds: [new EmbedBuilder().setColor(COLOR_WARNING).setTitle(`⚠️ Advertência ${proxAdv} Aplicada`).addFields({ name: 'Membro', value: `<@${ctx.targetId}> (${ctx.targetTag})`, inline: true }, { name: 'Executor', value: `<@${interaction.user.id}>`, inline: true }, { name: 'ADV', value: `ADV ${proxAdv}`, inline: true }, { name: 'Motivo', value: motivo }, { name: 'Prova', value: prova }).setFooter({ text: FOOTER_TEXT }).setTimestamp()] });
    if (pubCh) await pubCh.send({ embeds: [new EmbedBuilder().setColor(COLOR_WARNING).setTitle(`📢 Advertência ${proxAdv} — MS-13`).setDescription(`**${ctx.targetTag}** recebeu a **ADV ${proxAdv}**.\n**Motivo:** ${motivo}`).setFooter({ text: FOOTER_TEXT }).setTimestamp()] });
    await sendDM(target.user, new EmbedBuilder().setColor(COLOR_WARNING).setTitle(`⚠️ Você recebeu ADV ${proxAdv} — MS-13`).setDescription(`Você recebeu a **${proxAdv}ª advertência**.\n\n**Motivo:** ${motivo}\n\n${proxAdv === 2 ? '> ⚠️ Na próxima você será expulso(a) automaticamente.' : ''}`).setFooter({ text: FOOTER_TEXT }).setTimestamp());
    selectContextMap.delete(interaction.user.id);
    return interaction.editReply({ content: `✅ ADV ${proxAdv} aplicada para **${ctx.targetTag}**.` });
  }

  if (customId === 'modal_exoneracao') {
    await interaction.deferReply({ ephemeral: true });
    const ctx = selectContextMap.get(interaction.user.id);
    if (!ctx || ctx.type !== 'exo') return interaction.editReply({ content: '❌ Contexto perdido.' });
    const motivo = interaction.fields.getTextInputValue('exo_motivo');
    const prova  = interaction.fields.getTextInputValue('exo_prova') || 'Não informado';
    const target = await guild.members.fetch(ctx.targetId).catch(() => null);
    if (!target) return interaction.editReply({ content: '❌ Membro não encontrado.' });
    const todosCargos = [MS13_ROLE_ID, ...ROLES.isento, ...ROLES.elite, ...ROLES.membro, ROLE_IDS.meta_paga, ROLE_IDS.etapa2, ADV_CARGO_IDS[1], ADV_CARGO_IDS[2], ADV_CARGO_IDS[3]].filter(id => id && target.roles.cache.has(id));
    for (const id of todosCargos) await target.roles.remove(id).catch(() => {});
    await target.setNickname(null).catch(() => {});
    selectContextMap.set(interaction.user.id, { ...ctx, motivo, prova, exoExecutorId: interaction.user.id });
    const logCh = guild.channels.cache.get(CHANNEL_IDS.logs_adv_gerencia);
    if (logCh) await logCh.send({ embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle('🚫 Membro Exonerado').addFields({ name: 'Membro', value: `<@${ctx.targetId}> (${ctx.targetTag})`, inline: true }, { name: 'Executor', value: `<@${interaction.user.id}>`, inline: true }, { name: 'Motivo', value: motivo }, { name: 'Prova', value: prova }).setFooter({ text: FOOTER_TEXT }).setTimestamp()] });
    await sendDM(target.user, new EmbedBuilder().setColor(COLOR_ERROR).setTitle('🚫 Você foi exonerado(a) da MS-13').setDescription(`Você foi **exonerado(a)**.\n\n**Motivo:** ${motivo}`).setFooter({ text: FOOTER_TEXT }).setTimestamp());
    return interaction.editReply({
      content: `✅ **${ctx.targetTag}** exonerado(a).\n\n> Adicionar à **blacklist**?`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('bl_sim_v14').setLabel('✅ Sim, blacklist').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('bl_nao_v14').setLabel('❌ Não').setStyle(ButtonStyle.Secondary),
      )],
    });
  }

  if (customId === 'bl_sim_v14') {
    if (interaction.replied || interaction.deferred) return;
    await interaction.deferUpdate();
    const ctx = selectContextMap.get(interaction.user.id);
    if (!ctx) return interaction.editReply({ content: '❌ Contexto perdido.', components: [] });
    const blCh = interaction.guild.channels.cache.get(REC_CHANNEL_IDS.blacklist);
    if (blCh) await blCh.send({ embeds: [new EmbedBuilder().setColor(COLOR_ERROR).setTitle('⛔ Adicionado à Blacklist').addFields({ name: 'Membro', value: `<@${ctx.targetId}> (${ctx.targetTag})`, inline: true }, { name: 'Executor', value: `<@${ctx.exoExecutorId}>`, inline: true }, { name: 'Motivo', value: ctx.motivo }, { name: 'Prova', value: ctx.prova }).setFooter({ text: FOOTER_TEXT }).setTimestamp()] });
    selectContextMap.delete(interaction.user.id);
    return interaction.editReply({ content: `✅ **${ctx.targetTag}** adicionado(a) à blacklist.`, components: [] });
  }

  if (customId === 'bl_nao_v14') {
    if (interaction.replied || interaction.deferred) return;
    await interaction.deferUpdate();
    const ctx = selectContextMap.get(interaction.user.id);
    selectContextMap.delete(interaction.user.id);
    return interaction.editReply({ content: `✅ Exoneração concluída. **${ctx?.targetTag ?? 'Membro'}** não foi adicionado(a) à blacklist.`, components: [] });
  }
}

module.exports = { customIds, execute, buildEmbedGerencia, buildCentralGerenciaView };
