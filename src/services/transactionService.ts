import axios from "axios";

export interface TransactionData {
    description: string;
    type: "expense" | "income";
    category: string;
    amount: number;
    currency: string;
    account: string;
    method: string;
}

/**
 * Crear una nueva transacción (gasto o ingreso)
 */
export async function createTransaction(email: string, transactionData: TransactionData) {
    const date = new Date();
    const body = {
        id: "",
        description: transactionData.description,
        type: transactionData.type,
        category: transactionData.category,
        amount: transactionData.amount,
        date: date.toString(),
        currency: transactionData.currency,
        account: transactionData.account,
        method: transactionData.method
    };

    const response = await axios.post(
        `${process.env.API_URL}/transaction?mail=${email}`,
        body,
        {
            headers: {
                Authorization: `Bearer ${process.env.API_SECRET_TOKEN}`
            }
        }
    );

    return response.data;
}

/**
 * Obtener la última transacción de un tipo específico
 */
export async function getLastTransaction(email: string, type: "expense" | "income") {
    const date = new Date().toISOString();
    const currentDate = date.split("T")[0];

    const response = await axios.get(
        `${process.env.API_URL}/transaction?mail=${email}&month=${currentDate}`,
        {
            headers: {
                Authorization: `Bearer ${process.env.API_SECRET_TOKEN}`
            }
        }
    );

    if (!response.data?.formattedTransactions) {
        throw new Error('No se encontraron transacciones para el usuario.');
    }

    const lastTransaction = response.data.formattedTransactions
        .filter((t: any) => t.type === type)
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] || null;

    return lastTransaction;
}

/**
 * Obtener todas las transacciones del mes actual
 */
export async function getCurrentMonthTransactions(email: string) {
    const date = new Date().toISOString();
    const currentDate = date.split("T")[0];

    const response = await axios.get(
        `${process.env.API_URL}/transaction?mail=${email}&month=${currentDate}`,
        {
            headers: {
                Authorization: `Bearer ${process.env.API_SECRET_TOKEN}`
            }
        }
    );

    return response.data?.formattedTransactions || [];
}
