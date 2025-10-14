import { addKeyword, EVENTS } from "@builderbot/bot";
import fs from "fs";
import path from "path";
import { pipeline } from "stream";
import { promisify } from "util";
import { getUserData } from "~/cache/userCache";
import { processAudioWithAI } from "~/services/aiService";
import { createTransaction } from "~/services/transactionService";
import { isAuthorizedForAI } from "~/config/authorizedNumbers";

const streamPipeline = promisify(pipeline);

export const audioUpload = addKeyword(EVENTS.VOICE_NOTE)
    .addAction(async (ctx, { flowDynamic, state }) => {
        let filePath = "";
        try {
            if (!ctx.url) {
                return;
            }

            // Obtener datos del usuario
            const number = ctx.from;
            const userData = await getUserData(number, state);
            userData.subscription = true // FORZAR SUSCRIPCIÓN PARA TESTING

            // Verificar si el número está autorizado para usar IA
            const hasAIAccess = isAuthorizedForAI(number);

            // Si el usuario tiene suscripción Y está autorizado, procesar con IA
            if (userData?.subscription && hasAIAccess) {
                await flowDynamic("🎤 Procesando tu audio...");

                // Descargar el audio
                const res = await fetch(ctx.url, {
                    method: "GET",
                    headers: { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}` },
                });

                const mimeType = res.headers.get("content-type") || "application/octet-stream";
                const extension = mimeType.split("/")[1] || "bin";

                const fileName = `file-${Date.now()}.${extension}`;
                const folderPath = path.join(process.cwd(), "public", "audios");
                filePath = path.join(folderPath, fileName);

                if (!fs.existsSync(folderPath)) {
                    fs.mkdirSync(folderPath, { recursive: true });
                }

                const nodeStream = fs.createWriteStream(filePath);
                await streamPipeline(res.body as any, nodeStream);

                // Procesar audio con IA
                const parsed = await processAudioWithAI(filePath, userData);

                // Borrar archivo temporal
                if (fs.existsSync(filePath)) {
                    await fs.promises.unlink(filePath);
                    filePath = "";
                }

                if (!parsed || !parsed.amount || !parsed.category) {
                    await flowDynamic("⚠️ No pude extraer el monto y/o categoría del audio. Por favor intenta nuevamente o regístralo manualmente.\n\n_¿Quieres intentar de nuevo?_");
                    return;
                }

                // Si faltan cuenta o método de pago, guardar en estado y mostrar opciones
                if (parsed.needsAccountSelection || parsed.needsPaymentMethodSelection) {
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
                        const accountsList = userData.accounts.map((acc, index) => `${index + 1}. ${acc.title}`).join('\n');
                        await flowDynamic(`📝 He extraído de tu audio:\n📝*Descripcion:* $${parsed.description}\n💰 Monto: $${parsed.amount}\n📂 Categoría: ${parsed.category}\n\n🏦 *Selecciona una cuenta* (responde con el número o nombre):\n\n${accountsList}\n\n_Escribe el número o nombre de la cuenta_`);
                        await state.update({ activeSession: true });
                        return;
                    }

                    if (parsed.needsPaymentMethodSelection && parsed.account) {
                        const accountObj = userData.accounts.find(a => a.title === parsed.account);
                        if (accountObj) {
                            const filteredMethods = userData.paymentMethods.filter(m => m.idAccount === accountObj.id);
                            const methodsList = filteredMethods.map((method, index) => {
                                const displayTitle = method.cardType ? `${method.title} (${method.cardType})` : method.title;
                                return `${index + 1}. ${displayTitle}`;
                            }).join('\n');

                            await flowDynamic(`📝 He extraído de tu audio:\n📝*Descripcion:* $${parsed.description}\n💰 Monto: $${parsed.amount}\n📂 Categoría: ${parsed.category}\n🏦 Cuenta: ${parsed.account}\n\n💳 *Selecciona un método de pago* (responde con el número o nombre):\n\n${methodsList}\n\n_Escribe el número o nombre del método_`);
                            await state.update({ activeSession: true });
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
                        `✅ He procesado y registrado tu gasto:\n\n📝*Descripcion:* $${parsed.description}\n💰 *Monto:* $${parsed.amount}\n📂 *Categoría:* ${parsed.category}\n🏦 *Cuenta:* ${parsed.account}\n💳 *Método de pago:* ${parsed.paymentMethod}\n\n_¿Necesitas algo más?_`
                    );
                    await state.update({ activeSession: true });
                }

                return;
            }

            // Usuarios sin suscripción o sin autorización no pueden procesar audios con IA
            if (!hasAIAccess) {
                await flowDynamic("🎤 Has enviado un mensaje de voz.\n\n⚠️ Tu número no tiene acceso a las funcionalidades de IA en este momento.\n\nPor favor registra tu gasto manualmente usando el menú.");
            } else {
                await flowDynamic("🎤 Has enviado un mensaje de voz, pero el procesamiento automático de audios requiere una suscripción premium.\n\n✨ *Mejora a Premium* para:\n• Procesar mensajes de voz automáticamente\n• Registrar gastos desde audios\n• Procesar tickets y facturas\n• Y mucho más!\n\nPor ahora, por favor registra tu gasto manualmente usando el menú.");
            }

        } catch (err) {
            console.error("❌ Error en audioUpload:", err);
            // Limpiar archivo temporal en caso de error
            if (filePath && fs.existsSync(filePath)) {
                await fs.promises.unlink(filePath);
            }
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
                console.log('--- Processing payment method selection in audioMessage ---');
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
                    description: pendingTransaction.description || 'Gasto registrado desde audio',
                    type: pendingTransaction.type,
                    category: pendingTransaction.category,
                    amount: pendingTransaction.amount,
                    currency: pendingTransaction.currency,
                    account: pendingTransaction.account,
                    method: selectedMethod.title
                });

                await flowDynamic(`✅ *Gasto registrado exitosamente*\n\n📝*Descripcion:* $${pendingTransaction.description}\n💰 *Monto:* $${pendingTransaction.amount} ${pendingTransaction.currency}\n📂 *Categoría:* ${pendingTransaction.category}\n🏦 *Cuenta:* ${pendingTransaction.account}\n💳 *Método:* ${selectedMethod.title}}\n\n_¿Necesitas algo más?_`);

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