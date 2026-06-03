// src/events/interactionCreate.js
// Roteador central — NÃO coloca lógica aqui, apenas roteia para o system correto.

'use strict'

module.exports = {
  name: 'interactionCreate',
  once: false,

  async execute(interaction, client, systemHandlers) {
    try {

      // ── Slash commands ───────────────────────────────────────────────────
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

      // Tenta match exato primeiro
      if (systemHandlers.has(customId)) {
        await systemHandlers.get(customId)(interaction, client)
        return
      }

      // IDs dinâmicos — match por prefixo
      // ap_ e re_ são prefixos de aprovação/reprovação de recrutamento
      const prefixos = ['ap_', 're_', 'ticket_', 'reg_', 'meta_', 'ger_']
      for (const prefixo of prefixos) {
        if (customId.startsWith(prefixo)) {
          const handler = systemHandlers.get(prefixo)
          if (handler) {
            await handler(interaction, client)
            return
          }
        }
      }

      console.warn(`[interactionCreate] Nenhum handler para customId: ${customId}`)

    } catch (err) {
      console.error('[interactionCreate] Erro ao processar interação:', err)

      // Tenta responder com erro sem crashar
      try {
        const payload = { content: '❌ Ocorreu um erro ao processar esta ação.', flags: 64 }
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload)
        } else {
          await interaction.reply(payload)
        }
      } catch {
        // Silencia erro de reply — interação pode ter expirado
      }
    }
  },
}
