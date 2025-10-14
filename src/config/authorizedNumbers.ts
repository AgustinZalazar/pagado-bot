// Números de teléfono autorizados para usar las funcionalidades de IA
// Formato: número completo con código de país (sin +)
// Ejemplo: "5491112345678" para Argentina

export const AUTHORIZED_NUMBERS = [
    // Agrega aquí los números autorizados
    "5491133718310",
    "5491130403326",
    "5491138171496",
    "5491166503881",
    "5491162167559"
];

/**
 * Verifica si un número está autorizado para usar IA
 * @param phoneNumber - Número de teléfono a verificar
 * @returns true si está autorizado, false si no
 */
export function isAuthorizedForAI(phoneNumber: string): boolean {
    // Si la lista está vacía, permitir acceso a todos (modo desarrollo)
    if (AUTHORIZED_NUMBERS.length === 0) {
        return true;
    }

    return AUTHORIZED_NUMBERS.includes(phoneNumber);
}