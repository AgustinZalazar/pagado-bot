
import "dotenv/config"
import { addKeyword, EVENTS } from '@builderbot/bot'
import { templateWithAI } from './templateWithAI'
import { templateWithOutAI } from './templateWithOutAI'
import { getUserData } from "~/cache/userCache"

const mainFlow = addKeyword([EVENTS.WELCOME])
    .addAction(async (ctx, { gotoFlow, provider, endFlow, flowDynamic, state }) => {
        try {
            console.log('--- Bot started ---')
            const number = ctx.from
            const userData = await getUserData(number, state);

            console.log(userData)
            const data = {
                name: "Usuario de Ejemplo",
            }
            // console.log(data)
            const dataIa = false
            if (!data) {
                return endFlow('⚠️ No estás registrado. Por favor regístrate aquí: https://link-de-ejemplo.com')
            }

            if (dataIa) {
                return gotoFlow(templateWithAI)
            } else {
                await flowDynamic(`👋${data.name} ¡Bienvenido a *Pagado*! `)
                return gotoFlow(templateWithOutAI)
            }

        } catch (err) {
            console.error('Error al verificar usuario:', err)
            await provider.sendMessage(ctx.from, '🚫 Hubo un error al verificar tu cuenta. Intenta más tarde.')
        }
    })


export { mainFlow }