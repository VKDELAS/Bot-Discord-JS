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

      // Match exato primeiro
      if (systemHandlers.has(customId)) {
        await systemHandlers.get(customId)(interaction, client)
        return
      }

      // Match por prefixo (IDs dinâmicos: ap_userId, re_userId, rec_*, ticket_*, etc.)
      const prefixos = [
        'ap_', 're_',           // metas: aprovar/recusar
        'rec_', 'modal_',       // recrutamento
        'ticket_', 'reg_',      // outros
        'meta_', 'ger_',
        'sel_', 'sup_', 'eli_', 'par_',  // tickets
      ]

      for (const prefixo of prefixos) {
        if (customId.startsWith(prefixo)) {
          // Tenta match exato primeiro (já tentado acima), agora tenta handler do prefixo
          const handler = systemHandlers.get(prefixo)
          if (handler) {
            await handler(interaction, client)
            return
          }
          // Se não tem handler de prefixo, percorre todos os handlers para encontrar um que cubra
          // (os systems com customIds[] já registraram os IDs exatos, não prefixos)
          break
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
