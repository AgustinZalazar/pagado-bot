
import "dotenv/config"
import { addKeyword, EVENTS } from '@builderbot/bot'
import { templateWithAI } from './templateWithAI'
import { templateWithOutAI } from './templateWithOutAI'
import { getUserData } from "~/cache/userCache"
import { isAuthorizedForAI } from "~/config/authorizedNumbers"

const mainFlow = addKeyword([EVENTS.WELCOME])
    .addAction(async (ctx, { gotoFlow, provider, endFlow, flowDynamic, state }) => {
        try {
            console.log('--- Bot started ---')
            const number = ctx.from

            // Verificar si ya hay una sesión activa - si es así, NO mostrar bienvenida
            const activeSession = await state.get("activeSession");
            if (activeSession) {
                console.log('Session already active, skipping welcome message')
                return; // Simplemente no hacer nada, dejar que el flujo activo maneje el mensaje
            }

            const userData = await getUserData(number, state);
            userData.subscription = true // FORZAR SUSCRIPCIÓN PARA TESTING
            if (!userData) {
                return endFlow('⚠️ No estás registrado. Por favor regístrate aquí: https://pagado-app.com/es')
            }

            // Verificar si el número está autorizado para usar IA
            const hasAIAccess = isAuthorizedForAI(number);

            // Marcar sesión como activa
            await state.update({ activeSession: true });

            console.log(`Usuario: ${userData.name}, Suscripción: ${userData.subscription}, AI Access: ${hasAIAccess}, Tipo de mensaje: ${ctx.type}`);

            // Verificar si tiene suscripción Y está autorizado para usar IA
            if (userData.subscription && hasAIAccess) {
                await flowDynamic(`👋 ${userData.name} ¡Bienvenido a *Pagado*! 🤖✨\n\nPuedes enviarme mensajes directamente y procesaré tus gastos e ingresos automáticamente.`)
                return gotoFlow(templateWithAI)
            } else {
                if (userData.subscription && !hasAIAccess) {
                    await flowDynamic(`👋 ${userData.name} ¡Bienvenido a *Pagado*!\n\n⚠️ Tu número no tiene acceso a las funcionalidades de IA en este momento.`)
                } else {
                    await flowDynamic(`👋 ${userData.name} ¡Bienvenido a *Pagado*!`)
                }
                return gotoFlow(templateWithOutAI)
            }

        } catch (err) {
            console.error('Error al verificar usuario:', err)
            await provider.sendMessage(ctx.from, '🚫 Hubo un error al verificar tu cuenta. Intenta más tarde.')
        }
    })


export { mainFlow }