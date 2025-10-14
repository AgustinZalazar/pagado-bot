import { createBot } from '@builderbot/bot'
import { MemoryDB as Database } from '@builderbot/bot'
import template from "./templates"
import { provider } from "./provider"


const PORT = process.env.PORT ?? 3030

const main = async () => {
    const adapterProvider = provider;
    const adapterDB = new Database()

    const { handleCtx, httpServer } = await createBot({
        flow: template,
        provider: adapterProvider,
        database: adapterDB,
    })

    httpServer(+PORT)
}

main()
