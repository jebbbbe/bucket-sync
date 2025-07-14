import dotenv from "dotenv"
import { S3Client } from "@aws-sdk/client-s3"

const envKeys = {
    ENDPOINT: "ENDPOINT",
    KEY: "KEY",
    SECRET: "SECRET",
    BUCKET: "BUCKET",
}

dotenv.config()
verifyEnvKeys()

export let bucket = process.env[envKeys.BUCKET]
export let s3 = new S3Client({
    endpoint: `https://${process.env[envKeys.ENDPOINT]}`,
    region: "us-east-1",
    credentials: {
        accessKeyId: process.env[envKeys.KEY],
        secretAccessKey: process.env[envKeys.SECRET],
    },
})

export function setCredentials({ ENDPOINT, KEY, SECRET }) {
    envKeys.ENDPOINT = ENDPOINT
    envKeys.KEY = KEY
    envKeys.SECRET = SECRET
}
export function setBucket(_bucket) {
    envKeys.BUCKET = _bucket
    bucket = process.env[envKeys.BUCKET]
}
export function setBucketFromString(_bucket) {
    bucket = _bucket
}
export function setS3() {
    s3 = new S3Client({
        endpoint: `https://${process.env[envKeys.ENDPOINT]}`,
        region: "us-east-1",
        credentials: {
            accessKeyId: process.env[envKeys.KEY],
            secretAccessKey: process.env[envKeys.SECRET],
        },
    })
}

function verifyEnvKeys() {
    if (!process.env[envKeys.ENDPOINT]) {
        throw new Error("Missing ENDPOINT in environment variables.")
    }
    if (!process.env[envKeys.KEY]) {
        throw new Error("Missing KEY in environment variables.")
    }
    if (!process.env[envKeys.SECRET]) {
        throw new Error("Missing SECRET in environment variables.")
    }
    if (!process.env[envKeys.BUCKET]) {
        throw new Error("Missing BUCKET in environment variables.")
    }
}
