import {
    ListObjectsV2Command,
    GetObjectCommand,
    PutObjectCommand,
    DeleteObjectCommand,
    CopyObjectCommand,
    HeadObjectCommand,
} from "@aws-sdk/client-s3"
import fs from "fs/promises"
import path from "path"
import { createReadStream, statSync, createWriteStream } from "fs"
import { pipeline } from "stream/promises"
import mime from "mime"
import { getClient } from "./client.js"
import { limit } from "./limit.js"

// ---------- Util Functions ---------- //
// prettier-ignore
const wrapLimit = (fn) => (...args) => limit(() => fn(...args))

function getMimeType(localPath) {
    return (
        mime.getType(toLowerCaseExtension(localPath)) ||
        "application/octet-stream"
    )
    function toLowerCaseExtension(filePath) {
        const dir = path.dirname(filePath)
        const base = path.basename(filePath, path.extname(filePath))
        const ext = path.extname(filePath).toLowerCase()
        return path.join(dir, base + ext)
    }
}

// ---------- exports ---------- //
export const uploadFile = wrapLimit(_uploadFile)
export const uploadFolder = wrapLimit(_uploadFolder)
export const listObject = wrapLimit(_listObject)
export const removeObject = wrapLimit(_removeObject)
export const moveObject = wrapLimit(_moveObject)
export const copyObject = wrapLimit(_copyObject)
export const downloadObject = wrapLimit(_downloadObject)
export const editObject = wrapLimit(_editObject)
export const editObjects = wrapLimit(_editObjects)

// ---------- Core Functions ---------- //

async function _uploadFile({
    localPath = undefined,
    remotePath = undefined,
    isPublic = false,
    verbose = false,
    override = true,
}) {
    const { s3, bucket } = getClient()
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

    const mimeType = getMimeType(localPath)

    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: fullRemotePath,
        Body: stream,
        ACL: isPublic ? "public-read" : undefined,
        ContentType: mimeType,
    })

    await s3.send(command)
    if (verbose) {
        console.log(`✅ Uploaded file to ${fullRemotePath}`)
    }
}

async function _uploadFolder({
    localPath: localFolder = undefined,
    remotePath: remoteFolder = undefined,
    isPublic = false,
    verbose = false,
    override = true,
}) {
    const { s3, bucket } = getClient()
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

async function _listObject({
    remotePath: remotePrefix = "",
    verbose = false,
    recursive = false,
}) {
    const { s3, bucket } = getClient()
    // build base command parameters
    const params = {
        Bucket: bucket,
        Prefix: remotePrefix,
    }
    if (!recursive) {
        // shallow listing: only immediate children
        // only if we pass a folder in instead of a file.
        params.Delimiter = "/"
    }

    const files = []
    let ContinuationToken

    do {
        // attach ContinuationToken if this isn't the first page
        if (ContinuationToken) {
            params.ContinuationToken = ContinuationToken
        }
        // send the list command
        const resp = await s3.send(new ListObjectsV2Command(params))

        // collect file keys from this page
        if (resp.Contents) {
            files.push(...resp.Contents.map((o) => o.Key))
        }

        // prepare for next page (if any)
        ContinuationToken = resp.IsTruncated
            ? resp.NextContinuationToken
            : undefined
    } while (ContinuationToken)

    if (verbose) {
        console.log("📄 Files:", files)
    }

    return files
}

async function _removeObject({
    remotePath: prefix = "",
    verbose: verbose = false,
    recursive: recursive = false,
}) {
    const { s3, bucket } = getClient()
    // 1) discover which keys to delete
    const files = await listObject({
        remotePath: prefix,
        verbose: false,
        recursive: recursive,
    })

    if (files.length === 0) {
        if (verbose) console.log(`⚠️ No objects found under ${prefix}`)
        return
    }

    // 2) delete each key
    for (const key of files) {
        await s3.send(
            new DeleteObjectCommand({
                Bucket: bucket,
                Key: key,
            })
        )
        if (verbose) console.log(`🗑️  Deleted ${key}`)
    }
}

async function _moveObject({
    remotePath: source = "",
    targetPath: target = "",
    verbose: verbose = false,
    recursive: recursive = false,
}) {
    const { s3, bucket } = getClient()
    const files = await listObject({
        remotePath: source,
        verbose: false,
        recursive: recursive,
    })

    if (files.length === 0) {
        if (verbose) console.log(`⚠️ No objects found at ${source}`)
        return
    }

    // 2) Perform copy + delete for each key
    for (const key of files) {
        // Compute the new key:
        // - If source is a prefix (ends with "/"), preserve the relative path under target prefix
        // - If source is a single key, target is the exact target key
        let targetKey
        if (source.endsWith("/")) {
            const relative = key.slice(source.length)
            targetKey = target.endsWith("/")
                ? target + relative
                : target + "/" + relative
        } else {
            targetKey = target
        }

        // 2a) Copy
        await s3.send(
            new CopyObjectCommand({
                Bucket: bucket,
                CopySource: `/${bucket}/${encodeURIComponent(key)}`,
                Key: targetKey,
            })
        )
        if (verbose) console.log(`📄 Copied ${key} → ${targetKey}`)

        // 2b) Delete original
        await s3.send(
            new DeleteObjectCommand({
                Bucket: bucket,
                Key: key,
            })
        )
        if (verbose) console.log(`🗑️ Deleted ${key}`)
    }

    if (verbose)
        console.log(
            `✅ Moved ${keys.length} object(s) from ${source} to ${target}`
        )
}

async function _copyObject({
    remotePath: source = "",
    targetPath: target = "",
    verbose: verbose = false,
    recursive: recursive = false,
}) {
    const { s3, bucket } = getClient()
    const files = await listObject({
        remotePath: source,
        verbose: false,
        recursive,
    })

    if (files.length === 0) {
        if (verbose) console.log(`⚠️ No objects found at ${source}`)
        return
    }

    // 2) Perform copy + delete for each key
    for (const key of files) {
        // Compute the new key:
        // - If source is a prefix (ends with "/"), preserve the relative path under target prefix
        // - If source is a single key, target is the exact target key
        let targetKey
        if (source.endsWith("/")) {
            const relative = key.slice(source.length)
            targetKey = target.endsWith("/")
                ? target + relative
                : target + "/" + relative
        } else {
            targetKey = target
        }

        // 2a) Copy
        await s3.send(
            new CopyObjectCommand({
                Bucket: bucket,
                CopySource: `/${bucket}/${encodeURIComponent(key)}`,
                Key: targetKey,
            })
        )
        if (verbose) console.log(`📄 Copied ${key} → ${targetKey}`)
    }

    if (verbose)
        console.log(
            `✅ Moved ${files.length} object(s) from ${source} to ${target}`
        )
}

async function _downloadObject({
    remotePath = undefined,
    localPath = undefined,
    overwrite = false,
    verbose = false,
    recursive = false,
}) {
    const { s3, bucket } = getClient()
    if (!remotePath) throw new Error("`remotePath` is required")

    // If this is a “folder” prefix or recursive flag, do a batch download
    const isFolder = remotePath.endsWith("/")
    if (isFolder || recursive) {
        // discover all file keys under this prefix
        const files = await listObject({
            remotePath,
            verbose: false,
            recursive: true,
        })

        // download each file, but turn off recursion to avoid infinite loop
        for (const key of files) {
            // derive a per-file local path
            let dest
            if (!localPath) {
                dest = path.basename(key)
            } else {
                const asDir =
                    localPath.endsWith("/") || localPath.endsWith(path.sep)
                dest = asDir
                    ? path.join(localPath, key.slice(remotePath.length))
                    : localPath
            }

            await downloadObject({
                remotePath: key,
                localPath: dest,
                overwrite,
                verbose,
                recursive: false,
            })
        }
        return
    }

    // ------ single-file logic below ------

    // derive target path (filename or explicit path)
    const fileName = path.basename(remotePath)
    let targetPath
    if (!localPath) {
        targetPath = fileName
    } else {
        const isDir = localPath.endsWith("/") || localPath.endsWith(path.sep)
        targetPath = isDir ? path.join(localPath, fileName) : localPath
    }

    // check exists
    let exists = false
    try {
        const stats = await fs.stat(targetPath)
        exists = stats.isFile()
    } catch (err) {
        if (err.code !== "ENOENT") throw err
    }
    if (exists && !overwrite) {
        if (verbose) console.log(`⏭️ Skipped (exists): ${targetPath}`)
        return
    }

    // ensure directory
    await fs.mkdir(path.dirname(targetPath), { recursive: true })

    // fetch & write
    const resp = await s3.send(
        new GetObjectCommand({
            Bucket: bucket,
            Key: remotePath,
        })
    )
    await pipeline(resp.Body, createWriteStream(targetPath))

    if (verbose) {
        console.log(`✅ Downloaded ${remotePath} → ${targetPath}`)
    }
}

/**
 * Update a single object's ACL, ContentType, CacheControl (via ttl or explicit),
 * Metadata, etc. Uses PutObjectAclCommand if only ACL changes, otherwise
 * does a self‐copy with MetadataDirective:"REPLACE".
 */
async function _editObject({
    key = undefined,
    acl = undefined,
    contentType = undefined,
    cacheControl = undefined,
    ttl = undefined,
    metadata = undefined,
    verbose = false,
}) {
    const { s3, bucket } = getClient()
    // 1) If only ACL is changing, use the lighter ACL call
    if (acl && !contentType && !cacheControl && ttl == null && !metadata) {
        await s3.send(
            new PutObjectAclCommand({
                Bucket: bucket,
                Key: key,
                ACL: acl,
            })
        )
        if (verbose) console.log(`🔒 ACL of ${key} → ${acl}`)
        return
    }

    // 2) Otherwise, rebuild headers/metadata via self‐copy
    const params = {
        Bucket: bucket,
        CopySource: `/${bucket}/${key}`,
        Key: key,
        MetadataDirective: "REPLACE",
    }
    if (acl) params.ACL = acl
    if (contentType) params.ContentType = contentType
    if (cacheControl) params.CacheControl = cacheControl
    else if (ttl != null) params.CacheControl = `max-age=${ttl}`
    if (metadata) params.Metadata = metadata

    await s3.send(new CopyObjectCommand(params))
    if (verbose) console.log(`🔄 Replaced headers/metadata on ${key}`)
}

async function _editObjects({
    prefix = undefined,
    acl = undefined,
    contentType = undefined,
    cacheControl = undefined,
    ttl = undefined,
    metadata = undefined,
    verbose = false,
}) {
    const { s3, bucket } = getClient()
    let ContinuationToken
    do {
        const resp = await s3.send(
            new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: prefix,
                ContinuationToken,
            })
        )
        for (const obj of resp.Contents || []) {
            await editObject({
                key: obj.Key,
                acl,
                contentType,
                cacheControl,
                ttl,
                metadata,
                verbose,
            })
        }
        ContinuationToken = resp.IsTruncated
            ? resp.NextContinuationToken
            : undefined
    } while (ContinuationToken)

    if (verbose) {
        console.log(`📁 Updated properties on all objects under "${prefix}"`)
    }
}

// // export async function downloadObject({
// //     localPath = undefined,
// //     remotePath = undefined,
// //     verbose = false,
// // }) {
// //     if (!remotePath) throw new Error("`remotePath` is required")
// //     // derive the output path
// //     const fileName = path.basename(remotePath)
// //     let targetPath

// //     if (!localPath) {
// //         // no localPath: save in CWD with the remote filename
// //         targetPath = fileName
// //     } else {
// //         // if user passed a “directory” (ends with slash or path.sep), place file inside it
// //         const isDir = localPath.endsWith("/") || localPath.endsWith(path.sep)
// //         targetPath = isDir ? path.join(localPath, fileName) : localPath
// //     }

// //     // ensure the directory for targetPath exists
// //     await fs.mkdir(path.dirname(targetPath), { recursive: true })

// //     console.log(remotePath)
// //     // fetch the object
// //     const resp = await s3.send(
// //         new GetObjectCommand({
// //             Bucket: bucket,
// //             Key: remotePath,
// //         })
// //     )

// //     // stream it to disk
// //     await pipeline(resp.Body, createWriteStream(targetPath))

// //     if (verbose) {
// //         console.log(`✅ Downloaded ${remotePath} → ${targetPath}`)
// //     }
// // }

// // export async function downloadObjects({}){} // array implementation?

// /**
//  * Recursively download all objects under a remote prefix to a local directory.
//  *
//  * @param {Object} params
//  * @param {string} params.remotePath  – the S3 prefix (must end with "/")
//  * @param {string} params.localPath   – the local directory to mirror into
//  * @param {boolean} [params.verbose=false]
//  */
// export async function downloadObjects({
//     remotePath = undefined,
//     localPath = undefined,
//     verbose = false,
// }) {
//     if (!remotePath || !remotePath.endsWith("/")) {
//         throw new Error("`remotePath` must be a folder prefix ending in '/'")
//     }
//     if (!localPath) {
//         throw new Error("`localPath` is required to download a folder")
//     }

//     let ContinuationToken
//     do {
//         const resp = await s3.send(
//             new ListObjectsV2Command({
//                 Bucket: bucket,
//                 Prefix: remotePath,
//                 ContinuationToken,
//             })
//         )

//         for (const obj of resp.Contents || []) {
//             // skip any “folder placeholder” keys
//             if (obj.Key.endsWith("/")) continue

//             const relPath = obj.Key.slice(remotePath.length)
//             const dest = path.join(localPath, relPath)

//             // reuse downloadObject
//             await downloadObject({
//                 remotePath: obj.Key,
//                 localPath: dest,
//                 verbose,
//             })
//         }

//         ContinuationToken = resp.IsTruncated
//             ? resp.NextContinuationToken
//             : undefined
//     } while (ContinuationToken)

//     if (verbose) {
//         console.log(`📂 Downloaded folder ${remotePath} → ${localPath}`)
//     }
// }
