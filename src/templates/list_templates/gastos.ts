import { addKeyword } from "@builderbot/bot";

export const gastos = addKeyword("gastos")
    .addAction(async (ctx, { flowDynamic }) => {
        return await flowDynamic([
            {
                body: "💰 ¿Qué querés hacer con tus gastos?",
                buttons: [
                    {
                        body: "Consultar ultimo", // Activa el flujo con keyword: ultimo_gasto
                    },
                    {
                        body: "Agregar un gasto", // Activa el flujo con keyword: agregar_gasto
                    },
                ],
            },
        ]);
    });