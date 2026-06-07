// src/systems/metas.js
'use strict'

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  EmbedBuilder, UserSelectMenuBuilder,
  ContainerBuilder, TextDisplayBuilder,
  SeparatorBuilder, MessageFlags,
} = require('discord.js')
const moment = require('moment-timezone')

const {
  BR_TZ, META_VALOR, ROLES, CANAIS_METAS_IDS, CHANNEL_IDS, REC_CHANNEL_IDS,
  COLOR_MS13, COLOR_SUCCESS, COLOR_ERROR,
  COLOR_WARNING, COLOR_INFO, FOOTER_TEXT,
  PRODUTOS_META_CURTO,
} = require('../config/settings.js')

const { loadData, saveData } = require('../database/manager.js')

// ─────────────────────────────────────────────
// Estado em memória
// ─────────────────────────────────────────────
let advTimeout = null
const isentarContextMap = new Map()

// ─────────────────────────────────────────────
// Helpers de cargo
// isento   → isento total
// gerencia → 75% dinheiro / isento produto
// frente   → 50% dinheiro / 2 rotas produto
// membro   → 100% dinheiro / 2 rotas produto
// ─────────────────────────────────────────────
function getCategoriaUsuario(member) {
  const ids = member.roles.cache.map(r => r.id)
  if (ids.some(id => ROLES.isento.includes(id)))   return 'isento'
  if (ids.some(id => ROLES.gerencia.includes(id)))  return 'gerencia'
  if (ids.some(id => ROLES.frente.includes(id)))    return 'frente'
  if (ids.some(id => ROLES.membro.includes(id)))    return 'membro'
  return null
}

function getCargoNome(member) {
  const { ROLE_NAMES } = require('../config/settings.js')
  const roles = [...member.roles.cache.values()]
    .sort((a, b) => b.position - a.position) // maior posição = cargo mais alto
  for (const role of roles) {
    if (ROLE_NAMES[role.id]) return ROLE_NAMES[role.id]
  }
  return 'Desconhecido'
}

function getNomeMta(member) {
  return member.displayName || member.user.username
}

function isStaff(member) {
  return (
    member.permissions.has('Administrator') ||
    member.roles.cache.some(r => ROLES.isento.includes(r.id))
  )
}

function getValorParaCategoria(cat) {
  if (cat === 'gerencia') return Math.floor(META_VALOR * 0.75) // R$ 52.500
  if (cat === 'frente')   return Math.floor(META_VALOR * 0.50) // R$ 35.000
  return META_VALOR                                             // R$ 70.000
}

function getRotasParaCategoria(cat) {
  if (cat === 'isento' || cat === 'gerencia') return 0
  return 2 // frente e membro
}

function fmtBRL(n) {
  return `R$ ${n.toLocaleString('pt-BR')}`
}

// ─────────────────────────────────────────────
// Textos estáticos
// ─────────────────────────────────────────────
const INFO_DINHEIRO =
  '> 🏆 **Diretoria / Gerente Geral** — ✅ Isentos\n' +
  '> 👑 **Gerência** (Resp. Recrutamentos, Farm, Resp. Elite, Elite) — ✅ Isentos\n' +
  '> 💀 **Frente** (Corredor) — 💰 **R$ 35.000** (50%)\n' +
  '> ⚔️ **Linha de Frente / Conselheiro** — 💰 **R$ 52.500** (75%)\n' +
  '> 👤 **Membro** (Soldado, Associado, Morador) — 💰 **R$ 70.000** (100%)'

const INFO_PRODUTO =
  '> 🏆 **Diretoria / Gerente Geral** — ✅ Isentos\n' +
  '> 👑 **Gerência** (Resp. Recrutamentos, Farm, Resp. Elite, Elite) — ✅ Isentos\n' +
  '> 💀 **Frente** (Corredor, Linha de Frente, Conselheiro) — 📦 **2 rotas completas**\n' +
  '> 👤 **Membro** (Soldado, Associado, Morador) — 📦 **2 rotas completas**'

const PRODUTOS_INFO =
  '> 🧪 Pólvora (~220 un.) · Ferro (~190 un.) · Kevlar (~70 un.) · Tecido (~60 un.)\n' +
  '> *(equivalente a 2 rotas completas por membro)*'

const FUNCOES_TEXT =
  '`📋` Solicitar Meta — abre prazo da semana\n' +
  '`⏰` Lembrete — avisa membros sobre o prazo\n' +
  '`🗓️` Alterar Prazo — atualiza o prazo da meta ativa\n' +
  '`🛡️` Isentar Membro — isenta com motivo\n' +
  '`🗑️` Cancelar Meta — encerra e limpa a meta ativa\n' +
  '`📊` Relatório — quem cumpriu / não cumpriu\n' +
  '`🔄` Resetar — limpa dados, mantém histórico\n' +
  '`👤` Ver Isentos — lista membros isentos manualmente'

// ─────────────────────────────────────────────
// buildPainelV2
// ─────────────────────────────────────────────
function buildPainelV2(modo = 'dinheiro') {
  const isDinheiro = modo !== 'produto'
  const modoLabel  = isDinheiro ? '💵 Dinheiro' : '📦 Produto'
  const modoToggle = isDinheiro ? '📦 Mudar para Produto' : '💵 Mudar para Dinheiro'

  const container = new ContainerBuilder()
    .setAccentColor(COLOR_MS13)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 🏆 Painel de Metas'))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('**Tabela de Valores**'))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(isDinheiro ? INFO_DINHEIRO : INFO_PRODUTO))

  if (!isDinheiro) {
    container
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('**Composição dos Produtos**'))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(PRODUTOS_INFO))
  }

  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('**Funções**'))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(FUNCOES_TEXT))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('painel_solicitar').setLabel('📋 Solicitar Meta').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('painel_lembrete').setLabel('⏰ Lembrete').setStyle(ButtonStyle.Success),
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('painel_prazo').setLabel('🗓️ Alterar Prazo').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('painel_isentar').setLabel('🛡️ Isentar Membro').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('painel_cancelar').setLabel('🗑️ Cancelar Meta').setStyle(ButtonStyle.Danger),
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('painel_relatorio').setLabel('📊 Relatório').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('painel_resetar').setLabel('🔄 Resetar').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('painel_isentos').setLabel('👤 Ver Isentos').setStyle(ButtonStyle.Secondary),
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('painel_toggle_modo')
        .setLabel(modoToggle)
        .setStyle(isDinheiro ? ButtonStyle.Secondary : ButtonStyle.Success),
    ))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `-# MS-13 Management · Modo atual: **${modoLabel}**`
    ))

  return { container, flags: MessageFlags.IsComponentsV2 }
}

// ─────────────────────────────────────────────
// buildMetaAtivaV2 — canal de entrega (público, com @everyone)
// ─────────────────────────────────────────────
function buildMetaAtivaV2(prazo, modo = 'dinheiro') {
  const isDinheiro  = modo !== 'produto'
  const ts          = prazo ? Math.floor(new Date(prazo).getTime() / 1000) : null
  const accentColor = isDinheiro ? COLOR_MS13 : COLOR_SUCCESS

  const infoValores = isDinheiro
    ? (
      '> 🏆 **Diretoria / Gerentes / Resp.** — ✅ Isentos\n' +
      '> ⚔️ **Elite / Linha de Frente / Conselheiro** — 💰 R$ 52.500 *(75%)*\n' +
      '> 💀 **Corredor** — 💰 R$ 35.000 *(50%)*\n' +
      '> 👤 **Soldado / Associado / Morador** — 💰 R$ 70.000 *(100%)*'
    )
    : (
      '> 🏆 **Diretoria / Gerentes / Resp.** — ✅ Isentos\n' +
      '> 💀 **Frente** (Corredor, Linha de Frente, Conselheiro) — 📦 2 rotas\n' +
      '> 👤 **Soldado / Associado / Morador** — 📦 2 rotas\n' +
      `> *(${PRODUTOS_META_CURTO})*`
    )

  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    // @everyone como TextDisplay (content não pode coexistir com IsComponentsV2)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('@everyone'))
    .addSeparatorComponents(new SeparatorBuilder())
    // Título + modo
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      isDinheiro
        ? '# 💰 Meta Semanal — Modo Dinheiro'
        : '# 📦 Meta Semanal — Modo Produto'
    ))
    .addSeparatorComponents(new SeparatorBuilder())
    // Tabela de valores
    .addTextDisplayComponents(new TextDisplayBuilder().setContent('**Valores por cargo**'))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoValores))
    .addSeparatorComponents(new SeparatorBuilder())
    // Prazo
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      ts
        ? `⏰ **Prazo:** <t:${ts}:F>\n🕐 **Faltam:** <t:${ts}:R>`
        : '⏰ **Prazo:** Indefinido'
    ))
    .addSeparatorComponents(new SeparatorBuilder())
    // Instruções
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      isDinheiro
        ? '📌 **Como entregar:**\n> Clique em **✅ Entregar Meta**, veja seu valor e envie o link do comprovante de pagamento.'
        : '📌 **Como entregar:**\n> Clique em **✅ Entregar Meta**, confirme as rotas e envie o print dos produtos entregues.'
    ))
    .addSeparatorComponents(new SeparatorBuilder())
    // Botão
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('entregar_meta_btn')
        .setLabel('✅ Entregar Meta')
        .setStyle(ButtonStyle.Success)
    ))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '-# MS-13 Management · Sistema de Metas · Dúvidas? Fale com a gerência'
    ))

  return { components: [container], flags: MessageFlags.IsComponentsV2 }
}

// ─────────────────────────────────────────────
// buildRespostaV2 — reply ephemeral
// ─────────────────────────────────────────────
function buildRespostaV2(accentColor, linhas, actionRow = null) {
  const container = new ContainerBuilder().setAccentColor(accentColor)
  for (const linha of linhas)
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(linha))
  if (actionRow) {
    container.addSeparatorComponents(new SeparatorBuilder())
    container.addActionRowComponents(actionRow)
  }
  return { components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral }
}

// ─────────────────────────────────────────────
// buildRelatorioPanel — painel fixo no canal de relatório
// ─────────────────────────────────────────────
function buildRelatorioPanel() {
  const container = new ContainerBuilder()
    .setAccentColor(COLOR_INFO)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '# 📊 RELATÓRIO DE METAS\n' +
      '> Use o botão abaixo para gerar o relatório da semana atual.'
    ))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      '> O relatório exibe todos os membros que **cumpriram** e os que **não cumpriram** a meta,\n' +
      '> com modo de pagamento, prazo vigente e taxa de cumprimento.\n' +
      '> ⚠️ O resultado será visível **apenas para você** e some automaticamente em **5 minutos**.'
    ))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('meta_gerar_relatorio_canal')
          .setLabel('📊 Gerar Relatório Agora')
          .setStyle(ButtonStyle.Primary),
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${FOOTER_TEXT}`))

  return { container, flags: MessageFlags.IsComponentsV2 }
}

// ─────────────────────────────────────────────
// _buildContainerRelatorio — monta o container do relatório
// reutilizado tanto no ephemeral quanto no log permanente
// ─────────────────────────────────────────────
function _buildContainerRelatorio({ cumpriram, naoCumpriram, taxa, corTaxa, modo, meta, agora }) {
  const prazoTs = `<t:${Math.floor(new Date(meta.prazo_iso).getTime() / 1000)}:F>`
  const prazoR  = `<t:${Math.floor(new Date(meta.prazo_iso).getTime() / 1000)}:R>`

  function chunked(arr, size = 10) {
    const chunks = []
    for (let i = 0; i < arr.length; i += size)
      chunks.push(arr.slice(i, i + size))
    return chunks.length ? chunks : [[]]
  }

  const container = new ContainerBuilder()
    .setAccentColor(corTaxa)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `# 📊 RELATÓRIO DE METAS — SEMANA ${agora.isoWeek()}/${agora.year()}`
    ))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `> 🏷️ **Modo:** ${modo === 'produto' ? '📦 Produto' : '💵 Dinheiro'}\n` +
      `> 📅 **Prazo:** ${prazoTs} (${prazoR})\n` +
      `> 💰 **Valor da meta:** ${fmtBRL(META_VALOR)}`
    ))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `> ✅ **Cumpriram:** ${cumpriram.length}\n` +
      `> ❌ **Não cumpriram:** ${naoCumpriram.length}\n` +
      `> 📈 **Taxa de cumprimento:** **${taxa}%**`
    ))
    .addSeparatorComponents(new SeparatorBuilder())

  // ── Bloco: Cumpriram
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `## ✅ Cumpriram (${cumpriram.length})`
  ))
  if (cumpriram.length === 0) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('> *Nenhum membro cumpriu a meta ainda.*'))
  } else {
    for (const chunk of chunked(cumpriram, 10))
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(chunk.join('\n')))
  }

  container.addSeparatorComponents(new SeparatorBuilder())

  // ── Bloco: Não Cumpriram
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
    `## ❌ Não Cumpriram (${naoCumpriram.length})`
  ))
  if (naoCumpriram.length === 0) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent('> *Todos os membros elegíveis cumpriram!* 🎉'))
  } else {
    for (const chunk of chunked(naoCumpriram, 10))
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(chunk.join('\n')))
  }

  container
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `-# 🔴 = possui cargo MS-13 ativo  •  Gerado em ${agora.format('DD/MM/YYYY HH:mm')} (BRT)  •  ${FOOTER_TEXT}`
    ))

  return container
}

// ─────────────────────────────────────────────
// gerarRelatorio — lógica central do relatório
// Destinos:
//   1. Ephemeral para quem clicou (some em 5 min via deleteReply)
//   2. Log permanente em CANAIS_METAS_IDS.relatorio
// ─────────────────────────────────────────────
async function gerarRelatorio(interaction) {
  const data = loadData()

  // FIX: checar meta ativa ANTES do defer — se não tiver meta, edita a reply com erro
  if (!data.meta_ativa) {
    if (interaction.deferred) {
      return interaction.editReply(buildRespostaV2(COLOR_ERROR, ['❌ Nenhuma meta ativa no momento.']))
    }
    return interaction.reply(buildRespostaV2(COLOR_ERROR, ['❌ Nenhuma meta ativa no momento.']))
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true })
  }

  const { guild } = interaction
  const meta      = data.meta_ativa
  const modo      = data.modo_pagamento || 'dinheiro'
  const agora     = moment().tz(BR_TZ)
  const { MS13_ROLE_ID } = require('../config/settings.js')

  await guild.members.fetch()

  // ── Separar aprovados por modo
  const cumpriramDinheiro = []
  const cumpriramProduto  = []

  for (const [mid, e] of Object.entries(data.entregas ?? {})) {
    if (e.status !== 'aprovado') continue
    const nomeFmt = `> **${e.nome ?? '?'}** — <@${mid}>`
    if (e.modo_pagamento === 'produto') {
      cumpriramProduto.push(`${nomeFmt} · 📦 ${e.rotas_produto ?? '?'} rota(s)`)
    } else {
      cumpriramDinheiro.push(`${nomeFmt} · 💵 ${fmtBRL(e.valor_pago ?? META_VALOR)}`)
    }
  }

  const cumpriram   = [...cumpriramDinheiro, ...cumpriramProduto]
  const pagaram_ids = Object.entries(data.entregas ?? {})
    .filter(([, e]) => e.status === 'aprovado')
    .map(([mid]) => mid)

  // ── Montar lista dos que NÃO cumpriram
  const naoCumpriram = []
  for (const [, m] of guild.members.cache) {
    if (m.user.bot) continue
    const cat = getCategoriaUsuario(m)
    if (!cat || cat === 'isento') continue
    if ((data.isentos_manuais ?? {})[m.id]) continue
    if (pagaram_ids.includes(m.id)) continue
    if (modo === 'produto' && cat === 'gerencia') continue
    const temMS13 = m.roles.cache.has(MS13_ROLE_ID) ? ' 🔴' : ''
    naoCumpriram.push(`> **${getNomeMta(m)}**${temMS13} — <@${m.id}>`)
  }

  const total  = cumpriram.length + naoCumpriram.length
  const taxa   = total > 0 ? ((cumpriram.length / total) * 100).toFixed(1) : '0.0'

  // ── Cor baseada na taxa
  let corTaxa = COLOR_ERROR
  if (parseFloat(taxa) >= 80)      corTaxa = COLOR_SUCCESS
  else if (parseFloat(taxa) >= 50) corTaxa = COLOR_WARNING

  const payload = { cumpriram, naoCumpriram, taxa, corTaxa, modo, meta, agora }

  // ── 1. Resposta ephemeral para quem clicou (some em 5 min)
  // FIX: não passar flags no editReply — herda o ephemeral do deferReply
  const containerEphemeral = _buildContainerRelatorio(payload)
  await interaction.editReply({
    components: [containerEphemeral],
    flags:      MessageFlags.IsComponentsV2,
  })
  setTimeout(() => interaction.deleteReply().catch(() => {}), 5 * 60 * 1000)

  // ── 2. Log permanente no canal de relatório
  try {
    const canalRel = await guild.channels.fetch(REC_CHANNEL_IDS.logs_relatorios_rec).catch(() => null)
    if (canalRel) {
      const containerLog = _buildContainerRelatorio(payload)
      await canalRel.send({ components: [containerLog], flags: MessageFlags.IsComponentsV2 })
    } else {
      console.error('[METAS] Canal de log de relatório não encontrado:', REC_CHANNEL_IDS.logs_relatorios_rec)
    }
  } catch (err) { console.error('[METAS] Erro ao enviar log do relatório:', err) }
}

function buildAprovarRecusarRow(memberId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`ap_${memberId}`).setLabel('✅ Aprovar').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`re_${memberId}`).setLabel('❌ Recusar').setStyle(ButtonStyle.Danger),
  )
}

// ─────────────────────────────────────────────
// Advertência automática ao vencer prazo da meta
// Prazo fixo das advs de meta: 48h após aplicação
// ─────────────────────────────────────────────
const ADV_META_PRAZO_MS = 48 * 60 * 60 * 1000 // 48 horas

async function aguardarEAplicarAdv(guild, prazoDt) {
  if (advTimeout) { clearTimeout(advTimeout); advTimeout = null }
  if (!prazoDt) return

  const delay = Math.max(new Date(prazoDt).getTime() - Date.now(), 0)

  advTimeout = setTimeout(async () => {
    const data = loadData()
    if (!data.meta_ativa || data.meta_ativa.adv_aplicada) return

    console.log('[METAS] Prazo encerrado — verificando membros...')
    let membros
    try { membros = await guild.members.fetch() }
    catch (err) { console.error('[METAS] Falha ao buscar membros:', err); return }

    data.meta_ativa.adv_aplicada = true
    saveData(data)

    const pagaram_ids = new Set(
      Object.entries(data.entregas || {})
        .filter(([, e]) => e.status === 'aprovado')
        .map(([id]) => id)
    )
    const isentos_ids = new Set(Object.keys(data.isentos_manuais || {}))
    const modo        = data.modo_pagamento || 'dinheiro'

    for (const [id, m] of membros) {
      if (m.user.bot) continue
      const cat = getCategoriaUsuario(m)
      if (!cat || cat === 'isento') continue
      if (modo === 'produto' && cat === 'gerencia') continue
      if (isentos_ids.has(id) || pagaram_ids.has(id)) continue

      try {
        // Usa aplicarAdvertencia() central com prazo fixo de 48h
        const { aplicarAdvertencia } = require('./advManager.js')
        await aplicarAdvertencia(
          guild,
          m,
          'Meta semanal não entregue no prazo.',
          'N/A',
          'Sistema',
          ADV_META_PRAZO_MS,
        )
      } catch (err) { console.error(`[METAS] Erro ao aplicar adv para ${id}:`, err) }

      // Rate-limit: 500ms entre aplicações para evitar flood na API do Discord
      await new Promise(r => setTimeout(r, 500))
    }
    console.log('[METAS] Advertências de meta aplicadas.')
  }, delay)
}

// ─────────────────────────────────────────────
// customIds
// ─────────────────────────────────────────────
const customIds = [
  'painel_solicitar', 'painel_lembrete',  'painel_prazo',    'painel_isentar',
  'painel_cancelar',  'painel_relatorio', 'painel_resetar',  'painel_isentos',
  'painel_toggle_modo', 'entregar_meta_btn',
  'modal_solicitar_meta', 'modal_lembrete', 'modal_alterar_prazo',
  'modal_entregar_comprovante_', 'modal_isentar_motivo',
  'meta_select_isentar', 'meta_confirmar_',
  'meta_gerar_relatorio_canal',
  'ap_', 're_',
]

// ─────────────────────────────────────────────
// execute
// ─────────────────────────────────────────────
async function execute(interaction) {
  const { customId, guild, member } = interaction

  const painelStaffIds = [
    'painel_solicitar', 'painel_lembrete', 'painel_prazo', 'painel_isentar',
    'painel_cancelar',  'painel_relatorio','painel_resetar','painel_toggle_modo',
  ]
  if (painelStaffIds.includes(customId) && !isStaff(member)) {
    if (interaction.replied || interaction.deferred) return
    return interaction.reply(buildRespostaV2(COLOR_ERROR, ['❌ Apenas Administradores, Diretoria ou Gerente Geral.']))
  }

  // ── painel_solicitar
  if (customId === 'painel_solicitar') {
    const modal = new ModalBuilder()
      .setCustomId('modal_solicitar_meta')
      .setTitle('📋 Solicitar Entrega de Meta')
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('prazo_input')
          .setLabel('Prazo (DD/MM/AAAA HH:MM)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: 20/06/2025 23:59')
      )
    )
    return interaction.showModal(modal)
  }

  // ── painel_lembrete
  if (customId === 'painel_lembrete') {
    const data = loadData()
    if (!data.meta_ativa) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_ERROR, ['❌ Nenhuma meta ativa.']))
    }
    const modal = new ModalBuilder()
      .setCustomId('modal_lembrete')
      .setTitle('📣 Criar Lembrete de Meta')
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('canal_id')
          .setLabel('ID do canal (vazio = canal de entrega)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('Ex: 1469092035796664361')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('observacao')
          .setLabel('Observação extra (opcional)')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setPlaceholder('Aparece no lembrete se preenchida')
      )
    )
    return interaction.showModal(modal)
  }

  // ── painel_prazo
  if (customId === 'painel_prazo') {
    const data = loadData()
    if (!data.meta_ativa) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_ERROR, ['❌ Nenhuma meta ativa.']))
    }
    const modal = new ModalBuilder()
      .setCustomId('modal_alterar_prazo')
      .setTitle('🗓️ Alterar Prazo da Meta')
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('novo_prazo')
          .setLabel('Novo prazo (DD/MM/AAAA HH:MM)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: 10/06/2025 22:00')
      )
    )
    return interaction.showModal(modal)
  }

  // ── painel_isentar
  if (customId === 'painel_isentar') {
    const data = loadData()
    if (!data.meta_ativa) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_ERROR, ['❌ Nenhuma meta ativa.']))
    }
    const select = new UserSelectMenuBuilder()
      .setCustomId('meta_select_isentar')
      .setPlaceholder('Selecione o membro a isentar')
      .setMinValues(1).setMaxValues(1)

    const container = new ContainerBuilder()
      .setAccentColor(COLOR_MS13)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🛡️ Isentar Membro'))
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        'Selecione o membro que deseja isentar desta meta.'
      ))
      .addSeparatorComponents(new SeparatorBuilder())
      .addActionRowComponents(new ActionRowBuilder().addComponents(select))

    if (interaction.replied || interaction.deferred) return
    return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral })
  }

  // ── meta_select_isentar
  if (customId === 'meta_select_isentar') {
    isentarContextMap.set(interaction.user.id, interaction.values[0])
    const modal = new ModalBuilder()
      .setCustomId('modal_isentar_motivo')
      .setTitle('🛡️ Motivo da Isenção')
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('motivo_input')
          .setLabel('Motivo')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(200)
          .setPlaceholder('Ex: Viagem, problema pessoal...')
      )
    )
    return interaction.showModal(modal)
  }

  // ── painel_cancelar
  if (customId === 'painel_cancelar') {
    const data = loadData()
    if (!data.meta_ativa) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_ERROR, ['❌ Nenhuma meta ativa.']))
    }
    try {
      const ch = await guild.channels.fetch(CANAIS_METAS_IDS.entregar).catch(() => null)
      if (ch && data.meta_ativa.msg_entregar_id) {
        const msg = await ch.messages.fetch(data.meta_ativa.msg_entregar_id).catch(() => null)
        if (msg) await msg.delete().catch(() => {})
      }
    } catch {}

    if (advTimeout) { clearTimeout(advTimeout); advTimeout = null }
    data.meta_ativa      = null
    data.entregas        = {}
    data.isentos_manuais = {}
    saveData(data)

    if (interaction.replied || interaction.deferred) return
    return interaction.reply(buildRespostaV2(COLOR_SUCCESS, ['✅ Meta cancelada com sucesso.']))
  }

  // ── meta_gerar_relatorio_canal (botão do painel fixo no canal de relatório)
  if (customId === 'meta_gerar_relatorio_canal') {
    if (!isStaff(member)) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_ERROR, ['❌ Apenas Administradores, Diretoria ou Gerente Geral.']))
    }
    await interaction.deferReply({ ephemeral: true })
    return gerarRelatorio(interaction)
  }

  // ── painel_relatorio
  if (customId === 'painel_relatorio') {
    await interaction.deferReply({ ephemeral: true })
    return gerarRelatorio(interaction)
  }

  // ── painel_resetar
  if (customId === 'painel_resetar') {
    const data = loadData()
    if (data.meta_ativa) {
      if (!data.historico) data.historico = []
      data.historico.push({ meta: data.meta_ativa, entregas: data.entregas || {}, data_reset: new Date().toISOString() })
    }
    if (advTimeout) { clearTimeout(advTimeout); advTimeout = null }
    data.meta_ativa      = null
    data.entregas        = {}
    data.isentos_manuais = {}
    saveData(data)
    if (interaction.replied || interaction.deferred) return
    return interaction.reply(buildRespostaV2(COLOR_SUCCESS, ['✅ Dados resetados. Histórico mantido.']))
  }

  // ── painel_isentos
  if (customId === 'painel_isentos') {
    const data    = loadData()
    const entries = Object.entries(data.isentos_manuais || {})
    if (!entries.length) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_INFO, ['📋 Nenhum membro isento manualmente.']))
    }
    const linhas = entries.map(([, info]) => {
      let dataFmt = '?'
      try { dataFmt = moment(info.data).tz(BR_TZ).format('DD/MM/YYYY') } catch {}
      return `• **${info.nome}** — ${info.motivo}\n  └ por ${info.isento_por ?? '?'} · ${dataFmt}`
    })
    const container = new ContainerBuilder()
      .setAccentColor(COLOR_SUCCESS)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 🛡️ Membros Isentos'))
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(linhas.join('\n')))
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${FOOTER_TEXT}`))
    if (interaction.replied || interaction.deferred) return
    return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral })
  }

  // ── painel_toggle_modo
  if (customId === 'painel_toggle_modo') {
    const data     = loadData()
    const novoModo = (data.modo_pagamento || 'dinheiro') === 'dinheiro' ? 'produto' : 'dinheiro'
    data.modo_pagamento = novoModo
    saveData(data)

    const { container, flags } = buildPainelV2(novoModo)
    try { await interaction.update({ components: [container], flags }) }
    catch (err) { console.error('[METAS] toggle_modo erro:', err) }

    if (data.meta_ativa) {
      try {
        const ch = await guild.channels.fetch(CANAIS_METAS_IDS.entregar).catch(() => null)
        if (ch && data.meta_ativa.msg_entregar_id) {
          const msg = await ch.messages.fetch(data.meta_ativa.msg_entregar_id).catch(() => null)
          if (msg) await msg.edit(buildMetaAtivaV2(new Date(data.meta_ativa.prazo_iso), novoModo))
        }
      } catch (err) { console.error('[METAS] toggle_modo erro canal entrega:', err) }
    }

    try {
      await interaction.followUp({
        content: `✅ Modo alterado para **${novoModo === 'produto' ? '📦 PRODUTO' : '💵 DINHEIRO'}**!`,
        ephemeral: true,
      })
    } catch {}
    return
  }

  // ──────────────────────────────────────────
  // CANAL DE ENTREGA
  // ──────────────────────────────────────────

  if (customId === 'entregar_meta_btn') {
    const data = loadData()
    if (!data.meta_ativa) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_ERROR, ['❌ Nenhuma meta ativa no momento.']))
    }

    const cat = getCategoriaUsuario(member)

    if (cat === 'isento') {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_SUCCESS, [
        '## ✅ Você está isento!',
        `> 🎖️ **Cargo:** ${getCargoNome(member)}\n> Seu cargo está isento de metas.`,
      ]))
    }

    const isentoInfo = (data.isentos_manuais || {})[member.id]
    if (isentoInfo) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_SUCCESS, [
        '## ✅ Você está isento desta meta!',
        `> **Motivo:** ${isentoInfo.motivo}`,
      ]))
    }

    if (!cat) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_ERROR, ['❌ Cargo não reconhecido pelo sistema.']))
    }

    const entrega = (data.entregas || {})[member.id]
    if (entrega?.status === 'aguardando') {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_INFO, ['⏳ Seu comprovante já está aguardando aprovação.']))
    }
    if (entrega?.status === 'aprovado') {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_SUCCESS, ['✅ Sua meta já foi aprovada!']))
    }

    const modo      = data.modo_pagamento || 'dinheiro'
    const cargoNome = getCargoNome(member)
    const prazoTs   = data.meta_ativa.prazo_iso
      ? Math.floor(new Date(data.meta_ativa.prazo_iso).getTime() / 1000)
      : null
    const prazoStr  = prazoTs ? `<t:${prazoTs}:F> (<t:${prazoTs}:R>)` : 'Indefinido'

    // Modo produto
    if (modo === 'produto') {
      const rotas = getRotasParaCategoria(cat)
      if (rotas === 0) {
        if (interaction.replied || interaction.deferred) return
        return interaction.reply(buildRespostaV2(COLOR_SUCCESS, [
          '## ✅ Isento no Modo Produto',
          `> 🎖️ **Cargo:** ${cargoNome}\n> Seu cargo está isento no modo produto.`,
        ]))
      }
      const container = new ContainerBuilder()
        .setAccentColor(COLOR_SUCCESS)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 📦 Entregar Meta — Modo Produto'))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `> 🎖️ **Cargo:** ${cargoNome}\n` +
          `> 📦 **Meta:** ${rotas} rota(s) completa(s)\n` +
          `> ⏰ **Prazo:** ${prazoStr}`
        ))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `**Composição de 1 rota:**\n> ${PRODUTOS_META_CURTO}`
        ))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          '📎 Clique em **Continuar** e envie o link do print dos produtos entregues.'
        ))
        .addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`meta_confirmar_${member.id}_${cat}_0_produto`)
            .setLabel('Continuar →')
            .setStyle(ButtonStyle.Success)
        ))
      if (interaction.replied || interaction.deferred) return
      return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral })
    }

    // Modo dinheiro
    const valorPagar = getValorParaCategoria(cat)
    const pctMap     = {
      [Math.floor(META_VALOR * 0.75)]: '75%',
      [Math.floor(META_VALOR * 0.50)]: '50%',
      [META_VALOR]:                    '100%',
    }
    const pct = pctMap[valorPagar] ?? '?%'

    const container = new ContainerBuilder()
      .setAccentColor(COLOR_MS13)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('## 💰 Entregar Meta — Modo Dinheiro'))
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `> 🎖️ **Cargo:** ${cargoNome}\n` +
        `> 💵 **Seu valor:** ${fmtBRL(valorPagar)} *(${pct} da meta)*\n` +
        `> 💰 **Meta total:** ${fmtBRL(META_VALOR)}\n` +
        `> ⏰ **Prazo:** ${prazoStr}`
      ))
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '📎 Clique em **Continuar** e envie o link ou print do comprovante de pagamento.'
      ))
      .addSeparatorComponents(new SeparatorBuilder())
      .addActionRowComponents(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`meta_confirmar_${member.id}_${cat}_${valorPagar}_dinheiro`)
          .setLabel('Continuar →')
          .setStyle(ButtonStyle.Success)
      ))

    if (interaction.replied || interaction.deferred) return
    return interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral })
  }

  // ── meta_confirmar_
  if (customId.startsWith('meta_confirmar_')) {
    const parts      = customId.split('_')
    const memberId   = parts[2]
    const cat        = parts[3]
    const valorPagar = parseInt(parts[4], 10)
    const modo       = parts[5]

    const modal = new ModalBuilder()
      .setCustomId(`modal_entregar_comprovante_${memberId}_${cat}_${valorPagar}_${modo}`)
      .setTitle(modo === 'produto' ? '📦 Comprovante de Produto' : '💰 Comprovante de Meta')
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('comprovante_link')
          .setLabel(modo === 'produto' ? 'Link do print dos produtos entregues' : 'Link do comprovante de pagamento')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('https://...')
      )
    )
    return interaction.showModal(modal)
  }

  // ──────────────────────────────────────────
  // APROVAR / RECUSAR
  // ──────────────────────────────────────────

  if (customId.startsWith('ap_')) {
    if (!isStaff(member)) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_ERROR, ['❌ Sem permissão.']))
    }
    const targetId = customId.slice(3)
    const data     = loadData()

    if (!data.entregas?.[targetId]) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_ERROR, ['❌ Entrega não encontrada.']))
    }

    const entrega = data.entregas[targetId]
    if (entrega.status === 'aprovado') {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_WARNING, ['⚠️ Esta meta já foi aprovada.']))
    }

    entrega.status         = 'aprovado'
    entrega.aprovado_por   = member.user.tag
    entrega.data_aprovacao = new Date().toISOString()
    saveData(data)

    const modo      = entrega.modo_pagamento || 'dinheiro'
    const infoValor = modo === 'produto'
      ? `> 📦 **Modo:** Produto\n> 🔢 **Rotas:** ${entrega.rotas_produto ?? 2} rota(s)`
      : `> 💰 **Meta:** ${fmtBRL(META_VALOR)}\n> 💵 **Pago:** ${fmtBRL(entrega.valor_pago ?? META_VALOR)}`

    // Container que fica na mensagem do canal entregues (sem botão)
    const containerAprov = new ContainerBuilder()
      .setAccentColor(COLOR_SUCCESS)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ✅ Meta Aprovada'))
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `> 👤 **Membro:** ${entrega.nome ?? '?'}\n` +
        `> 🎖️ **Cargo:** ${entrega.cargo_nome ?? '?'}\n` +
        `> 💬 **Discord:** ${entrega.discord ?? '?'}`
      ))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoValor))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `> 📎 **Comprovante:** [Ver](${entrega.comprovante})\n` +
        `> ✅ **Aprovado por:** ${entrega.aprovado_por}`
      ))
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `> 💰 **Meta paga** · ${moment().tz(BR_TZ).format('DD/MM/YYYY [às] HH:mm')}`
      ))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# Aprovado por ${entrega.aprovado_por}`
      ))

    try {
      await interaction.message.edit({ components: [containerAprov], flags: MessageFlags.IsComponentsV2, embeds: [], content: '' })
    } catch {}

    // Log no canal logs_meta
    try {
      const canalLog = await guild.channels.fetch(CHANNEL_IDS.logs_meta).catch(() => null)
      if (canalLog) {
        const logValor = modo === 'produto'
          ? `> 📦 **Modo:** Produto · **Rotas:** ${entrega.rotas_produto ?? 2}`
          : `> 💰 **Valor pago:** ${fmtBRL(entrega.valor_pago ?? META_VALOR)}`
        const containerLog = new ContainerBuilder()
          .setAccentColor(COLOR_SUCCESS)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('## ✅ Meta Aprovada — Log'))
          .addSeparatorComponents(new SeparatorBuilder())
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `> 👤 **Membro:** ${entrega.nome ?? '?'} (<@${targetId}>)\n` +
            `> 🎖️ **Cargo:** ${entrega.cargo_nome ?? '?'}\n` +
            logValor + '\n' +
            `> 📎 **Comprovante:** [Ver aqui](${entrega.comprovante})\n` +
            `> ✅ **Aprovado por:** ${entrega.aprovado_por}`
          ))
          .addSeparatorComponents(new SeparatorBuilder())
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `-# MS-13 Management · Sistema de Metas · ${moment().tz(BR_TZ).format('DD/MM/YYYY HH:mm')}`
          ))
        await canalLog.send({ components: [containerLog], flags: MessageFlags.IsComponentsV2 })
      }
    } catch (err) { console.error('[METAS] Erro ao enviar log de aprovação:', err) }

    // DM pro membro
    try {
      const targetMember = await guild.members.fetch(targetId).catch(() => null)
      if (targetMember) {
        const dmDesc = modo === 'produto'
          ? `📦 **Modo:** Produto\n🔢 **Rotas:** ${entrega.rotas_produto ?? 2}\n✅ **Aprovado por:** ${entrega.aprovado_por}`
          : `💵 **Pago:** ${fmtBRL(entrega.valor_pago ?? META_VALOR)}\n✅ **Aprovado por:** ${entrega.aprovado_por}`
        await targetMember.send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLOR_SUCCESS)
              .setTitle('✅ Sua meta foi aprovada!')
              .setDescription(dmDesc)
              .setFooter({ text: FOOTER_TEXT })
              .setTimestamp()
          ]
        }).catch(() => {})
      }
    } catch {}

    if (interaction.replied || interaction.deferred) return
    return interaction.reply(buildRespostaV2(COLOR_SUCCESS, [`✅ Meta de <@${targetId}> aprovada.`]))
  }

  if (customId.startsWith('re_')) {
    if (!isStaff(member)) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_ERROR, ['❌ Sem permissão.']))
    }
    const targetId = customId.slice(3)
    const data     = loadData()

    if (!data.entregas?.[targetId]) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_ERROR, ['❌ Entrega não encontrada.']))
    }

    data.entregas[targetId].status = 'recusado'
    saveData(data)
    const entrega = data.entregas[targetId]

    const containerRecusa = new ContainerBuilder()
      .setAccentColor(COLOR_ERROR)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('# ❌ Meta Recusada'))
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `> 👤 **Membro:** ${entrega.nome ?? '?'}\n` +
        `> 🎖️ **Cargo:** ${entrega.cargo_nome ?? '?'}\n` +
        `> 💬 **Discord:** ${entrega.discord ?? '?'}\n` +
        `> 📎 **Comprovante:** [Ver](${entrega.comprovante})\n` +
        `> ❌ **Recusado por:** ${member.user.tag}`
      ))
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '-# O membro pode reenviar o comprovante clicando em Entregar Meta.'
      ))

    try {
      await interaction.message.edit({ components: [containerRecusa], flags: MessageFlags.IsComponentsV2, embeds: [], content: '' })
    } catch {}

    // Log no canal logs_meta
    try {
      const canalLog = await guild.channels.fetch(CHANNEL_IDS.logs_meta).catch(() => null)
      if (canalLog) {
        const containerLog = new ContainerBuilder()
          .setAccentColor(COLOR_ERROR)
          .addTextDisplayComponents(new TextDisplayBuilder().setContent('## ❌ Meta Recusada — Log'))
          .addSeparatorComponents(new SeparatorBuilder())
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `> 👤 **Membro:** ${entrega.nome ?? '?'} (<@${targetId}>)\n` +
            `> 🎖️ **Cargo:** ${entrega.cargo_nome ?? '?'}\n` +
            `> 📎 **Comprovante:** [Ver aqui](${entrega.comprovante})\n` +
            `> ❌ **Recusado por:** ${member.user.tag}`
          ))
          .addSeparatorComponents(new SeparatorBuilder())
          .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `-# MS-13 Management · Sistema de Metas · ${moment().tz(BR_TZ).format('DD/MM/YYYY HH:mm')}`
          ))
        await canalLog.send({ components: [containerLog], flags: MessageFlags.IsComponentsV2 })
      }
    } catch (err) { console.error('[METAS] Erro ao enviar log de recusa:', err) }

    // DM pro membro
    try {
      const targetMember = await guild.members.fetch(targetId).catch(() => null)
      if (targetMember) {
        await targetMember.send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLOR_ERROR)
              .setTitle('❌ Comprovante recusado')
              .setDescription(`Seu comprovante foi **recusado**.\nEnvie novamente pelo botão no canal de entrega.\n**Recusado por:** ${member.user.tag}`)
              .setFooter({ text: FOOTER_TEXT })
              .setTimestamp()
          ]
        }).catch(() => {})
      }
    } catch {}

    if (interaction.replied || interaction.deferred) return
    return interaction.reply(buildRespostaV2(COLOR_ERROR, [`❌ Meta de <@${targetId}> recusada.`]))
  }

  // ──────────────────────────────────────────
  // MODAIS
  // ──────────────────────────────────────────

  if (customId === 'modal_solicitar_meta') {
    const prazoRaw = interaction.fields.getTextInputValue('prazo_input').trim()
    const prazoDt  = moment.tz(prazoRaw, 'DD/MM/YYYY HH:mm', true, BR_TZ).toDate()

    if (isNaN(prazoDt.getTime())) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_ERROR, ['❌ Formato inválido. Use: DD/MM/AAAA HH:MM']))
    }

    const data = loadData()
    if (data.meta_ativa) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_ERROR, ['❌ Já existe uma meta ativa!']))
    }

    data.meta_ativa = {
      valor:           META_VALOR,
      prazo_iso:       prazoDt.toISOString(),
      solicitado_por:  member.user.tag,
      msg_entregar_id: null,
      adv_aplicada:    false,
    }
    data.entregas        = {}
    data.isentos_manuais = {}
    saveData(data)

    try {
      const ch = await guild.channels.fetch(CANAIS_METAS_IDS.entregar).catch(() => null)
      if (ch) {
        // Apaga mensagem anterior do bot se existir
        const msgs   = await ch.messages.fetch({ limit: 20 }).catch(() => null)
        const botMsg = msgs?.find(m => m.author.id === guild.client.user.id)
        if (botMsg) await botMsg.delete().catch(() => {})

        const msg = await ch.send(buildMetaAtivaV2(prazoDt, data.modo_pagamento || 'dinheiro'))
        data.meta_ativa.msg_entregar_id = msg.id
        saveData(data)
      }
    } catch (err) { console.error('[METAS] Erro ao publicar meta:', err) }

    aguardarEAplicarAdv(guild, prazoDt)

    if (interaction.replied || interaction.deferred) return
    return interaction.reply(buildRespostaV2(COLOR_SUCCESS, [
      '## ✅ Meta criada!',
      `> 📅 **Prazo:** ${moment(prazoDt).tz(BR_TZ).format('DD/MM/YYYY [às] HH:mm')}`,
    ]))
  }

  if (customId === 'modal_lembrete') {
    const data = loadData()
    if (!data.meta_ativa) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_ERROR, ['❌ Nenhuma meta ativa.']))
    }

    const canalIdRaw  = interaction.fields.getTextInputValue('canal_id').trim()
    const observacao  = interaction.fields.getTextInputValue('observacao').trim()
    const prazoTs     = Math.floor(new Date(data.meta_ativa.prazo_iso).getTime() / 1000)
    const modo        = data.modo_pagamento || 'dinheiro'

    // Resolve o canal — tenta o ID fornecido, fallback = canal entregar, fallback final = geral
    let canalAlvo = null
    if (canalIdRaw) {
      canalAlvo = await guild.channels.fetch(canalIdRaw).catch(() => null)
    }
    if (!canalAlvo) {
      canalAlvo = await guild.channels.fetch(CANAIS_METAS_IDS.entregar).catch(() => null)
    }
    if (!canalAlvo) {
      canalAlvo = await guild.channels.fetch(CANAIS_METAS_IDS.geral).catch(() => null)
    }

    if (!canalAlvo) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_ERROR, ['❌ Canal não encontrado. Verifique o ID informado.']))
    }

    const accentColor = modo === 'produto' ? COLOR_SUCCESS : COLOR_WARNING
    const titulo      = modo === 'produto' ? '⏰ Lembrete — Modo Produto' : '⏰ Lembrete de Meta'

    const descPadrao =
      (modo !== 'produto' ? `💰 **Meta:** ${fmtBRL(META_VALOR)}\n` : '') +
      `📅 **Prazo:** <t:${prazoTs}:F>\n` +
      `⏰ **Falta:** <t:${prazoTs}:R>\n\n` +
      `⚠️ Não esqueça de entregar seu comprovante no canal de entregas!`

    const containerLembrete = new ContainerBuilder()
      .setAccentColor(accentColor)
      // @everyone como TextDisplay (content não pode coexistir com IsComponentsV2)
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('@everyone'))
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${titulo}`))
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(descPadrao))

    // Observação extra — só aparece se preenchida
    if (observacao) {
      containerLembrete
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `📢 **Observação:**\n> ${observacao}`
        ))
    }

    containerLembrete
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# MS-13 Management · Sistema de Metas`
      ))

    try {
      await canalAlvo.send({
        components: [containerLembrete],
        flags:      MessageFlags.IsComponentsV2,
      })
    } catch (err) {
      console.error('[METAS] Erro ao enviar lembrete:', err)
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_ERROR, [`❌ Erro ao enviar no canal <#${canalAlvo.id}>.`]))
    }

    if (interaction.replied || interaction.deferred) return
    return interaction.reply(buildRespostaV2(COLOR_SUCCESS, [
      `✅ Lembrete enviado em <#${canalAlvo.id}>!`,
    ]))
  }

  if (customId === 'modal_alterar_prazo') {
    const novoPrazoRaw = interaction.fields.getTextInputValue('novo_prazo').trim()
    const novoPrazoDt  = moment.tz(novoPrazoRaw, 'DD/MM/YYYY HH:mm', true, BR_TZ).toDate()

    if (isNaN(novoPrazoDt.getTime())) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_ERROR, ['❌ Formato inválido. Use: DD/MM/AAAA HH:MM']))
    }

    const data = loadData()
    if (!data.meta_ativa) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_ERROR, ['❌ Nenhuma meta ativa.']))
    }

    data.meta_ativa.prazo_iso = novoPrazoDt.toISOString()
    saveData(data)
    aguardarEAplicarAdv(guild, novoPrazoDt)

    try {
      const ch = await guild.channels.fetch(CANAIS_METAS_IDS.entregar).catch(() => null)
      if (ch && data.meta_ativa.msg_entregar_id) {
        const msg = await ch.messages.fetch(data.meta_ativa.msg_entregar_id).catch(() => null)
        if (msg) await msg.edit(buildMetaAtivaV2(novoPrazoDt, data.modo_pagamento || 'dinheiro'))
      }
    } catch {}

    if (interaction.replied || interaction.deferred) return
    return interaction.reply(buildRespostaV2(COLOR_SUCCESS, [
      `✅ Prazo alterado para **${moment(novoPrazoDt).tz(BR_TZ).format('DD/MM/YYYY [às] HH:mm')}**!`,
    ]))
  }

  if (customId === 'modal_isentar_motivo') {
    const targetId = isentarContextMap.get(interaction.user.id)
    isentarContextMap.delete(interaction.user.id)

    if (!targetId) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_ERROR, ['❌ Sessão expirada. Tente novamente.']))
    }

    const motivo       = interaction.fields.getTextInputValue('motivo_input').trim()
    const data         = loadData()
    const targetMember = await guild.members.fetch(targetId).catch(() => null)

    if (!targetMember) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_ERROR, ['❌ Membro não encontrado.']))
    }

    const nomeMta = getNomeMta(targetMember)
    if (!data.isentos_manuais) data.isentos_manuais = {}
    data.isentos_manuais[targetId] = {
      nome:       nomeMta,
      motivo,
      data:       new Date().toISOString(),
      isento_por: member.user.tag,
    }
    saveData(data)

    try {
      await targetMember.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR_SUCCESS)
            .setTitle('✅ Você foi isento desta meta!')
            .setDescription(`**Motivo:** ${motivo}\n**Isento por:** ${member.user.tag}`)
            .setFooter({ text: FOOTER_TEXT })
        ]
      }).catch(() => {})
    } catch {}

    if (interaction.replied || interaction.deferred) return
    return interaction.reply(buildRespostaV2(COLOR_SUCCESS, [
      `✅ **${nomeMta}** foi isento desta meta!`,
      `> **Motivo:** ${motivo}`,
    ]))
  }

  if (customId.startsWith('modal_entregar_comprovante_')) {
    const parts      = customId.split('_')
    const memberId   = parts[3]
    const cat        = parts[4]
    const valorPagar = parseInt(parts[5], 10)
    const modo       = parts[6]

    const link = interaction.fields.getTextInputValue('comprovante_link').trim()
    const data = loadData()

    if (!data.meta_ativa) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_ERROR, ['❌ Nenhuma meta ativa no momento.']))
    }

    const targetMember = await guild.members.fetch(memberId).catch(() => null)
    if (!targetMember) {
      if (interaction.replied || interaction.deferred) return
      return interaction.reply(buildRespostaV2(COLOR_ERROR, ['❌ Erro ao identificar membro.']))
    }

    const nomeMta   = getNomeMta(targetMember)
    const cargoNome = getCargoNome(targetMember)
    const rotas     = modo === 'produto' ? getRotasParaCategoria(cat) : null

    if (!data.entregas) data.entregas = {}
    data.entregas[memberId] = {
      nome:           nomeMta,
      discord:        `@${targetMember.user.username}`,
      comprovante:    link,
      status:         'aguardando',
      valor_meta:     META_VALOR,
      valor_pago:     valorPagar,
      categoria:      cat,
      cargo_nome:     cargoNome,
      modo_pagamento: modo,
      rotas_produto:  rotas,
      data_entrega:   new Date().toISOString(),
      msg_id:         null,
    }
    saveData(data)

    const infoValor = modo === 'produto'
      ? `> 📦 **Modo:** Produto\n> 🔢 **Rotas:** ${rotas} rota(s)`
      : `> 💰 **Meta:** ${fmtBRL(META_VALOR)}\n> 💵 **Valor:** ${fmtBRL(valorPagar)}`

    // ── Botões da log de entrega ──────────────────────────────────────
    const rowEntregues = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ap_${memberId}`)
        .setLabel('✅ Aprovar')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`re_${memberId}`)
        .setLabel('❌ Recusar')
        .setStyle(ButtonStyle.Danger),
    )

    const containerEntrega = new ContainerBuilder()
      .setAccentColor(COLOR_WARNING)
      // Menção DENTRO do container — content não funciona com IsComponentsV2
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`<@${memberId}> — Nova entrega de meta!`))
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent('# 📋 Entrega Aguardando Aprovação'))
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `> 👤 **Membro:** ${nomeMta}\n` +
        `> 🎖️ **Cargo:** ${cargoNome}\n` +
        `> 💬 **Discord:** <@${memberId}>`
      ))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(infoValor))
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `> 📎 **Comprovante:** [Ver aqui](${link})`
      ))
      .addSeparatorComponents(new SeparatorBuilder())
      .addActionRowComponents(rowEntregues)
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# ⌛ Aguardando aprovação · ${moment().tz(BR_TZ).format('DD/MM/YYYY HH:mm')}`
      ))

    try {
      const canalEntregues = await guild.channels.fetch(CANAIS_METAS_IDS.entregues).catch(() => null)
      if (canalEntregues) {
        // IMPORTANTE: IsComponentsV2 ignora content — não passar content aqui
        const msgEntregue = await canalEntregues.send({
          components: [containerEntrega],
          flags:      MessageFlags.IsComponentsV2,
        })
        data.entregas[memberId].msg_id = msgEntregue.id
        saveData(data)
      } else {
        console.error('[METAS] Canal entregues não encontrado:', CANAIS_METAS_IDS.entregues)
      }
    } catch (err) { console.error('[METAS] Erro ao enviar entrega no canal entregues:', err) }

    if (interaction.replied || interaction.deferred) return
    return interaction.reply(buildRespostaV2(COLOR_SUCCESS, [
      '## ✅ Entrega enviada!',
      'Seu comprovante está aguardando aprovação.',
    ]))
  }
}

module.exports = { customIds, execute, aguardarEAplicarAdv, buildMetaAtivaV2, buildPainelV2, buildRelatorioPanel, gerarRelatorio }