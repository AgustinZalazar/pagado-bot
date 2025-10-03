export const renderFormattedAmount = (
    amount: number | string,
    currency: string,
    type: "income" | "expense",
    locale: string
) => {
    const parsedAmount = typeof amount === "string"
        ? parseFloat(amount.replace(",", "."))
        : typeof amount === "number"
            ? amount
            : 0;

    const parts = formatCurrency(parsedAmount, currency, locale);
    const formatted = parts.map((part) => part.value).join("");

    return formatted;
};

export const formatCurrency = (value: number, currency: string, locale: string) =>
    new Intl.NumberFormat(locale, {
        style: "currency",
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).formatToParts(value);