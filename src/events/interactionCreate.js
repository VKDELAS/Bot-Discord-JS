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

      // Match exato primeiro
      if (systemHandlers.has(customId)) {
        await systemHandlers.get(customId)(interaction, client)
        return
      }

      // Match por prefixo (IDs dinâmicos: ap_userId, re_userId, ger_exo_cont_id, etc.)
      // Percorre todos os handlers registrados e testa se o customId começa com aquela chave.
      // Isso cobre qualquer prefixo dinâmico sem precisar manter lista manual de prefixos.
      for (const [key, handler] of systemHandlers.entries()) {
        if (customId.startsWith(key) && key !== customId) {
          await handler(interaction, client)
          return
        }
      }

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