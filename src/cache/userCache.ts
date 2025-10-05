import axios from 'axios'
export type UserCache = {
    name: string;
    email: string;
    categories: { id: string, nombre: string, color?: string, porcentaje?: string, icon?: string | null }[];
    accounts: { id: string, title: string }[];
    paymentMethods: { id: string, title: string, cardType?: string, idAccount: string }[];
    lastUpdated: number; // para TTL
};


// Tiempo máximo de cache en milisegundos (ej: 5 minutos)
const TTL = 5 * 60 * 1000;

export async function getUserData(userPhone: string, state: any) {
    const cached: UserCache | null = await state.get("userCache");

    // ✅ Si existe y no expiró, lo devolvemos
    if (cached && Date.now() - cached.lastUpdated < TTL) {
        return cached;
    }

    // ❌ Si no está cacheado o expiró, lo pedimos a la API externa
    const { data } = await axios.get(`${process.env.API_URL}/user/phone/${userPhone}`, {
        headers: {
            'Authorization': `Bearer ${process.env.API_SECRET_TOKEN}`,
        },
    })
    const { data: methodData } = await axios.get(`${process.env.API_URL}/methods?mail=${data.email}`, {
        headers: { Authorization: `Bearer ${process.env.API_SECRET_TOKEN}` },
    });

    const { formattedMethods } = methodData
    const { data: accountData } = await axios.get(`${process.env.API_URL}/accounts?mail=${data.email}`,
        {
            headers: { Authorization: `Bearer ${process.env.API_SECRET_TOKEN}` },
        }
    );

    const { formattedAccounts } = accountData;

    const categories = await axios.get(`${process.env.API_URL}/category?mail=${data.email}`, {
        headers: {
            'Authorization': `Bearer ${process.env.API_SECRET_TOKEN}`,
        },
    });
    const listCategories = categories.data.formattedCategories


    // Lo guardamos en cache
    const newData: UserCache = {
        name: data.name,
        email: data.email,
        categories: listCategories,
        accounts: formattedAccounts,
        paymentMethods: formattedMethods,
        lastUpdated: Date.now(),
    };

    await state.update({ userCache: newData });

    return newData;
}