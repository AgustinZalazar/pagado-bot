import { addKeyword } from "@builderbot/bot";

export const ingresos = addKeyword("ingresos")
    .addAction(async (ctx, { flowDynamic }) => {
        return await flowDynamic([
            {
                body: "💰 ¿Qué querés hacer con tus ingresos?",
                buttons: [
                    {
                        body: "Ultimo ingreso", // Activa el flujo con keyword: ultimo_gasto
                    },
                    {
                        body: "Agregar ingreso", // Activa el flujo con keyword: agregar_gasto
                    },
                ],
            },
        ]);
    });
