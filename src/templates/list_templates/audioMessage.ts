import { addKeyword, EVENTS } from "@builderbot/bot";
import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { pipeline } from "stream";
import { promisify } from "util";

const streamPipeline = promisify(pipeline);

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});


export const audioUpload = addKeyword(EVENTS.VOICE_NOTE)
    .addAction(async (ctx, { flowDynamic }) => {
        let filePath = "";
        try {
            if (!ctx.url) {
                return await flowDynamic("⚠️ No detecté ningún audio. Por favor envía un mensaje de voz.");
            }

            // 1. Descargar el audio
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

            // 👇 Convertimos el ReadableStream web a un Node stream
            const nodeStream = fs.createWriteStream(filePath);
            await streamPipeline(res.body as any, nodeStream);

            // 3. Transcribir con OpenAI Whisper
            const transcription = await client.audio.transcriptions.create({
                file: fs.createReadStream(filePath),
                model: "whisper-1",   // 👈 te recomiendo probar este primero
                language: "es",       // 👈 fuerza español
            });

            // console.log("🎤 Transcripción:", transcription.text);

            const categories = [
                "Comida", "Transporte", "Servicios", "Entretenimiento",
                "Salud", "Educación", "Ropa", "Tecnología", "Hogar", "Supermercado", "Otros"
            ];

            const accounts = ["Cuenta Corriente", "Caja de Ahorro", "Efectivo", "Visa"];
            const paymentMethods = ["Efectivo", "Tarjeta crédito", "Tarjeta débito", "Transferencia"];

            const completion = await client.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `Eres un asistente que extrae datos financieros de frases en español.
Siempre devuelve JSON con estas claves:
- "amount": número (ej: 50000). Nunca null, si no hay monto pon 0.
- "category": debe ser uno de: ${JSON.stringify(categories)}.
- "account": debe ser uno de: ${JSON.stringify(accounts)}.
- "paymentMethod": debe ser uno de: ${JSON.stringify(paymentMethods)}.`,
                    },
                    {
                        role: "user",
                        content: `Texto: "${transcription.text}"`,
                    },
                ],
                response_format: { type: "json_object" },
            });

            const content = completion.choices[0].message.content;

            let parsed: {
                amount: number;
                category: string;
                account: string;
                paymentMethod: string;
            };

            try {
                parsed = JSON.parse(content || "{}");
            } catch {
                parsed = { amount: 0, category: "Otros", account: "Efectivo", paymentMethod: "Efectivo" };
            }

            // console.log("🧐 Datos parseados:", parsed);
            if (parsed.amount && parsed.category && parsed.paymentMethod) {
                return await flowDynamic(
                    `✅ He procesado tu audio:\n\n💰 *Monto:* ${parsed.amount}\n📂 *Categoría:* ${parsed.category}\n💳 *Método de pago:* ${parsed.paymentMethod}`
                );
            } else {
                return await flowDynamic(`🎤 Transcribí tu audio:\n\n"${transcription}"`);
            }
        } catch (err) {
            console.error("❌ Error procesando audio:", err);
            return await flowDynamic("🚫 Ocurrió un error procesando tu audio. Intenta nuevamente.");
        }
        finally {
            // 👇 Borrar archivo temporal aunque haya error
            if (fs.existsSync(filePath)) {
                await fs.promises.unlink(filePath);
            }
        }
    });