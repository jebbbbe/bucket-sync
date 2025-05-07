import dotenv from "dotenv"
import { S3Client } from "@aws-sdk/client-s3"

dotenv.config()
if (!process.env.ENDPOINT) {
    throw new Error("Missing ENDPOINT in environment variables.");
}
if (!process.env.KEY) {
    throw new Error("Missing KEY in environment variables.");
}
if (!process.env.SECRET) {
    throw new Error("Missing SECRET in environment variables.");
}
if (!process.env.BUCKET) {
    throw new Error("Missing BUCKET in environment variables.");
}

export const s3 = new S3Client({
    endpoint: `https://${process.env.ENDPOINT}`,
    region: "us-east-1",
    credentials: {
        accessKeyId: process.env.KEY,
        secretAccessKey: process.env.SECRET,
    },
})

export let bucket = process.env.BUCKET
