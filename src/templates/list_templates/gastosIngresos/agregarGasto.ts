import { addKeyword } from "@builderbot/bot";
import axios from "axios";
import { getUserData, UserCache } from "~/cache/userCache";

export const agregarGasto = addKeyword("Agregar un gasto")
    .addAction(async (ctx, { state, provider, flowDynamic }) => {
        try {
            const number = ctx.from;
            const userData = await getUserData(number, state);

            // await state.update({ user: data });
            // await state.update({ email: data.email });

            // Obtener categorías
            // const categories = await axios.get(`${process.env.API_URL}/category?mail=${userData.email}`, {
            //     headers: {
            //         'Authorization': `Bearer ${process.env.API_SECRET_TOKEN}`,
            //     },
            // });

            // const listCategories = categories.data.formattedCategories

            if (!userData.categories || userData.categories.length === 0) {
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
                            rows: userData.categories.map((cat) => ({
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
    })// Paso 2: Captura de categoría y mostrar cuentas
    .addAnswer('', { capture: true }, async (ctx, { state, provider, flowDynamic }) => {
        const catName = ctx.body.replace("categoria_ingreso_", "");
        await state.update({ category: catName });
        const userCached: UserCache | null = await state.get("userCache");

        // const email = await state.get("email");
        try {
            // const { data: accountData } = await axios.get(`${process.env.API_URL}/accounts?mail=${email}`);

            // // console.log(accountData)
            // const listAccounts = accountData.formattedAccounts;

            if (!userCached.accounts?.length) {
                return await flowDynamic("⚠️ No tenés cuentas registradas. Agregá una desde la web antes de continuar.");
            }

            const list = {
                header: { type: 'text', text: '🏦 Cuentas disponibles' },
                body: { text: 'Seleccioná una cuenta:' },
                footer: { text: 'Pagado - Tu asistente financiero' },
                action: {
                    button: 'Ver cuentas',
                    sections: [{
                        title: 'Cuentas',
                        rows: userCached.accounts?.map(acc => ({
                            id: `acc_${acc.id}__${acc.title}`,
                            title: acc.title,
                        }))
                    }]
                }
            };

            await provider.sendList(ctx.from, list);
        } catch (err) {
            console.error('Error en flujoAgregarIngreso - Paso 2:', err);
            await flowDynamic("🚫 Ocurrió un error al obtener tus cuentas. Intenta más tarde.");
        }
    })
    // Paso 3: Captura de cuenta y mostrar métodos de pago
    .addAnswer('', { capture: true }, async (ctx, { state, provider, flowDynamic }) => {
        const accountData = ctx.body.replace("acc_", ""); // acc_id__nombre
        const [accountId, accountName] = accountData.split("__");

        await state.update({ selectedAccount: accountName, accountId });

        const userCached: UserCache | null = await state.get("userCache");
        // const email = await state.get("email");

        try {
            // const { data: methodData } = await axios.get(`${process.env.API_URL}/methods?mail=${email}`, {
            //     headers: { Authorization: `Bearer ${process.env.API_SECRET_TOKEN}` },
            // });

            // const listMethods = methodData.formattedMethods;

            if (!userCached.paymentMethods?.length) {
                return await flowDynamic("⚠️ No tenés métodos de pago cargados. Agregá uno desde la web antes de continuar.");
            }
            const filteredMethods = userCached.paymentMethods.filter((item) => item.idAccount === accountId)

            const truncate = (text: string, max = 24) =>
                text.length > max ? text.slice(0, max - 1) + '…' : text;
            const list = {
                header: { type: 'text', text: '💳 Métodos de pago' },
                body: { text: 'Seleccioná un método de pago:' },
                footer: { text: 'Pagado - Tu asistente financiero' },
                action: {
                    button: 'Ver métodos',
                    sections: [{
                        title: 'Métodos de pago',
                        rows: filteredMethods.map(method => ({
                            id: `metodo_${method.id}__${method.title}`, // asegurate de que el id también sea único
                            title: truncate(
                                method.cardType
                                    ? `${method.title} (${method.cardType})`
                                    : method.title
                            ),
                        }))
                    }]
                }
            };

            await provider.sendList(ctx.from, list);
        } catch (err) {
            console.error('Error en flujoAgregarIngreso - Paso 3:', err);
            await flowDynamic("🚫 Ocurrió un error al obtener los métodos de pago. Intenta más tarde.");
        }
    })
    // Capturar categoría seleccionada
    .addAction({ capture: true }, async (ctx, { state, flowDynamic }) => {
        const selectedMethod = ctx.body.replace("metodo_", "");
        const [methodId, methodName] = selectedMethod.split("__");

        await state.update({ selectedMethod: methodName, methodId });
        // await state.update({ selectedMethod });

        return await flowDynamic("✍️ Ingresá los datos de la transaccion separados por coma:\n*Descripción, Monto, Moneda*\nEj: Sueldo, 200000, ARS");
    })

    // Capturar mensaje del usuario con los datos y hacer POST
    .addAction({ capture: true }, async (ctx, { state, flowDynamic }) => {
        // const email = await state.get("email");
        const userCached: UserCache | null = await state.get("userCache");
        const category = await state.get("category");
        const account = await state.get('selectedAccount');
        const method = await state.get("selectedMethod");

        const [description, rawAmount, currency] = ctx.body.split(",").map(s => s.trim());

        const amount = parseFloat(rawAmount.replace(",", "."));

        if (!description || isNaN(amount) || !currency) {
            return await flowDynamic("❌ Formato inválido. Usá: Descripción, Monto, Moneda\nEj: Sueldo, 200000, ARS");
        }

        try {
            const date = new Date()
            const body = {
                id: "",
                description,
                type: "expense",
                category,
                amount,
                date: date.toString(),
                currency,
                account,
                method
            }

            const res = await axios.post(`${process.env.API_URL}/transaction?mail=${userCached.email}`, body, {
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