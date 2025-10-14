import OpenAI from "openai";
import { UserCache } from "~/cache/userCache";

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export interface ParsedExpenseIncome {
    type: "expense" | "income" | "query_last_expense" | "query_last_income" | "unknown";
    amount?: number;
    category?: string;
    account?: string;
    paymentMethod?: string;
    description?: string;
    currency?: string;
    needsAccountSelection?: boolean;
    needsPaymentMethodSelection?: boolean;
}

/**
 * Procesar texto con IA para extraer información de gastos/ingresos
 */
export async function processTextWithAI(
    text: string,
    userData: UserCache
): Promise<ParsedExpenseIncome> {
    const categories = userData.categories.map(c => c.nombre);
    const accounts = userData.accounts.map(a => a.title);
    const paymentMethods = userData.paymentMethods.map(p => p.title);

    const systemPrompt = `Eres un asistente financiero que analiza mensajes de WhatsApp para clasificar transacciones.

Tu tarea es determinar si el usuario está:
1. Registrando un GASTO (compró algo, pagó algo, gastó dinero)
2. Registrando un INGRESO (recibió dinero, cobró, le pagaron)
3. Consultando el ÚLTIMO GASTO
4. Consultando el ÚLTIMO INGRESO
5. OTRO tipo de mensaje (no es financiero)

Categorías disponibles: ${JSON.stringify(categories)}
Cuentas disponibles: ${JSON.stringify(accounts)}
Métodos de pago disponibles: ${JSON.stringify(paymentMethods)}

IMPORTANTE:
- Si el usuario dice "gasté", "compré", "pagué" → type: "expense"
- Si el usuario dice "me pagaron", "cobré", "recibí" → type: "income"
- Si pregunta por el "último gasto" → type: "query_last_expense"
- Si pregunta por el "último ingreso" → type: "query_last_income"
- Si no es claro o no es financiero → type: "unknown"
- Para gastos/ingresos: extrae monto, categoría y descripción
- Para cuenta: SOLO ponla si el usuario la menciona EXPLÍCITAMENTE. Si no la menciona, deja null
- Para método de pago: SOLO ponlo si el usuario lo menciona EXPLÍCITAMENTE y está en la lista. Si no está en la lista o no lo menciona, deja null
- Si no hay moneda, asume "ARS"

Devuelve SOLO JSON válido con estas claves:
{
    "type": "expense" | "income" | "query_last_expense" | "query_last_income" | "unknown",
    "amount": número o null,
    "category": string o null,
    "account": string o null (SOLO si se menciona explícitamente),
    "paymentMethod": string o null (SOLO si se menciona explícitamente y está en la lista),
    "description": string o null,
    "currency": string o null
}`;

    const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text }
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
    });

    const content = completion.choices[0].message.content;
    const parsed: ParsedExpenseIncome = JSON.parse(content || "{}");

    // Validar que la cuenta existe en las cuentas del usuario
    if (parsed.account && !accounts.includes(parsed.account)) {
        parsed.account = null;
    }

    // Validar que el método de pago existe en los métodos del usuario
    if (parsed.paymentMethod && !paymentMethods.includes(parsed.paymentMethod)) {
        parsed.paymentMethod = null;
    }

    // Validar que la categoría existe
    if (parsed.category && !categories.includes(parsed.category)) {
        // Si no está exacta, buscar similitud
        const lowerCategory = parsed.category.toLowerCase();
        const found = categories.find(c => c.toLowerCase() === lowerCategory);
        parsed.category = found || null;
    }

    // Indicar si necesita selección
    if ((parsed.type === "expense" || parsed.type === "income")) {
        parsed.needsAccountSelection = !parsed.account;
        parsed.needsPaymentMethodSelection = !parsed.paymentMethod;
    }

    return parsed;
}

/**
 * Procesar imagen con OpenAI Vision para extraer datos de ticket/factura
 */
export async function processImageWithAI(
    base64Image: string,
    userData: UserCache
): Promise<{ description?: string, amount?: number; category?: string; paymentMethod?: string; account?: string; needsAccountSelection?: boolean; needsPaymentMethodSelection?: boolean } | null> {
    const categories = userData.categories.map(c => c.nombre);
    const accounts = userData.accounts.map(a => a.title);
    const paymentMethods = userData.paymentMethods.map(p => p.title);

    const completion = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
            {
                role: "system",
                content: "Eres un asistente que extrae datos financieros de tickets y facturas. Responde SOLO en formato JSON válido, sin explicaciones adicionales.",
            },
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: `De esta imagen extrae: monto total y categoría del gasto. Responde SOLO en formato JSON con las claves: amount, category, account, paymentMethod.
                        Reglas:
                            - "description" debes relacionarlo y determinar la descripcion analizando la imagen.
                            - "category" debe ser una de estas: ${categories.join(", ")}.
                            - "account": SOLO ponla si puedes identificarla claramente en la imagen y está en esta lista: ${accounts.join(", ")}. Si no, deja null.
                            - "paymentMethod": SOLO ponlo si puedes identificarlo claramente en la imagen y está en esta lista: ${paymentMethods.join(", ")}. Si no, deja null.
                          `
                    },
                    {
                        type: "image_url",
                        image_url: { url: `data:image/jpeg;base64,${base64Image}` },
                    },
                ],
            },
        ],
        temperature: 0.2,
        max_tokens: 500,
        response_format: { type: "json_object" }
    });

    const content = completion.choices[0].message.content;

    try {
        const jsonMatch = content?.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);

            // Validar que la cuenta existe
            if (parsed.account && !accounts.includes(parsed.account)) {
                parsed.account = null;
            }

            // Validar que el método existe
            if (parsed.paymentMethod && !paymentMethods.includes(parsed.paymentMethod)) {
                parsed.paymentMethod = null;
            }

            // Validar que la categoría existe
            if (parsed.category && !categories.includes(parsed.category)) {
                const lowerCategory = parsed.category.toLowerCase();
                const found = categories.find(c => c.toLowerCase() === lowerCategory);
                parsed.category = found || null;
            }

            parsed.description = parsed.description || "Gasto desde imagen";
            // Indicar si necesita selección
            parsed.needsAccountSelection = !parsed.account;
            parsed.needsPaymentMethodSelection = !parsed.paymentMethod;

            if (parsed?.amount && parsed?.category) {
                return parsed;
            }
        }
    } catch {
        return null;
    }

    return null;
}

/**
 * Procesar audio con Whisper para transcribirlo y luego extraer datos
 */
export async function processAudioWithAI(
    audioFilePath: string,
    userData: UserCache
): Promise<{ description: string, amount?: number; category?: string; account?: string; paymentMethod?: string; needsAccountSelection?: boolean; needsPaymentMethodSelection?: boolean } | null> {
    const fs = await import("fs");

    // Transcribir con Whisper
    const transcription = await client.audio.transcriptions.create({
        file: fs.createReadStream(audioFilePath),
        model: "whisper-1",
        language: "es",
    });

    const categories = userData.categories.map(c => c.nombre);
    const accounts = userData.accounts.map(a => a.title);
    const paymentMethods = userData.paymentMethods.map(p => p.title);

    const completion = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
            {
                role: "system",
                content: `Eres un asistente que extrae datos financieros de frases en español.
Siempre devuelve JSON con estas claves:
- "description" debes relacionarlo y determinar la descripcion analizando lo que menciona el usuario del gasto o ingreso.
- "amount": número (ej: 50000). Nunca null, si no hay monto pon 0.
- "category": debe ser uno de: ${JSON.stringify(categories)}.
- "account": SOLO ponla si el usuario la menciona EXPLÍCITAMENTE y está en esta lista: ${JSON.stringify(accounts)}. Si no, deja null.
- "paymentMethod": SOLO ponlo si el usuario lo menciona EXPLÍCITAMENTE y está en esta lista: ${JSON.stringify(paymentMethods)}. Si no, deja null.`,
            },
            {
                role: "user",
                content: `Texto: "${transcription.text}"`,
            },
        ],
        response_format: { type: "json_object" },
    });

    const content = completion.choices[0].message.content;

    try {
        const parsed = JSON.parse(content || "{}");

        // Validar que la cuenta existe
        if (parsed.account && !accounts.includes(parsed.account)) {
            parsed.account = null;
        }

        // Validar que el método existe
        if (parsed.paymentMethod && !paymentMethods.includes(parsed.paymentMethod)) {
            parsed.paymentMethod = null;
        }

        // Validar que la categoría existe
        if (parsed.category && !categories.includes(parsed.category)) {
            const lowerCategory = parsed.category.toLowerCase();
            const found = categories.find(c => c.toLowerCase() === lowerCategory);
            parsed.category = found || null;
        }

        // Indicar si necesita selección
        parsed.needsAccountSelection = !parsed.account;
        parsed.needsPaymentMethodSelection = !parsed.paymentMethod;

        if (parsed.amount && parsed.category) {
            return parsed;
        }
    } catch {
        return null;
    }

    return null;
}

/**
 * Procesar PDF con OpenAI para extraer datos de factura/ticket
 */
export async function processPDFWithAI(
    base64PDF: string,
    userData: UserCache
): Promise<{ description?: string, amount?: number; category?: string; paymentMethod?: string; account?: string; needsAccountSelection?: boolean; needsPaymentMethodSelection?: boolean } | null> {
    try {
        // Importar pdf2json
        const { default: PDFParser } = await import('pdf2json');

        // Convertir base64 a Buffer
        const pdfBuffer = Buffer.from(base64PDF, 'base64');

        // Crear instancia del parser
        const pdfParser = new (PDFParser as any)(null, 1);

        // Extraer texto del PDF
        const pdfText = await new Promise<string>((resolve, reject) => {
            pdfParser.on('pdfParser_dataError', (errData: any) => {
                console.error('PDF parsing error:', errData.parserError);
                reject(errData.parserError);
            });

            pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
                try {
                    // Extraer texto de todas las páginas
                    let text = '';
                    if (pdfData.Pages) {
                        pdfData.Pages.forEach((page: any) => {
                            if (page.Texts) {
                                page.Texts.forEach((textItem: any) => {
                                    if (textItem.R) {
                                        textItem.R.forEach((r: any) => {
                                            if (r.T) {
                                                text += decodeURIComponent(r.T) + ' ';
                                            }
                                        });
                                    }
                                });
                            }
                        });
                    }
                    resolve(text.trim());
                } catch (err) {
                    reject(err);
                }
            });

            pdfParser.parseBuffer(pdfBuffer);
        });

        // console.log('--- PDF text extracted, length:', pdfText.length);

        if (!pdfText || pdfText.trim().length === 0) {
            console.log('--- PDF has no extractable text');
            return null;
        }

        const categories = userData.categories.map(c => c.nombre);
        const accounts = userData.accounts.map(a => a.title);
        const paymentMethods = userData.paymentMethods.map(p => p.title);

        // Procesar el texto extraído con GPT
        const completion = await client.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: "Eres un asistente que extrae datos financieros de facturas y documentos. Responde SOLO en formato JSON válido, sin explicaciones adicionales.",
                },
                {
                    role: "user",
                    content: `Del siguiente texto de un documento PDF, extrae: monto total y categoría del gasto. Responde SOLO en formato JSON con las claves: amount, category, account, paymentMethod, description.

Texto del documento:
${pdfText}

Reglas:
- "description" debes relacionarlo y determinar la descripción analizando el documento.
- "category" debe ser una de estas: ${categories.join(", ")}.
- "account": SOLO ponla si puedes identificarla claramente en el documento y está en esta lista: ${accounts.join(", ")}. Si no, deja null.
- "paymentMethod": SOLO ponlo si puedes identificarlo claramente en el documento y está en esta lista: ${paymentMethods.join(", ")}. Si no, deja null.`
                },
            ],
            temperature: 0.2,
            max_tokens: 500,
            response_format: { type: "json_object" }
        });

        const content = completion.choices[0].message.content;

        const jsonMatch = content?.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);

            // Validar que la cuenta existe
            if (parsed.account && !accounts.includes(parsed.account)) {
                parsed.account = null;
            }

            // Validar que el método existe
            if (parsed.paymentMethod && !paymentMethods.includes(parsed.paymentMethod)) {
                parsed.paymentMethod = null;
            }

            // Validar que la categoría existe
            if (parsed.category && !categories.includes(parsed.category)) {
                const lowerCategory = parsed.category.toLowerCase();
                const found = categories.find(c => c.toLowerCase() === lowerCategory);
                parsed.category = found || null;
            }

            parsed.description = parsed.description || "Gasto desde PDF";
            // Indicar si necesita selección
            parsed.needsAccountSelection = !parsed.account;
            parsed.needsPaymentMethodSelection = !parsed.paymentMethod;

            if (parsed?.amount && parsed?.category) {
                return parsed;
            }
        }

        return null;
    } catch (error) {
        console.error('Error processing PDF with AI:', error);
        return null;
    }
}
