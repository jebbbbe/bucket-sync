import dotenv from "dotenv"
import { S3Client } from "@aws-sdk/client-s3"
dotenv.config()

let envKeys = {
    ENDPOINT: "ENDPOINT",
    KEY: "KEY",
    SECRET: "SECRET",
    BUCKET: "BUCKET",
}

let cache = {
    initialized: false,
    s3: null,
    bucket: null,
}

function resolveConfig() {
    const endpoint = process.env[envKeys.ENDPOINT]
    const key = process.env[envKeys.KEY]
    const secret = process.env[envKeys.SECRET]
    const bucket = process.env[envKeys.BUCKET]

    if (!endpoint || !key || !secret || !bucket) {
        throw new Error(
            `Missing required env. Got endpoint=${!!endpoint}, key=${!!key}, secret=${!!secret}, bucket=${!!bucket}. ` +
                `Expected env var names: ENDPOINT=${envKeys.ENDPOINT}, KEY=${envKeys.KEY}, SECRET=${envKeys.SECRET}, BUCKET=${envKeys.BUCKET}`
        )
    }

    const s3 = new S3Client({
        endpoint: `https://${endpoint}`,
        region: "us-east-1",
        credentials: { accessKeyId: key, secretAccessKey: secret },
        forcePathStyle: true, // optional, depends on your endpoint
    })

    cache = { initialized: true, s3, bucket }
}

function ensureInit() {
    if (!cache.initialized) resolveConfig()
}

export function setUpEnv(overrides = {}) {
    envKeys = { ...envKeys, ...overrides }
    cache = { initialized: false, s3: null, bucket: null }
    ensureInit()
}

export function getS3() {
    ensureInit()
    return cache.s3
}
export function getBucket() {
    ensureInit()
    return cache.bucket
}
export function getClient() {
    ensureInit()
    return { s3: cache.s3, bucket: cache.bucket }
}
