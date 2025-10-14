import { addKeyword, EVENTS } from "@builderbot/bot";
import axios from "axios";
import { getUserData } from "~/cache/userCache";
import { processPDFWithAI } from "~/services/aiService";
import { createTransaction } from "~/services/transactionService";
import { isAuthorizedForAI } from "~/config/authorizedNumbers";

export const pdfUpload = addKeyword(EVENTS.DOCUMENT)
    .addAction(async (ctx, { flowDynamic, state }) => {
        try {
            if (ctx.type !== "document" || !ctx.url) {
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
                await flowDynamic("📄 Analizando tu documento...");

                // Descargar PDF
                const response = await axios.get(ctx.url, {
                    responseType: "arraybuffer",
                    headers: {
                        Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
                    },
                });

                // console.log({ response: response })
                const base64PDF = Buffer.from(response.data).toString("base64");

                // Procesar PDF con IA
                const parsed = await processPDFWithAI(base64PDF, userData);

                if (!parsed || !parsed.amount || !parsed.category) {
                    await flowDynamic("⚠️ No pude extraer el monto y/o categoría del PDF. Por favor intenta con un documento más claro o regístralo manualmente.\n\n_¿Quieres intentar de nuevo?_");
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
                        await flowDynamic(`📝 He extraído de tu PDF:\n 📝Descripcion: ${parsed.description} \n💰 Monto: $${parsed.amount}\n📂 Categoría: ${parsed.category}\n\n🏦 *Selecciona una cuenta* (responde con el número o nombre):\n\n${accountsList}\n\n_Escribe el número o nombre de la cuenta_`);
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

                            await flowDynamic(`📝 He extraído de tu PDF:\n 📝Descripcion: ${parsed.description} \n💰 Monto: $${parsed.amount}\n📂 Categoría: ${parsed.category}\n🏦 Cuenta: ${parsed.account}\n\n💳 *Selecciona un método de pago* (responde con el número o nombre):\n\n${methodsList}\n\n_Escribe el número o nombre del método_`);
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
                        `✅ He procesado y registrado tu gasto:\n\n 📝 Descripcion: ${parsed.description} \n💰 *Monto:* $${parsed.amount}\n📂 *Categoría:* ${parsed.category}\n🏦 *Cuenta:* ${parsed.account}\n💳 *Método de pago:* ${parsed.paymentMethod}\n\n_¿Necesitas algo más?_`
                    );
                    await state.update({ activeSession: true });
                }

                return;
            }

            // Usuarios sin suscripción o sin autorización no pueden procesar PDFs con IA
            if (!hasAIAccess) {
                await flowDynamic("📄 Has enviado un documento.\n\n⚠️ Tu número no tiene acceso a las funcionalidades de IA en este momento.\n\nPor favor registra tu gasto manualmente usando el menú.");
            } else {
                await flowDynamic("📄 Has enviado un documento, pero el procesamiento automático de documentos requiere una suscripción premium.\n\n✨ *Mejora a Premium* para:\n• Procesar facturas y tickets en PDF automáticamente\n• Registrar gastos desde documentos\n• Procesar imágenes y audios\n• Y mucho más!\n\nPor ahora, por favor registra tu gasto manualmente usando el menú.");
            }

        } catch (err) {
            console.error("❌ Error en pdfUpload:", err);
            return await flowDynamic("🚫 Ocurrió un error. Intenta nuevamente.");
        }
    });
