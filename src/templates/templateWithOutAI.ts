import { addKeyword } from '@builderbot/bot'

const templateWithOutAI = addKeyword('__internal_template_sin_ia__')
    .addAction(async (ctx, { provider }) => {
        const list = {
            header: { type: 'text', text: '📊 Acciones disponibles' },
            body: { text: 'Selecciona una opción para continuar:' },
            footer: { text: 'Pagado - Tu asistente financiero' },
            action: {
                button: 'Ver opciones',
                sections: [
                    {
                        title: 'Opciones financieras',
                        rows: [
                            { id: 'ingresos', title: 'Ingresos', description: 'Consulta tus ingresos' },
                            { id: 'gastos', title: 'Gastos', description: 'Gestiona tus gastos' },
                            // { id: 'gastos_recurrentes', title: 'Gastos recurrentes', description: 'Suscripciones, servicios, etc.' },
                            // { id: 'deudas', title: 'Deudas', description: 'Revisa tus deudas actuales' },
                            // { id: 'ahorros', title: 'Ahorros', description: 'Tus metas de ahorro' },
                            // { id: 'inversiones', title: 'Inversiones', description: 'Tu portafolio de inversión' },
                        ]
                    }
                ]
            }
        }

        await provider.sendList(ctx.from, list)
    })


export { templateWithOutAI }