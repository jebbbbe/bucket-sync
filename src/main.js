import {
    S3Client,
    ListObjectsV2Command,
    GetObjectCommand,
    PutObjectCommand,
    DeleteObjectCommand,
    CopyObjectCommand,
    HeadObjectCommand,
} from "@aws-sdk/client-s3"
import dotenv from "dotenv"
import fs from "fs/promises"
import path from "path"
import { createReadStream, statSync } from "fs"

dotenv.config()
const s3 = new S3Client({
    endpoint: `https://${process.env.DO_SPACE_ENDPOINT}`,
    region: "us-east-1",
    credentials: {
        accessKeyId: process.env.DO_SPACE_KEY,
        secretAccessKey: process.env.DO_SPACE_SECRET,
    },
})

const bucket = process.env.DO_SPACE_BUCKET

// ---------- Core Functions ---------- //

export async function uploadFile({
    localPath = undefined,
    remotePath = undefined,
    isPublic = false,
    verbose = false,
    override = true,
}) {
    const stream = createReadStream(localPath)
    const fileName = path.basename(localPath)
    const isDir = remotePath.endsWith("/")
    const fullRemotePath = isDir ? remotePath + fileName : remotePath

    if (!override) {
        try {
            await s3.send(
                new HeadObjectCommand({
                    Bucket: bucket,
                    Key: fullRemotePath,
                })
            )
            // File exists
            if (verbose) {
                console.log(`⏭️  Skipped (exists): ${fullRemotePath}`)
            }
            return
        } catch (err) {
            if (err.name !== "NotFound") {
                throw err // real error
            }
            // else: file doesn't exist → proceed
        }
    }

    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: fullRemotePath,
        Body: stream,
        ACL: isPublic ? "public-read" : undefined,
    })

    await s3.send(command)
    if (verbose) {
        console.log(`✅ Uploaded file to ${fullRemotePath}`)
    }
}

export async function uploadFolder({
    localPath: localFolder = undefined,
    remotePath: remoteFolder = undefined,
    isPublic = false,
    verbose = false,
    override = true,
}) {
    const entries = await fs.readdir(localFolder, { withFileTypes: true })

    for (const entry of entries) {
        const fullPath = path.join(localFolder, entry.name)
        const remotePath = path.posix.join(remoteFolder, entry.name)

        if (entry.isDirectory()) {
            await uploadFolder({
                localPath: fullPath,
                remotePath: remotePath,
                isPublic: isPublic,
                verbose: verbose,
                override: override,
            })
        } else {
            await uploadFile({
                localPath: fullPath,
                remotePath: remotePath,
                isPublic: isPublic,
                verbose: verbose,
                override: override,
            })
        }
    }

    if (verbose && override == true) {
        // override logs even if folder already exits...
        console.log(`✅ Uploaded folder ${localFolder} to ${remoteFolder}`)
    }
}

export async function moveObject({
    sourcePath: sourcePath = undefined,
    destinationPath: destinationPath = undefined,
    verbose: verbose = false,
}) {
    const copyCommand = new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `/${bucket}/${sourcePath}`,
        Key: destinationPath,
    })

    const deleteCommand = new DeleteObjectCommand({
        Bucket: bucket,
        Key: sourcePath,
    })

    await s3.send(copyCommand)
    await s3.send(deleteCommand)
    if (verbose) {
        console.log(`✅ Moved ${sourcePath} → ${destinationPath}`)
    }
}

export async function removeObject({
    pathKey: pathKey,
    verbose: verbose = false,
}) {
    const listCommand = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: pathKey,
    })

    const list = await s3.send(listCommand)
    if (!list.Contents || list.Contents.length === 0) {
        console.log("⚠️ No such file or directory")
        return
    }

    for (const item of list.Contents) {
        await s3.send(
            new DeleteObjectCommand({
                Bucket: bucket,
                Key: item.Key,
            })
        )

        if (verbose) {
            console.log(`🗑️  Deleted ${item.Key}`)
        }
    }
}

export async function listObjects({ prefix: prefix = "" }) {
    const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        Delimiter: "/",
    })

    const response = await s3.send(command)
    const files = response.Contents?.map((obj) => obj.Key) || []
    const folders = response.CommonPrefixes?.map((obj) => obj.Prefix) || []

    console.log("📁 Folders:", folders)
    console.log("📄 Files:", files)
    return { folders, files }
}
