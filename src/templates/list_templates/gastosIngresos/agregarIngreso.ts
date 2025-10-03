import { addKeyword } from "@builderbot/bot";
import axios from "axios";

export const agregarIngreso = addKeyword("agregar_ingreso")
    .addAction(async (ctx, { state, provider, flowDynamic }) => {
        try {
            const number = ctx.from;
            const localNumber = number.slice(-10);

            // Obtener datos del usuario
            const { data } = await axios.get(`${process.env.API_URL}/user/phone/${localNumber}`, {
                headers: {
                    'Authorization': `Bearer ${process.env.API_SECRET_TOKEN}`,
                },
            });

            await state.update({ user: data });
            await state.update({ email: data.email });

            // Obtener categorías
            const categories = await axios.get(`${process.env.API_URL}/category?mail=${data.email}`, {
                headers: {
                    'Authorization': `Bearer ${process.env.API_SECRET_TOKEN}`,
                },
            });

            const listCategories = categories.data.formattedCategories

            if (!listCategories || listCategories.length === 0) {
                return await flowDynamic("⚠️ No tenés categorías cargadas. Agregá una categoría desde la web antes de continuar.");
            }

            const list = {
                header: { type: 'text', text: '🗂️ Categorías disponibles' },
                body: { text: 'Selecciona una categoría para tu ingreso:' },
                footer: { text: 'Pagado - Tu asistente financiero' },
                action: {
                    button: 'Ver categorías',
                    sections: [
                        {
                            title: 'Categorías',
                            rows: listCategories.map((cat) => ({
                                id: `categoria_ingreso_${cat.nombre}`,
                                title: cat.nombre,
                            }))
                        }
                    ]
                }
            };

            await provider.sendList(ctx.from, list);
        } catch (err) {
            console.error('Error al verificar usuario o cargar categorías:', err);
            await provider.sendMessage(ctx.from, '🚫 Error al verificar tu cuenta o cargar categorías.');
        }
    })// Capturar categoría seleccionada
    .addAction({ capture: true }, async (ctx, { state, flowDynamic }) => {
        const catName = ctx.body.replace("categoria_ingreso_", "");
        await state.update({ category: catName });

        return await flowDynamic("✍️ Ingresá los datos de la transaccion separados por coma:\n*Descripción, Monto, Moneda*\nEj: Sueldo, 200000, ARS");
    })

    // Capturar mensaje del usuario con los datos y hacer POST
    .addAction({ capture: true }, async (ctx, { state, flowDynamic }) => {
        const email = await state.get("email");
        const category = await state.get("category");
        console.log(ctx.body)

        const [description, type, rawAmount, currency] = ctx.body.split(",").map(s => s.trim());

        const amount = parseFloat(rawAmount.replace(",", "."));

        if (!description || !type || isNaN(amount) || !currency) {
            return await flowDynamic("❌ Formato inválido. Usá: Descripción, Monto, Moneda\nEj: Sueldo, 200000, ARS");
        }

        try {
            const date = new Date()
            const body = {
                id: "",
                description,
                type: "income",
                category,
                amount,
                date: date.toString(),
                currency,
                account: "test",
                method: "test"
            }

            const res = await axios.post(`${process.env.API_URL}/transaction?mail=${email}`, body, {
                headers: {
                    Authorization: `Bearer ${process.env.API_SECRET_TOKEN}`
                },
            });
        } catch (err) {
            console.error("Error al registrar ingreso:", err);
            return await flowDynamic("🚫 Hubo un error al registrar el ingreso. Verificá los datos o intentá más tarde.");
        }


        return await flowDynamic("✅ Transaccion registrada correctamente 🎉");
    });