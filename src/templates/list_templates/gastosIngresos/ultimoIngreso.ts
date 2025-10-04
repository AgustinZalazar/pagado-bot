import { addKeyword } from "@builderbot/bot";
import axios from "axios";
import { getUserData } from "~/cache/userCache";
import { renderFormattedAmount } from "~/helpers/formatedAmount";

export const ultimoIngreso = addKeyword("Ultimo ingreso").addAction(async (ctx, { provider, flowDynamic, state }) => {
    try {
        const number = ctx.from
        const userData = await getUserData(number, state);
        const date = new Date().toISOString();
        const currentDate = date.split("T")[0];
        const dataGastos = await axios.get(`${process.env.API_URL}/transaction?mail=${userData.email}&month=${currentDate}`, {
            headers: {
                'Authorization': `Bearer ${process.env.API_SECRET_TOKEN}`,
            },
        })
        const getLastIncome = (formattedTransactions) => {
            return formattedTransactions
                .filter(t => t.type === 'income')
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] || null;
        };
        if (!dataGastos.data?.formattedTransactions) {
            throw new Error('No se encontraron transacciones para el usuario.')
        }
        const lastIncome = getLastIncome(dataGastos.data.formattedTransactions)
        const formattedAmount = renderFormattedAmount(lastIncome.amount, lastIncome.currency, "income", "es")
        if (lastIncome) {
            return await flowDynamic(`🧾 *Último ingreso registrado*:
📝 *Descripción:* ${lastIncome.description}
📂 *Categoría:* ${lastIncome.category}
💸 *Monto:* ${formattedAmount}
🏦 *Cuenta:* ${lastIncome.account}
💳 *Método de pago:* ${lastIncome.method}`)
        } else {
            return await flowDynamic('🚫 No hay ingresos cargados este mes, por favor registre uno.');
        }

    } catch (err) {
        console.error('Error al obtener el ultimo ingreso:', err)
        await provider.sendMessage(ctx.from, '🚫 Hubo un error al obtener el ultimo ingreso. Intenta más tarde.')
    }
})