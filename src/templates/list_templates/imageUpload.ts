import { addKeyword, EVENTS } from "@builderbot/bot";
import axios from "axios";
import { getUserData } from "~/cache/userCache";
import { processImageWithAI } from "~/services/aiService";
import { createTransaction } from "~/services/transactionService";
import { isAuthorizedForAI } from "~/config/authorizedNumbers";

export const imageUpload = addKeyword(EVENTS.MEDIA)
    .addAction(async (ctx, { flowDynamic, state }) => {
        try {
            if (ctx.type !== "image" || !ctx.url) {
                return;
            }

            console.log('--- Image detected in imageUpload flow ---');

            // Obtener datos del usuario
            const number = ctx.from;
            const userData = await getUserData(number, state);
            userData.subscription = true // FORZAR SUSCRIPCIÓN PARA TESTING

            // Verificar si el número está autorizado para usar IA
            const hasAIAccess = isAuthorizedForAI(number);

            // Si el usuario tiene suscripción Y está autorizado, procesar con IA
            if (userData?.subscription && hasAIAccess) {
                await flowDynamic("🔍 Analizando tu ticket...");

                // Descargar imagen
                const response = await axios.get(ctx.url, {
                    responseType: "arraybuffer",
                    headers: {
                        Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
                    },
                });
                const base64Image = Buffer.from(response.data).toString("base64");

                // Procesar imagen con IA
                const parsed = await processImageWithAI(base64Image, userData);

                if (!parsed || !parsed.amount || !parsed.category) {
                    await flowDynamic("⚠️ No pude extraer el monto y/o categoría del ticket. Por favor intenta con una imagen más clara o regístralo manualmente.\n\n_¿Quieres intentar de nuevo?_");
                    return;
                }

                // Si faltan cuenta o método de pago, guardar en estado y mostrar opciones
                if (parsed.needsAccountSelection || parsed.needsPaymentMethodSelection) {
                    console.log('--- Missing data from parsed image, asking user ---')
                    await state.update({ aiWelcomeShown: true });
                    await state.update({
                        pendingTransaction: {
                            type: "expense",
                            amount: parsed.amount,
                            category: parsed.category,
                            description: parsed.description,
                            currency: "ARS",
                            needsAccount: parsed.needsAccountSelection,
                            needsPaymentMethod: parsed.needsPaymentMethodSelection,
                            account: parsed.account,
                            accountId: parsed.account ? userData.accounts.find(a => a.title === parsed.account)?.id : null
                        }
                    });

                    if (parsed.needsAccountSelection) {
                        console.log('--- Asking for account selection ---')
                        const accountsList = userData.accounts.map((acc, index) => `${index + 1}. ${acc.title}`).join('\n');
                        await flowDynamic(`📝 He extraído de tu ticket:\n Descripcion: ${parsed.description} \n💰 Monto: $${parsed.amount}\n📂 Categoría: ${parsed.category}\n\n🏦 *Selecciona una cuenta* (responde con el número o nombre):\n\n${accountsList}\n\n_Escribe el número o nombre de la cuenta_`);
                        return;
                    }

                    if (parsed.needsPaymentMethodSelection && parsed.account) {
                        console.log('--- Asking for payment method selection ---')
                        const accountObj = userData.accounts.find(a => a.title === parsed.account);
                        if (accountObj) {
                            const filteredMethods = userData.paymentMethods.filter(m => m.idAccount === accountObj.id);
                            const methodsList = filteredMethods.map((method, index) => {
                                const displayTitle = method.cardType ? `${method.title} (${method.cardType})` : method.title;
                                return `${index + 1}. ${displayTitle}`;
                            }).join('\n');

                            await flowDynamic(`📝 He extraído de tu ticket:\n Descripcion: ${parsed.description} \n💰 Monto: $${parsed.amount}\n📂 Categoría: ${parsed.category}\n🏦 Cuenta: ${parsed.account}\n\n💳 *Selecciona un método de pago* (responde con el número o nombre):\n\n${methodsList}\n\n_Escribe el número o nombre del método_`);
                            return;
                        }
                    }
                }

                // Si tenemos todos los datos, crear transacción
                if (parsed.amount && parsed.category && parsed.paymentMethod && parsed.account) {
                    await createTransaction(userData.email, {
                        description: parsed.description,
                        type: "expense",
                        category: parsed.category,
                        amount: parsed.amount,
                        currency: "ARS",
                        account: parsed.account,
                        method: parsed.paymentMethod
                    });

                    await flowDynamic(
                        `✅ He procesado y registrado tu gasto:\n\n Descripcion: ${parsed.description} \n💰 *Monto:* $${parsed.amount}\n📂 *Categoría:* ${parsed.category}\n🏦 *Cuenta:* ${parsed.account}\n💳 *Método de pago:* ${parsed.paymentMethod}\n\n_¿Necesitas algo más?_`
                    );
                    // Marcar sesión como activa para futuras interacciones
                    await state.update({ activeSession: true });
                }

                return;
            }

            // Usuarios sin suscripción o sin autorización no pueden procesar imágenes con IA
            if (!hasAIAccess) {
                await flowDynamic("📸 Has enviado una imagen.\n\n⚠️ Tu número no tiene acceso a las funcionalidades de IA en este momento.\n\nPor favor registra tu gasto manualmente usando el menú.");
            } else {
                await flowDynamic("📸 Has enviado una imagen, pero el procesamiento automático de imágenes requiere una suscripción premium.\n\n✨ *Mejora a Premium* para:\n• Procesar tickets y facturas automáticamente\n• Registrar gastos desde fotos\n• Usar comandos de voz\n• Y mucho más!\n\nPor ahora, por favor registra tu gasto manualmente usando el menú.");
            }

        } catch (err) {
            console.error("❌ Error en imageUpload:", err);
            return await flowDynamic("🚫 Ocurrió un error. Intenta nuevamente.");
        }
    })
    .addAction({ capture: true }, async (ctx, { flowDynamic, state, fallBack }) => {
        try {
            const number = ctx.from;
            const userData = await getUserData(number, state);
            const pendingTransaction = await state.get("pendingTransaction");

            // Solo procesar si hay una transacción pendiente del flujo de imagen
            if (!pendingTransaction) {
                return;
            }

            const userMessage = ctx.body ? ctx.body.toLowerCase().trim() : '';

            // Procesar selección de cuenta
            if (pendingTransaction.needsAccount) {
                console.log('--- Processing account selection in imageUpload ---');
                const selectedAccount = userData.accounts.find((acc, index) =>
                    (index + 1).toString() === ctx.body.trim() ||
                    acc.title.toLowerCase().includes(userMessage) ||
                    userMessage.includes(acc.title.toLowerCase())
                );

                if (!selectedAccount) {
                    await flowDynamic("❌ Cuenta no válida. Por favor selecciona una cuenta de la lista (número o nombre).");
                    return fallBack();
                }

                // Actualizar transacción con la cuenta y mostrar métodos de pago
                const filteredMethods = userData.paymentMethods.filter(m => m.idAccount === selectedAccount.id);

                if (filteredMethods.length === 0) {
                    await flowDynamic("⚠️ No tienes métodos de pago configurados para esta cuenta. Por favor agrégalos desde la web.");
                    await state.update({ pendingTransaction: null });
                    return;
                }

                const methodsList = filteredMethods.map((method, index) => {
                    const displayTitle = method.cardType ? `${method.title} (${method.cardType})` : method.title;
                    return `${index + 1}. ${displayTitle}`;
                }).join('\n');

                await state.update({
                    pendingTransaction: {
                        ...pendingTransaction,
                        account: selectedAccount.title,
                        accountId: selectedAccount.id,
                        needsAccount: false,
                        needsPaymentMethod: true
                    }
                });

                await flowDynamic(`✅ Cuenta seleccionada: *${selectedAccount.title}*\n\n💳 *Selecciona un método de pago* (responde con el número o nombre):\n\n${methodsList}\n\n_Escribe el número o nombre del método_`);
                return fallBack();
            }

            // Procesar selección de método de pago
            if (pendingTransaction.needsPaymentMethod) {
                console.log('--- Processing payment method selection in imageUpload ---');
                const accountId = pendingTransaction.accountId;
                const filteredMethods = userData.paymentMethods.filter(m => m.idAccount === accountId);

                const selectedMethod = filteredMethods.find((method, index) => {
                    const methodTitleLower = method.title.toLowerCase();
                    const fullTitleLower = method.cardType
                        ? `${method.title} (${method.cardType})`.toLowerCase()
                        : methodTitleLower;

                    return (index + 1).toString() === ctx.body.trim() ||
                        methodTitleLower.includes(userMessage) ||
                        userMessage.includes(methodTitleLower) ||
                        fullTitleLower.includes(userMessage) ||
                        userMessage.includes(fullTitleLower);
                });

                if (!selectedMethod) {
                    await flowDynamic("❌ Método de pago no válido. Por favor selecciona un método de la lista (número o nombre).");
                    return fallBack();
                }

                // Crear la transacción completa
                await createTransaction(userData.email, {
                    description: pendingTransaction.description || 'Gasto registrado desde imagen',
                    type: pendingTransaction.type,
                    category: pendingTransaction.category,
                    amount: pendingTransaction.amount,
                    currency: pendingTransaction.currency,
                    account: pendingTransaction.account,
                    method: selectedMethod.title
                });

                await flowDynamic(`✅ *Gasto registrado exitosamente*\n\n💰 *Monto:* $${pendingTransaction.amount} ${pendingTransaction.currency}\n📂 *Categoría:* ${pendingTransaction.category}\n🏦 *Cuenta:* ${pendingTransaction.account}\n💳 *Método:* ${selectedMethod.title}\n📝 *Descripción:* ${pendingTransaction.description || 'Gasto registrado desde imagen'}\n\n_¿Necesitas algo más?_`);

                // Limpiar transacción pendiente
                await state.update({ pendingTransaction: null });
                await state.update({ activeSession: true });
                return;
            }

        } catch (err) {
            console.error("❌ Error procesando respuesta en imageUpload:", err);
            await flowDynamic("🚫 Ocurrió un error. Intenta nuevamente.");
            return fallBack();
        }
    });
