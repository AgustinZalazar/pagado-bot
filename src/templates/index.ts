import { createFlow } from "@builderbot/bot";
import { mainFlow } from "./mainFlow";
import { templateWithAI } from "./templateWithAI";
import { templateWithOutAI } from "./templateWithOutAI";
import { ingresos } from "./list_templates/ingresos";
import { gastosRecurrentes } from "./list_templates/gastosRecurrentes";
import { deudas } from "./list_templates/deudas";
import { ahorros } from "./list_templates/ahorros";
import { inversiones } from "./list_templates/inversiones";
import { agregarIngreso } from "./list_templates/gastosIngresos/agregarIngreso";
import { ultimoIngreso } from "./list_templates/gastosIngresos/ultimoIngreso";
import { ultimoGasto } from "./list_templates/gastosIngresos/ultimoGasto";
import { gastos } from "./list_templates/gastos";
import { agregarGasto } from "./list_templates/gastosIngresos/agregarGasto";
import { imageUpload } from "./list_templates/imageUpload";
import { audioUpload } from "./list_templates/audioMessage";
import { pdfUpload } from "./list_templates/pdfUpload";

export default createFlow([
    imageUpload,
    audioUpload,
    pdfUpload,
    mainFlow,
    templateWithAI,
    templateWithOutAI,
    ingresos,
    gastosRecurrentes,
    deudas,
    ahorros,
    inversiones,
    agregarIngreso,
    ultimoIngreso,
    ultimoGasto,
    gastos,
    agregarGasto
])