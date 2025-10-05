/**
 * Verifica si el usuario desea cancelar el flujo actual
 * @param userInput - El mensaje del usuario
 * @returns true si el usuario quiere cancelar, false en caso contrario
 */
export const shouldCancelFlow = (userInput: string): boolean => {
    const normalizedInput = userInput.toLowerCase().trim();
    const cancelKeywords = ['cancelar', 'salir', 'volver', 'menu', 'inicio'];
    
    return cancelKeywords.includes(normalizedInput);
};

/**
 * Obtiene el mensaje de cancelación
 * @returns Mensaje formateado de cancelación
 */
export const getCancelMessage = (): string => {
    return "🔙 Operación cancelada. Volviendo al menú principal...";
};
