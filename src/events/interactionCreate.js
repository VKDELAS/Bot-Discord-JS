// src/events/interactionCreate.js
// Roteador central — NÃO coloca lógica aqui, apenas roteia para o system correto.
'use strict'

module.exports = {
  name: 'interactionCreate',
  once: false,

  async execute(interaction, client, systemHandlers) {
    try {

      // ── Slash commands ────────────────────────────────────────────────────
      if (interaction.isChatInputCommand()) {
        const cmd = client.commands.get(interaction.commandName)
        if (!cmd) {
          console.warn(`[interactionCreate] Slash command desconhecido: ${interaction.commandName}`)
          return
        }
        await cmd.execute(interaction, client)
        return
      }

      // ── Componentes: Button, StringSelect, UserSelect, ModalSubmit ────────
      const customId = interaction.customId
      if (!customId) return

      // ── Botão "✅ ADV Paga" — roteado diretamente (prefixo adv_paga_) ────
      if (customId.startsWith('adv_paga_')) {
        const { handleAdvPaga } = require('../systems/advManager')
        await handleAdvPaga(interaction, client)
        return
      }

      // ── Match exato — sempre tem prioridade máxima ────────────────────────
      if (systemHandlers.has(customId)) {
        await systemHandlers.get(customId)(interaction, client)
        return
      }

      // ── Match por prefixo (IDs dinâmicos: ap_userId, re_userId, etc.) ─────
      // IMPORTANTE: só aplica prefixo se a chave termina com '_' (separador),
      // evitando falso-positivo onde 'tkt_s' casaria com 'tkt_select_v14'.
      // Modais e selects estáticos (ex: tkt_select_v14, sup_modal_v14) NUNCA
      // devem cair aqui — eles têm match exato acima.
      let matched = false
      for (const [key, handler] of systemHandlers.entries()) {
        if (key.endsWith('_') && customId.startsWith(key)) {
          console.log(`[interactionCreate] Prefixo match: "${key}" → customId: "${customId}"`)
          await handler(interaction, client)
          matched = true
          break
        }
      }
      if (matched) return

      console.warn(`[interactionCreate] Nenhum handler para customId: ${customId}`)

    } catch (err) {
      console.error('[interactionCreate] Erro ao processar interação:', err)
      try {
        const payload = { content: '❌ Ocorreu um erro ao processar esta ação.', flags: 64 }
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload)
        } else {
          await interaction.reply(payload)
        }
      } catch {
        // Silencia — interação pode ter expirado
      }
    }
  },
}