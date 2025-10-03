import { addKeyword } from "@builderbot/bot";
import axios from "axios";
import { renderFormattedAmount } from "~/helpers/formatedAmount";

export const ultimoGasto = addKeyword("Consultar ultimo").addAction(async (ctx, { provider, flowDynamic }) => {
    try {
        const number = ctx.from
        const localNumber = number.slice(-10)
        const { data } = await axios.get(`${process.env.API_URL}/user/phone/${localNumber}`, {
            headers: {
                'Authorization': `Bearer ${process.env.API_SECRET_TOKEN}`,
            },
        })
        const date = new Date().toISOString();
        const currentDate = date.split("T")[0];
        const dataGastos = await axios.get(`${process.env.API_URL}/transaction?mail=${data.email}&month=${currentDate}`, {
            headers: {
                'Authorization': `Bearer ${process.env.API_SECRET_TOKEN}`,
            },
        })
        const getLastExpense = (formattedTransactions) => {
            return formattedTransactions
                .filter(t => t.type === 'expense')
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] || null;
        };
        if (!dataGastos.data?.formattedTransactions) {
            throw new Error('No se encontraron transacciones para el usuario.')
        }
        const lastExpense = getLastExpense(dataGastos.data.formattedTransactions)
        const formattedAmount = renderFormattedAmount(lastExpense.amount, lastExpense.currency, "expense", "es")
        if (lastExpense) {
            return await flowDynamic(`🧾 *Último gasto registrado*:
📝 *Descripción:* ${lastExpense.description}
📂 *Categoría:* ${lastExpense.category}
💸 *Monto:* ${formattedAmount}
🏦 *Cuenta:* ${lastExpense.account}
💳 *Método de pago:* ${lastExpense.method}`)
        } else {
            return await flowDynamic('🚫 No hay gastos cargados este mes, por favor registre uno.');
        }

    } catch (err) {
        console.error('Error al obtener el ultimo gasto:', err)
        await provider.sendMessage(ctx.from, '🚫 Hubo un error al obtener el ultimo gasto. Intenta más tarde.')
    }
})