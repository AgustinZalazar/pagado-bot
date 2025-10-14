import { addKeyword, EVENTS } from '@builderbot/bot'
import { getUserData } from '~/cache/userCache'
import { processTextWithAI } from '~/services/aiService'
import { createTransaction, getLastTransaction } from '~/services/transactionService'
import { renderFormattedAmount } from '~/helpers/formatedAmount'
import { isAuthorizedForAI } from '~/config/authorizedNumbers'

// Timeout de 1 hora (300000 ms) de inactividad
const INACTIVITY_TIMEOUT = 60 * 60 * 1000;

// Almacenar los timeouts de cada usuario
const userTimeouts: Map<string, NodeJS.Timeout> = new Map();

// Este flujo se activa con EVENTS.ACTION que captura TODOS los mensajes
// pero filtramos para solo procesar texto cuando hay sesión activa de IA
export const templateWithAI = addKeyword(EVENTS.ACTION)
    .addAction(async (ctx, { flowDynamic, state, endFlow }) => {
        try {
            // Solo procesar mensajes de texto
            if (ctx.type !== 'text') {
                return endFlow();
            }

            const number = ctx.from;

            // Verificar que el usuario tiene acceso a IA
            const hasAIAccess = isAuthorizedForAI(number);
            if (!hasAIAccess) {
                return endFlow();
            }

            // Solo procesar si el usuario tiene sesión activa de IA
            const activeSession = await state.get("activeSession");
            if (!activeSession) {
                return endFlow();
            }

            const userData = await getUserData(number, state);

            // Solo mostrar mensaje de bienvenida la primera vez
            const aiWelcomeShown = await state.get("aiWelcomeShown");
            //             if (!aiWelcomeShown) {
            //                 await flowDynamic(`💬 Puedes escribirme lo que necesites:

            // • "Gasté 5000 en almuerzo" - Registra un gasto
            // • "Me pagaron 200000 de sueldo" - Registra un ingreso
            // • "¿Cuál fue mi último gasto?" - Consulta
            // • O envía una foto del ticket, un audio o un PDF

            // Escribe *"salir"* o *"menú"* para volver al menú tradicional.

            // ¡Estoy aquí para ayudarte! 🤖`);
            //                 await state.update({ aiWelcomeShown: true });
            //                 // Configurar timeout de inactividad
            //                 const timeout = setTimeout(async () => {
            //                     userTimeouts.delete(number);
            //                     await flowDynamic("⏰ Sesión finalizada por inactividad. Escribe cualquier cosa para volver a empezar.");
            //                 }, INACTIVITY_TIMEOUT);
            //                 userTimeouts.set(number, timeout);

            //                 return;
            //             }

            // Limpiar timeout anterior si existe
            if (userTimeouts.has(number)) {
                clearTimeout(userTimeouts.get(number)!);
            }

            const userMessage = ctx.body ? ctx.body.toLowerCase().trim() : '';

            // Verificar si hay una transacción pendiente (esperando cuenta o método de pago)
            const pendingTransaction = await state.get("pendingTransaction");

            // Si no hay transacción pendiente, detectar saludos y mensajes simples
            if (!pendingTransaction && !aiWelcomeShown) {
                const greetings = ['hola', 'hi', 'hello', 'buenas', 'buen dia', 'buen día', 'buenos dias', 'buenos días', 'buenas tardes', 'buenas noches', 'hey', 'que tal', 'qué tal', 'como estas', 'cómo estás'];
                const isGreeting = greetings.some(greeting => userMessage === greeting || userMessage.startsWith(greeting + ' ') || userMessage.startsWith(greeting + ','));

                if (isGreeting) {
                    await flowDynamic(`👋 ¡Hola! Estoy aquí para ayudarte con tus finanzas.\n\n💡 Puedes:\n• Registrar un gasto: "Gasté 5000 en almuerzo"\n• Registrar un ingreso: "Me pagaron 200000"\n• Consultar: "¿Cuál fue mi último gasto?"\n• Enviar una foto de un ticket\n• Enviar un audio con la transacción\n\n¿En qué puedo ayudarte?`);

                    // Configurar timeout de inactividad
                    const timeout = setTimeout(async () => {
                        userTimeouts.delete(number);
                        await flowDynamic("⏰ Sesión finalizada por inactividad. Escribe cualquier cosa para volver a empezar.");
                    }, INACTIVITY_TIMEOUT);
                    userTimeouts.set(number, timeout);
                    await state.update({ aiWelcomeShown: true });
                    return;
                }
            }

            // Si hay transacción pendiente y el usuario envía imagen/audio/documento, informar que debe completar primero
            if (pendingTransaction && (ctx.type === 'image' || ctx.type === 'voice' || ctx.type === 'document')) {
                await flowDynamic("⚠️ Primero debes completar la transacción anterior seleccionando cuenta y método de pago. Envía texto con el número o nombre de la opción.");
                return;
            }

            if (pendingTransaction) {
                // Usuario está respondiendo para completar la transacción
                if (pendingTransaction.needsAccount) {
                    // Procesar selección de cuenta (case-insensitive)
                    const selectedAccount = userData.accounts.find((acc, index) =>
                        (index + 1).toString() === ctx.body.trim() ||
                        acc.title.toLowerCase().includes(userMessage) ||
                        userMessage.includes(acc.title.toLowerCase())
                    );

                    if (!selectedAccount) {
                        await flowDynamic("❌ Cuenta no válida. Por favor selecciona una cuenta de la lista (número o nombre).");
                        return;
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

                    // Configurar timeout
                    const timeout = setTimeout(async () => {
                        userTimeouts.delete(number);
                        await flowDynamic("⏰ Sesión finalizada por inactividad. Escribe cualquier cosa para volver a empezar.");
                    }, INACTIVITY_TIMEOUT);
                    userTimeouts.set(number, timeout);

                    return;
                }

                if (pendingTransaction.needsPaymentMethod) {
                    // Procesar selección de método de pago (case-insensitive)
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
                        return;
                    }

                    // Crear la transacción completa
                    await createTransaction(userData.email, {
                        description: pendingTransaction.description || `${pendingTransaction.type === 'expense' ? 'Gasto' : 'Ingreso'} registrado por IA`,
                        type: pendingTransaction.type,
                        category: pendingTransaction.category,
                        amount: pendingTransaction.amount,
                        currency: pendingTransaction.currency,
                        account: pendingTransaction.account,
                        method: selectedMethod.title
                    });

                    const typeText = pendingTransaction.type === "expense" ? "Gasto" : "Ingreso";
                    await flowDynamic(`✅ *${typeText} registrado exitosamente*\n\n💰 *Monto:* $${pendingTransaction.amount} ${pendingTransaction.currency}\n📂 *Categoría:* ${pendingTransaction.category}\n🏦 *Cuenta:* ${pendingTransaction.account}\n💳 *Método:* ${selectedMethod.title}\n📝 *Descripción:* ${pendingTransaction.description || `${typeText} registrado por IA`}\n\n_¿Necesitas algo más?_`);

                    // Limpiar transacción pendiente
                    await state.update({ pendingTransaction: null });

                    // Configurar timeout de inactividad
                    const timeout = setTimeout(async () => {
                        userTimeouts.delete(number);
                        await flowDynamic("⏰ Sesión finalizada por inactividad. Escribe cualquier cosa para volver a empezar.");
                    }, INACTIVITY_TIMEOUT);
                    userTimeouts.set(number, timeout);

                    return;
                }
            }

            await flowDynamic("🤔 Déjame procesar tu mensaje...");

            // Procesar texto con IA
            const parsed = await processTextWithAI(ctx.body, userData);

            let responseMessage = "";

            switch (parsed.type) {
                case "expense":
                case "income":
                    // Verificar datos básicos
                    if (!parsed.amount || !parsed.category) {
                        const typeText = parsed.type === "expense" ? "gasto" : "ingreso";
                        responseMessage = `⚠️ No pude extraer el monto y/o categoría de tu ${typeText}.\n\nPor favor intenta de nuevo, por ejemplo:\n• "Gasté 5000 en comida"\n• "Me pagaron 200000 de sueldo"\n\n_¿Quieres intentar de nuevo?_`;
                        break;
                    }

                    // Si faltan cuenta o método de pago, guardar en estado y mostrar opciones
                    if (parsed.needsAccountSelection || parsed.needsPaymentMethodSelection) {
                        await state.update({ aiWelcomeShown: true });
                        // Guardar transacción parcial en el estado
                        await state.update({
                            pendingTransaction: {
                                type: parsed.type,
                                amount: parsed.amount,
                                category: parsed.category,
                                description: parsed.description,
                                currency: parsed.currency || "ARS",
                                needsAccount: parsed.needsAccountSelection,
                                needsPaymentMethod: parsed.needsPaymentMethodSelection
                            }
                        });

                        // Mostrar cuentas disponibles si falta
                        if (parsed.needsAccountSelection) {
                            console.log('Mostrando selección de cuenta en templateWithAI');
                            const accountsList = userData.accounts.map((acc, index) => `${index + 1}. ${acc.title}`).join('\n');
                            responseMessage = `📝 Entendido! Has registrado:\n💰 Monto: $${parsed.amount}\n📂 Categoría: ${parsed.category}\n\n🏦 *Selecciona una cuenta* (responde con el número o nombre):\n\n${accountsList}\n\n_Escribe el número o nombre de la cuenta_`;
                            break;
                        }

                        // Si ya tiene cuenta pero falta método de pago
                        if (parsed.needsPaymentMethodSelection && parsed.account) {
                            // Filtrar métodos de pago por cuenta
                            console.log('Mostrando selección de método de pago en templateWithAI');
                            const accountObj = userData.accounts.find(a => a.title === parsed.account);
                            if (accountObj) {
                                const filteredMethods = userData.paymentMethods.filter(m => m.idAccount === accountObj.id);
                                const methodsList = filteredMethods.map((method, index) => {
                                    const displayTitle = method.cardType ? `${method.title} (${method.cardType})` : method.title;
                                    return `${index + 1}. ${displayTitle}`;
                                }).join('\n');

                                await state.update({
                                    pendingTransaction: {
                                        ...parsed,
                                        type: parsed.type,
                                        amount: parsed.amount,
                                        category: parsed.category,
                                        description: parsed.description,
                                        currency: parsed.currency || "ARS",
                                        account: parsed.account,
                                        needsPaymentMethod: true
                                    }
                                });

                                responseMessage = `📝 Perfecto!\n💰 Monto: $${parsed.amount}\n📂 Categoría: ${parsed.category}\n🏦 Cuenta: ${parsed.account}\n\n💳 *Selecciona un método de pago* (responde con el número o nombre):\n\n${methodsList}\n\n_Escribe el número o nombre del método_`;
                                break;
                            }
                        }
                    }

                    // Si tenemos todos los datos, crear transacción
                    if (parsed.amount && parsed.category && parsed.paymentMethod && parsed.account) {
                        await createTransaction(userData.email, {
                            description: parsed.description || `${parsed.type === 'expense' ? 'Gasto' : 'Ingreso'} registrado por IA`,
                            type: parsed.type,
                            category: parsed.category,
                            amount: parsed.amount,
                            currency: parsed.currency || "ARS",
                            account: parsed.account,
                            method: parsed.paymentMethod
                        });

                        const typeText = parsed.type === "expense" ? "Gasto" : "Ingreso";
                        responseMessage = `✅ *${typeText} registrado exitosamente*\n\n💰 *Monto:* $${parsed.amount} ${parsed.currency || 'ARS'}\n📂 *Categoría:* ${parsed.category}\n🏦 *Cuenta:* ${parsed.account}\n💳 *Método:* ${parsed.paymentMethod}\n📝 *Descripción:* ${parsed.description || `${typeText} registrado por IA`}\n\n_¿Necesitas algo más?_`;
                    }
                    break;

                case "query_last_expense":
                    // Consultar último gasto
                    try {
                        const lastExpense = await getLastTransaction(userData.email, "expense");
                        if (lastExpense) {
                            const formattedAmount = renderFormattedAmount(lastExpense.amount, lastExpense.currency, "expense", "es");
                            responseMessage = `🧾 *Último gasto registrado*:\n📝 *Descripción:* ${lastExpense.description}\n📂 *Categoría:* ${lastExpense.category}\n💸 *Monto:* ${formattedAmount}\n🏦 *Cuenta:* ${lastExpense.account}\n💳 *Método de pago:* ${lastExpense.method}\n\n_¿Necesitas algo más?_`;
                        } else {
                            responseMessage = '🚫 No hay gastos registrados este mes.\n\n_¿Quieres registrar uno?_';
                        }
                    } catch (err) {
                        console.error('Error al obtener último gasto:', err);
                        responseMessage = '🚫 Hubo un error al consultar tu último gasto.\n\n_¿Quieres intentar de nuevo?_';
                    }
                    break;

                case "query_last_income":
                    // Consultar último ingreso
                    try {
                        const lastIncome = await getLastTransaction(userData.email, "income");
                        if (lastIncome) {
                            const formattedAmount = renderFormattedAmount(lastIncome.amount, lastIncome.currency, "income", "es");
                            responseMessage = `🧾 *Último ingreso registrado*:\n📝 *Descripción:* ${lastIncome.description}\n📂 *Categoría:* ${lastIncome.category}\n💸 *Monto:* ${formattedAmount}\n🏦 *Cuenta:* ${lastIncome.account}\n💳 *Método de pago:* ${lastIncome.method}\n\n_¿Necesitas algo más?_`;
                        } else {
                            responseMessage = '🚫 No hay ingresos registrados este mes.\n\n_¿Quieres registrar uno?_';
                        }
                    } catch (err) {
                        console.error('Error al obtener último ingreso:', err);
                        responseMessage = '🚫 Hubo un error al consultar tu último ingreso.\n\n_¿Quieres intentar de nuevo?_';
                    }
                    break;

                default:
                    responseMessage = `🤷‍♂️ No estoy seguro de qué quieres hacer. Puedes:\n\n• Registrar un gasto: "Gasté 5000 en almuerzo"\n• Registrar un ingreso: "Me pagaron 200000"\n• Consultar: "¿Cuál fue mi último gasto?"\n• Enviar una foto de un ticket\n• Enviar un audio con la transacción\n\n_¿En qué puedo ayudarte?_`;
            }

            await flowDynamic(responseMessage);

            // Configurar timeout de inactividad
            const timeout = setTimeout(async () => {
                userTimeouts.delete(number);
                await flowDynamic("⏰ Sesión finalizada por inactividad. Escribe cualquier cosa para volver a empezar.");
            }, INACTIVITY_TIMEOUT);
            userTimeouts.set(number, timeout);

        } catch (err) {
            console.error("❌ Error en templateWithAI:", err);
            await flowDynamic("🚫 Ocurrió un error procesando tu mensaje. Por favor intenta nuevamente.");
        }
    }).addAction({ capture: true }, async (ctx, { flowDynamic, state, fallBack }) => {
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