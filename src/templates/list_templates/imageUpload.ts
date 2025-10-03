import { addKeyword, EVENTS } from "@builderbot/bot";
import axios from "axios";
import OpenAI from "openai";

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export const imageUpload = addKeyword(EVENTS.MEDIA)
    .addAction(async (ctx, { flowDynamic }) => {
        try {
            if (ctx.type !== "image" || !ctx.url) {
                return await flowDynamic("⚠️ No detecté ninguna imagen. Por favor envía una foto de tu ticket o factura.");
            }
            const categories = ["Comida", "Transporte", "Servicios", "Entretenimiento", "Salud", "Educación", "Ropa", "Tecnología", "Hogar", "Otros", "Supermercado"];
            const accounts = ["Cuenta Corriente", "Efectivo", "Visa"];
            const paymentMethods = ["Efectivo", "Tarjeta Crédito", "Tarjeta Débito", "Transferencia"];

            // 1. Descargar imagen
            const response = await axios.get(ctx.url, {
                responseType: "arraybuffer", headers: {
                    Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
                },
            });
            const base64Image = Buffer.from(response.data).toString("base64");

            // 2. Llamar a OpenAI Vision usando la librería
            const completion = await client.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: "Eres un asistente que extrae datos financieros de tickets y facturas.Responde SOLO en formato JSON válido, sin explicaciones adicionales.",
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: `De esta imagen extrae: monto total, categoría del gasto (ej: comida, transporte, servicios), y método de pago (efectivo, tarjeta crédito, tarjeta débito, transferencia). Responde SOLO en formato JSON con las claves: amount, category, paymentMethod.
                                        Reglas:
                                            - "category" debe ser una de estas: ${categories.join(", ")}.
                                            - "account" debe ser una de estas: ${accounts.join(", ")}.
                                            - "paymentMethod" debe ser una de estas: ${paymentMethods.join(", ")}.
                                            - Si no encuentras coincidencia exacta, elige la más cercana.
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
            console.log("📄 Respuesta OpenAI:", content);

            let parsed;
            try {
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    parsed = JSON.parse(jsonMatch[0]);
                } else {
                    parsed = null;
                }
            } catch {
                parsed = null;
            }

            console.log("🧐 Datos parseados:", parsed);
            if (parsed?.amount && parsed?.category && parsed?.paymentMethod) {
                return await flowDynamic(
                    `✅ He procesado tu ticket:\n\n💰 *Monto:* ${parsed.amount}\n📂 *Categoría:* ${parsed.category}\n💳 *Método de pago:* ${parsed.paymentMethod}`
                );
            } else {
                return await flowDynamic(`📷 Analicé tu ticket y encontré lo siguiente:\n\n${content}`);
            }
        } catch (err) {
            console.error("❌ Error procesando imagen:", err);
            return await flowDynamic("🚫 Ocurrió un error procesando tu ticket. Intenta nuevamente.");
        }
    });