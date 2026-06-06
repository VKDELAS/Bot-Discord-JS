// src/systems/metas.js
'use strict'

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  EmbedBuilder, ContainerBuilder, TextDisplayBuilder,
  SeparatorBuilder, MessageFlags,
} = require('discord.js')
const moment = require('moment-timezone')

const {
  BR_TZ, META_VALOR, ROLES, CANAIS_METAS_IDS,
  ADV_CARGO_IDS, COLOR_MS13, COLOR_SUCCESS, COLOR_ERROR,
  COLOR_WARNING, COLOR_INFO, FOOTER_TEXT,
  PRODUTOS_META_LISTA, PRODUTOS_META_CURTO,
} = require('../config/settings.js')

// ─────────────────────────────────────────────
// Estado em memória
// ─────────────────────────────────────────────
let metaAtiva  = null   // { prazo, mensagemEntregarId, modo, isentos: Set, aprovados: Set }
let advTimeout = null

// ─────────────────────────────────────────────
// Helpers de cargo
// ─────────────────────────────────────────────
function getCategoriaUsuario(member) {
  const ids = member.roles.cache.map(r => r.id)
  if (ids.some(id => ROLES.isento.includes(id))) return 'isento'
  if (ids.some(id => ROLES.elite.includes(id)))  return 'elite'
  if (ids.some(id => ROLES.membro.includes(id))) return 'membro'
  return null
}

function isStaff(member) {
  return member.roles.cache.some(r => ROLES.isento.includes(r.id))
}

function temCargoReconhecido(member) {
  return getCategoriaUsuario(member) !== null
}

// ─────────────────────────────────────────────
// Textos do painel por modo
// ─────────────────────────────────────────────
const INFO_DINHEIRO =
  '> 🏆 **Diretoria / Gerente Geral:** ✅ Isentos\n' +
  '> 👑 **Gerência** (Resp. Recrutamentos, Farm, Resp.Elite, Elite) — 💰 **R$ 52.500** (75%)\n' +
  '> 💀 **Frente** (Corredor, Linha de Frente, Conselheiro) — 💰 **R$ 35.000** (50%)\n' +
  '> 👤 **Membro** (Soldado, Associado, Morador) — 💰 **R$ 70.000** (100%)'

const INFO_PRODUTO =
  '> 🏆 **Diretoria / Gerente Geral:** ✅ Isentos\n' +
  '> 👑 **Gerência** (Resp. Recrutamentos, Farm, Resp.Elite, Elite) — ✅ Isenta no modo produto\n' +
  '> 💀 **Frente** (Corredor, Linha de Frente, Conselheiro) — 📦 **2 rotas completas**\n' +
  '> 👤 **Membro** (Soldado, Associado, Morador) — 📦 **2 rotas completas**'

const PRODUTOS_INFO =
  '> 🧪 **Produtos:** Pólvora (~220 un.) · Ferro (~190 un.) · Kevlar (~70 un.) · Tecido (~60 un.)\n' +
  '> *(equivalente a 2 rotas completas por membro)*'

const FUNCOES_TEXT =
  '📋 **Solicitar Entrega de Meta** — Define a meta semanal e prazo\n' +
  '⏰ **Criar Lembrete** — Envia lembrete de tempo restante\n' +
  '🗓️ **Alterar Prazo** — Atualiza o prazo da meta ativa\n' +
  '🛡️ **Isentar Membro(s)** — Isenta membros com motivo\n' +
  '🗑️ **Cancelar Meta** — Cancela e limpa a meta ativa\n' +
  '📊 **Gerar Relatório** — Quem cumpriu / não cumpriu\n' +
  '🔄 **Resetar Dados** — Limpa dados, mantém histórico\n' +
  '👤 **Ver Isentos** — Lista membros isentos'

// ─────────────────────────────────────────────
// buildPainelV2(modo) — Components V2
// ─────────────────────────────────────────────
function buildPainelV2(modo = 'dinheiro') {
  const isDinheiro  = modo !== 'produto'
  const modoLabel   = isDinheiro ? '💵 Dinheiro' : '📦 Produto'
  const modoToggle  = isDinheiro ? '📦 Modo: Produto' : '💵 Modo: Dinheiro'
  const infoSection = isDinheiro ? INFO_DINHEIRO : INFO_PRODUTO

  const container = new ContainerBuilder()
    .setAccentColor(COLOR_MS13)

    // Título
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('# 🏆 PAINEL DE METAS')
    )
    .addSeparatorComponents(new SeparatorBuilder())

    // Informações por cargo
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('ℹ️ **Informações Importantes**')
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(infoSection)
    )

  // Bloco de produtos (só no modo produto)
  if (!isDinheiro) {
    container
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(PRODUTOS_INFO)
      )
  }

  container
    .addSeparatorComponents(new SeparatorBuilder())

    // Funções disponíveis
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('📋 **Funções Disponíveis**')
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(FUNCOES_TEXT)
    )
    .addSeparatorComponents(new SeparatorBuilder())

    // Rodapé
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# MS-13 Management • Sistema de Metas • Modo atual: **${modoLabel}**`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())

    // Row 0 — Solicitar + Lembrete
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('painel_solicitar')
          .setLabel('📋 Solicitar Entrega de Meta')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('painel_lembrete')
          .setLabel('⏰ Criar Lembrete')
          .setStyle(ButtonStyle.Success),
      )
    )

    // Row 1 — Prazo + Isentar + Cancelar
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('painel_prazo')
          .setLabel('🗓️ Alterar Prazo')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('painel_isentar')
          .setLabel('🛡️ Isentar Membro(s)')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('painel_cancelar')
          .setLabel('🗑️ Cancelar Meta')
          .setStyle(ButtonStyle.Danger),
      )
    )

    // Row 2 — Relatório + Resetar
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('painel_relatorio')
          .setLabel('📊 Gerar Relatório')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('painel_resetar')
          .setLabel('🔄 Resetar Dados')
          .setStyle(ButtonStyle.Secondary),
      )
    )

    // Row 3 — Ver Isentos + Toggle Modo
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('painel_isentos')
          .setLabel('👤 Ver Isentos')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('painel_toggle_modo')
          .setLabel(modoToggle)
          .setStyle(isDinheiro ? ButtonStyle.Secondary : ButtonStyle.Success),
      )
    )

  return { container, flags: MessageFlags.IsComponentsV2 }
}

// ─────────────────────────────────────────────
// buildEntregarComponents — botão canal de entrega
// ─────────────────────────────────────────────
function buildEntregarComponents() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('entregar_meta_btn')
        .setLabel('✅ Entregar Meta')
        .setStyle(ButtonStyle.Success)
    )
  ]
}

// buildEmbedMetas — embed do canal de entrega (mantido como embed clássico)
function buildEmbedMetas(prazo, modo = 'dinheiro') {
  const prazoFmt = prazo
    ? moment(prazo).tz(BR_TZ).format('DD/MM/YYYY [às] HH:mm')
    : 'Indefinido'

  const isDinheiro = modo !== 'produto'
  const modoDesc   = isDinheiro
    ? '💵 Modo Dinheiro'
    : '📦 Modo Produto'

  const metaDesc = isDinheiro
    ? (
      `> 👑 **Gerência** — 💰 R$ 52.500 (75%)\n` +
      `> 💀 **Frente** — 💰 R$ 35.000 (50%)\n` +
      `> 👤 **Membro** — 💰 R$ 70.000 (100%)`
    )
    : (
      `> 💀 **Frente** — 📦 2 rotas completas\n` +
      `> 👤 **Membro** — 📦 2 rotas completas\n` +
      `> *(${PRODUTOS_META_CURTO})*`
    )

  return new EmbedBuilder()
    .setColor(isDinheiro ? COLOR_MS13 : COLOR_SUCCESS)
    .setTitle(isDinheiro ? '📦 Meta Semanal Ativa' : '📦 Meta Semanal Ativa — Modo Produto')
    .setDescription(metaDesc)
    .addFields(
      { name: '⏰ Prazo', value: prazoFmt,  inline: true },
      { name: '⚙️ Modo',  value: modoDesc,  inline: true },
    )
    .setFooter({ text: FOOTER_TEXT })
    .setTimestamp()
}

// buildAprovarRecusarComponents
function buildAprovarRecusarComponents(memberId) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`ap_${memberId}`).setLabel('✅ Aprovar').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`re_${memberId}`).setLabel('❌ Recusar').setStyle(ButtonStyle.Danger),
    )
  ]
}

// ─────────────────────────────────────────────
// Advertência automática ao vencer prazo
// ─────────────────────────────────────────────
async function aguardarEAplicarAdv(guild, prazoDt) {
  if (advTimeout) clearTimeout(advTimeout)
  if (!prazoDt) return

  const agora   = Date.now()
  const prazoMs = new Date(prazoDt).getTime()
  const delay   = Math.max(prazoMs - agora, 0)

  advTimeout = setTimeout(async () => {
    if (!metaAtiva) return
    console.log('[METAS] Prazo encerrado — verificando membros...')

    let membros
    try { membros = await guild.members.fetch() }
    catch (err) { console.error('[METAS] Falha ao buscar membros:', err); return }

    for (const [id, member] of membros) {
      const categoria = getCategoriaUsuario(member)
      if (!categoria) continue
      if (categoria === 'isento' && metaAtiva.modo !== 'isentos') continue
      if (metaAtiva.isentos   && metaAtiva.isentos.has(id))   continue
      if (metaAtiva.aprovados && metaAtiva.aprovados.has(id)) continue

      try {
        const { registrarAdvertencia } = require('./registros.js')
        const m = await guild.members.fetch(id).catch(() => null)
        if (m) await registrarAdvertencia(guild, m, 'Sistema', 'Meta semanal não entregue no prazo.')
      } catch (err) { console.error(`[METAS] Erro ao aplicar adv para ${id}:`, err) }
    }

    metaAtiva = null
    console.log('[METAS] Advertências aplicadas — meta encerrada.')
  }, delay)
}

// ─────────────────────────────────────────────
// customIds registrados
// ─────────────────────────────────────────────
const customIds = [
  'painel_solicitar', 'painel_lembrete', 'painel_prazo', 'painel_isentar',
  'painel_cancelar',  'painel_relatorio','painel_resetar','painel_isentos',
  'painel_toggle_modo', 'entregar_meta_btn',
  'modal_solicitar_meta', 'modal_lembrete', 'modal_alterar_prazo', 'modal_entregar_comprovante',
]

// ─────────────────────────────────────────────
// execute — handler central
// ─────────────────────────────────────────────
async function execute(interaction) {
  const { customId, guild, member } = interaction

  // ── Guarda de permissão para botões do painel
  const painelIds = [
    'painel_solicitar','painel_lembrete','painel_prazo','painel_isentar',
    'painel_cancelar', 'painel_relatorio','painel_resetar','painel_isentos',
    'painel_toggle_modo',
  ]
  if (painelIds.includes(customId) && !isStaff(member)) {
    if (interaction.replied || interaction.deferred) return
    return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
  }

  // ── painel_solicitar
  if (customId === 'painel_solicitar') {
    const modal = new ModalBuilder()
      .setCustomId('modal_solicitar_meta')
      .setTitle('Solicitar Nova Meta')
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('prazo_input')
          .setLabel('Prazo (DD/MM/YYYY HH:mm)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: 20/06/2025 23:59')
      )
    )
    return interaction.showModal(modal)
  }

  // ── painel_lembrete
  if (customId === 'painel_lembrete') {
    if (!metaAtiva) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Nenhuma meta ativa.', ephemeral: true })
    }
    const modal = new ModalBuilder()
      .setCustomId('modal_lembrete')
      .setTitle('Enviar Lembrete')
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('lembrete_texto')
          .setLabel('Mensagem do lembrete (opcional)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
      )
    )
    return interaction.showModal(modal)
  }

  // ── painel_prazo
  if (customId === 'painel_prazo') {
    if (!metaAtiva) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Nenhuma meta ativa.', ephemeral: true })
    }
    const modal = new ModalBuilder()
      .setCustomId('modal_alterar_prazo')
      .setTitle('Alterar Prazo')
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('novo_prazo')
          .setLabel('Novo prazo (DD/MM/YYYY HH:mm)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    )
    return interaction.showModal(modal)
  }

  // ── painel_isentar
  if (customId === 'painel_isentar') {
    if (!metaAtiva) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Nenhuma meta ativa.', ephemeral: true })
    }
    if (interaction.replied || interaction.deferred) return
    return interaction.reply({ content: '⚠️ Menção o membro para isentar. (implementar UserSelect conforme padrão do projeto)', ephemeral: true })
  }

  // ── painel_cancelar
  if (customId === 'painel_cancelar') {
    if (!metaAtiva) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Nenhuma meta ativa.', ephemeral: true })
    }
    try {
      const canalEntregar = await guild.channels.fetch(CANAIS_METAS_IDS.entregar).catch(() => null)
      if (canalEntregar && metaAtiva.mensagemEntregarId) {
        const msg = await canalEntregar.messages.fetch(metaAtiva.mensagemEntregarId).catch(() => null)
        if (msg) await msg.delete().catch(() => {})
      }
    } catch {}

    if (advTimeout) { clearTimeout(advTimeout); advTimeout = null }
    metaAtiva = null

    if (interaction.replied || interaction.deferred) return
    return interaction.reply({ content: '✅ Meta cancelada.', ephemeral: true })
  }

  // ── painel_relatorio
  if (customId === 'painel_relatorio') {
    if (!metaAtiva) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Nenhuma meta ativa.', ephemeral: true })
    }
    const aprovList = metaAtiva.aprovados?.size > 0
      ? [...metaAtiva.aprovados].map(id => `<@${id}>`).join(', ')
      : 'Nenhum ainda.'

    if (interaction.replied || interaction.deferred) return
    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR_INFO)
          .setTitle('📊 Relatório da Meta Atual')
          .addFields(
            { name: 'Prazo',     value: moment(metaAtiva.prazo).tz(BR_TZ).format('DD/MM/YYYY HH:mm'), inline: true },
            { name: 'Modo',      value: metaAtiva.modo === 'produto' ? '📦 Produto' : '💵 Dinheiro',   inline: true },
            { name: 'Aprovados', value: aprovList }
          )
          .setFooter({ text: FOOTER_TEXT })
          .setTimestamp()
      ],
      ephemeral: true,
    })
  }

  // ── painel_resetar
  if (customId === 'painel_resetar') {
    if (advTimeout) { clearTimeout(advTimeout); advTimeout = null }
    metaAtiva = null
    if (interaction.replied || interaction.deferred) return
    return interaction.reply({ content: '🔄 Estado de metas resetado.', ephemeral: true })
  }

  // ── painel_isentos
  if (customId === 'painel_isentos') {
    const lista = metaAtiva?.isentos?.size > 0
      ? [...metaAtiva.isentos].map(id => `<@${id}>`).join(', ')
      : 'Nenhum membro isento manualmente.'
    if (interaction.replied || interaction.deferred) return
    return interaction.reply({ content: `**Isentos manuais:**\n${lista}`, ephemeral: true })
  }

  // ── painel_toggle_modo
  if (customId === 'painel_toggle_modo') {
    if (!metaAtiva) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Nenhuma meta ativa.', ephemeral: true })
    }

    metaAtiva.modo = metaAtiva.modo === 'produto' ? 'dinheiro' : 'produto'
    const { container, flags } = buildPainelV2(metaAtiva.modo)

    try {
      if (!interaction.replied && !interaction.deferred) {
        await interaction.update({ components: [container], flags })
      }

      // Atualiza também o embed do canal de entrega
      const canalEntregar = await guild.channels.fetch(CANAIS_METAS_IDS.entregar).catch(() => null)
      if (canalEntregar && metaAtiva?.mensagemEntregarId) {
        const msg = await canalEntregar.messages.fetch(metaAtiva.mensagemEntregarId).catch(() => null)
        if (msg) await msg.edit({ embeds: [buildEmbedMetas(metaAtiva.prazo, metaAtiva.modo)], components: buildEntregarComponents() })
      }
    } catch (err) { console.error('[METAS] toggle_modo erro:', err) }
    return
  }

  // ── entregar_meta_btn
  if (customId === 'entregar_meta_btn') {
    if (!temCargoReconhecido(member)) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Sem cargo reconhecido.', ephemeral: true })
    }
    if (!metaAtiva) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Sem meta ativa.', ephemeral: true })
    }
    if (metaAtiva.aprovados?.has(member.id)) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '✅ Você já entregou!', ephemeral: true })
    }

    const modal = new ModalBuilder()
      .setCustomId('modal_entregar_comprovante')
      .setTitle('Entregar Meta')
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('comprovante_link')
          .setLabel('Link do comprovante')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('obs_entrega')
          .setLabel('Observações (opcional)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
      ),
    )
    return interaction.showModal(modal)
  }

  // ── ap_{memberId} — aprovar entrega
  if (customId.startsWith('ap_')) {
    if (!isStaff(member)) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    }
    const targetId = customId.slice(3)
    if (!metaAtiva) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Sem meta ativa.', ephemeral: true })
    }
    if (!metaAtiva.aprovados) metaAtiva.aprovados = new Set()
    metaAtiva.aprovados.add(targetId)

    try {
      const canalEntregues = await guild.channels.fetch(CANAIS_METAS_IDS.entregues).catch(() => null)
      if (canalEntregues) {
        await canalEntregues.send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLOR_SUCCESS)
              .setTitle('✅ Meta Aprovada')
              .setDescription(`<@${targetId}> aprovado por <@${member.id}>.`)
              .setFooter({ text: FOOTER_TEXT })
              .setTimestamp()
          ]
        })
      }
    } catch {}

    if (interaction.replied || interaction.deferred) return
    return interaction.update({ content: `✅ Meta de <@${targetId}> aprovada.`, components: [] })
  }

  // ── re_{memberId} — recusar entrega
  if (customId.startsWith('re_')) {
    if (!isStaff(member)) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Sem permissão.', ephemeral: true })
    }
    const targetId = customId.slice(3)
    if (interaction.replied || interaction.deferred) return
    return interaction.update({ content: `❌ Meta de <@${targetId}> recusada.`, components: [] })
  }

  // ─────────────────────────────────────────────
  // Modais
  // ─────────────────────────────────────────────

  // ── modal_solicitar_meta
  if (customId === 'modal_solicitar_meta') {
    const prazoRaw = interaction.fields.getTextInputValue('prazo_input')
    const prazoDt  = moment.tz(prazoRaw, 'DD/MM/YYYY HH:mm', BR_TZ).toDate()

    if (isNaN(prazoDt.getTime())) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Data inválida. Use DD/MM/YYYY HH:mm', ephemeral: true })
    }

    metaAtiva = {
      prazo:              prazoDt,
      mensagemEntregarId: null,
      modo:               'dinheiro',
      isentos:            new Set(),
      aprovados:          new Set(),
    }

    try {
      const canalEntregar = await guild.channels.fetch(CANAIS_METAS_IDS.entregar).catch(() => null)
      if (canalEntregar) {
        const msg = await canalEntregar.send({
          embeds:     [buildEmbedMetas(prazoDt, 'dinheiro')],
          components: buildEntregarComponents(),
        })
        metaAtiva.mensagemEntregarId = msg.id
      }
    } catch (err) { console.error('[METAS] Erro ao publicar meta:', err) }

    await aguardarEAplicarAdv(guild, prazoDt)

    if (interaction.replied || interaction.deferred) return
    return interaction.reply({
      content: `✅ Meta criada com prazo para **${moment(prazoDt).tz(BR_TZ).format('DD/MM/YYYY [às] HH:mm')}**.`,
      ephemeral: true,
    })
  }

  // ── modal_lembrete
  if (customId === 'modal_lembrete') {
    const textoCustom = interaction.fields.getTextInputValue('lembrete_texto')
    const texto = textoCustom.trim() ||
      `⏰ **Lembrete:** A meta encerra em **${moment(metaAtiva.prazo).tz(BR_TZ).format('DD/MM/YYYY [às] HH:mm')}**.`

    try {
      const ch = await guild.channels.fetch(CANAIS_METAS_IDS.entregar).catch(() => null)
      if (ch) await ch.send({ content: texto })
    } catch {}

    if (interaction.replied || interaction.deferred) return
    return interaction.reply({ content: '✅ Lembrete enviado.', ephemeral: true })
  }

  // ── modal_alterar_prazo
  if (customId === 'modal_alterar_prazo') {
    const novoPrazoDt = moment
      .tz(interaction.fields.getTextInputValue('novo_prazo'), 'DD/MM/YYYY HH:mm', BR_TZ)
      .toDate()

    if (isNaN(novoPrazoDt.getTime())) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ content: '❌ Data inválida.', ephemeral: true })
    }

    metaAtiva.prazo = novoPrazoDt
    await aguardarEAplicarAdv(guild, novoPrazoDt)

    try {
      const ch = await guild.channels.fetch(CANAIS_METAS_IDS.entregar).catch(() => null)
      if (ch && metaAtiva?.mensagemEntregarId) {
        const msg = await ch.messages.fetch(metaAtiva.mensagemEntregarId).catch(() => null)
        if (msg) await msg.edit({
          embeds:     [buildEmbedMetas(novoPrazoDt, metaAtiva.modo)],
          components: buildEntregarComponents(),
        })
      }
    } catch {}

    if (interaction.replied || interaction.deferred) return
    return interaction.reply({
      content: `✅ Prazo alterado para **${moment(novoPrazoDt).tz(BR_TZ).format('DD/MM/YYYY [às] HH:mm')}**.`,
      ephemeral: true,
    })
  }

  // ── modal_entregar_comprovante
  if (customId === 'modal_entregar_comprovante') {
    const link = interaction.fields.getTextInputValue('comprovante_link')
    const obs  = interaction.fields.getTextInputValue('obs_entrega') || 'Sem observações.'
    const modo = metaAtiva?.modo ?? 'dinheiro'

    const isDinheiro = modo !== 'produto'
    const cat        = getCategoriaUsuario(member)

    const embedEntrega = new EmbedBuilder()
      .setColor(COLOR_WARNING)
      .setTitle('📬 Nova entrega de meta')
      .setDescription(`<@${member.id}> enviou comprovante.`)
      .addFields(
        { name: isDinheiro ? '💰 Modo' : '📦 Modo', value: isDinheiro ? 'Dinheiro' : 'Produto', inline: true },
        { name: '📎 Comprovante', value: link },
        { name: '📝 Obs', value: obs },
      )
      .setFooter({ text: FOOTER_TEXT })
      .setTimestamp()

    try {
      const canalRelatorio = await guild.channels.fetch(CANAIS_METAS_IDS.relatorio).catch(() => null)
      if (canalRelatorio) {
        await canalRelatorio.send({
          embeds:     [embedEntrega],
          components: buildAprovarRecusarComponents(member.id),
        })
      }
    } catch {}

    if (interaction.replied || interaction.deferred) return
    return interaction.reply({ content: '✅ Comprovante enviado! Aguarde aprovação.', ephemeral: true })
  }
}

module.exports = { customIds, execute, aguardarEAplicarAdv, buildEmbedMetas, buildPainelV2 }