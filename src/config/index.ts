import "dotenv/config"

export const config = {
    PORT: process.env.PORT ?? 3008,
    //META
    jwtToken: process.env.META_ACCESS_TOKEN,
    numberId: process.env.META_PHONE_NUMBER_ID,
    verifyToken: process.env.META_VERIFY_TOKEN,
    version: "v22.0"
    //AI
}