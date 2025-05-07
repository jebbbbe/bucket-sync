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
import { pipeline } from "stream/promises";
import mime from "mime";
import { s3, bucket } from "./client.js"

// ---------- Util Functions ---------- //

function getMimeType(localPath) {
    return mime.getType(toLowerCaseExtension(localPath)) || "application/octet-stream";
    function toLowerCaseExtension(filePath) {
        const dir = path.dirname(filePath);
        const base = path.basename(filePath, path.extname(filePath));
        const ext = path.extname(filePath).toLowerCase();
        return path.join(dir, base + ext);
    }
}

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
    targetPath: targetPath = undefined,
    verbose: verbose = false,
}) {
    const copyCommand = new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `/${bucket}/${sourcePath}`,
        Key: targetPath,
    })

    const deleteCommand = new DeleteObjectCommand({
        Bucket: bucket,
        Key: sourcePath,
    })

    await s3.send(copyCommand)
    await s3.send(deleteCommand)
    if (verbose) {
        console.log(`✅ Moved ${sourcePath} → ${targetPath}`)
    }
}

export async function removeObject({
    remotePath: pathKey,
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

export async function listObject({ remotePath: prefix = "", verbose = false }) {
    const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        Delimiter: "/",
    })

    const response = await s3.send(command)
    const files = response.Contents?.map((obj) => obj.Key) || []
    const folders = response.CommonPrefixes?.map((obj) => obj.Prefix) || []
    if (verbose) {
        console.log("📁 Folders:", folders)
        console.log("📄 Files:", files)
    }
    return { folders, files }
}

/**
 * Update a single object's ACL, ContentType, CacheControl (via ttl or explicit),
 * Metadata, etc. Uses PutObjectAclCommand if only ACL changes, otherwise
 * does a self‐copy with MetadataDirective:"REPLACE".
 */
export async function editObject({
    key = undefined,
    acl = undefined,
    contentType = undefined,
    cacheControl = undefined,
    ttl = undefined,
    metadata = undefined,
    verbose = false,
}) {
    // 1) If only ACL is changing, use the lighter ACL call
    if (acl && !contentType && !cacheControl && ttl == null && !metadata) {
        await s3.send(
            new PutObjectAclCommand({
                Bucket: bucket,
                Key: key,
                ACL: acl,
            })
        );
        if (verbose) console.log(`🔒 ACL of ${key} → ${acl}`);
        return;
    }

    // 2) Otherwise, rebuild headers/metadata via self‐copy
    const params = {
        Bucket: bucket,
        CopySource: `/${bucket}/${key}`,
        Key: key,
        MetadataDirective: "REPLACE",
    };
    if (acl) params.ACL = acl;
    if (contentType) params.ContentType = contentType;
    if (cacheControl) params.CacheControl = cacheControl;
    else if (ttl != null) params.CacheControl = `max-age=${ttl}`;
    if (metadata) params.Metadata = metadata;

    await s3.send(new CopyObjectCommand(params));
    if (verbose) console.log(`🔄 Replaced headers/metadata on ${key}`);
}

export async function editObjects({
    prefix = undefined,
    acl = undefined,
    contentType = undefined,
    cacheControl = undefined,
    ttl = undefined,
    metadata = undefined,
    verbose = false,
}) {
    let ContinuationToken;
    do {
        const resp = await s3.send(
            new ListObjectsV2Command({
                Bucket: bucket,
                Prefix: prefix,
                ContinuationToken,
            })
        );
        for (const obj of resp.Contents || []) {
            await editObject({
                key: obj.Key,
                acl,
                contentType,
                cacheControl,
                ttl,
                metadata,
                verbose,
            });
        }
        ContinuationToken = resp.IsTruncated
            ? resp.NextContinuationToken
            : undefined;
    } while (ContinuationToken);

    if (verbose) {
        console.log(`📁 Updated properties on all objects under "${prefix}"`);
    }
}

export async function downloadObject({
    localPath = undefined,
    remotePath = undefined,
    verbose = false,
}) {
    if (!remotePath) throw new Error("`remotePath` is required");
    // derive the output path
    const fileName = path.basename(remotePath);
    let targetPath;

    if (!localPath) {
        // no localPath: save in CWD with the remote filename
        targetPath = fileName;
    } else {
        // if user passed a “directory” (ends with slash or path.sep), place file inside it
        const isDir = localPath.endsWith("/") || localPath.endsWith(path.sep);
        targetPath = isDir
            ? path.join(localPath, fileName)
            : localPath;
    }

    // ensure the directory for targetPath exists
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    console.log(remotePath)
    // fetch the object
    const resp = await s3.send(new GetObjectCommand({
        Bucket: bucket,
        Key: remotePath,
    }));

    // stream it to disk
    await pipeline(resp.Body, createWriteStream(targetPath));

    if (verbose) {
        console.log(`✅ Downloaded ${remotePath} → ${targetPath}`);
    }
}

// export async function downloadObjects({}){} // array implementation?

/**
 * Recursively download all objects under a remote prefix to a local directory.
 *
 * @param {Object} params
 * @param {string} params.remotePath  – the S3 prefix (must end with "/")
 * @param {string} params.localPath   – the local directory to mirror into
 * @param {boolean} [params.verbose=false]
 */
export async function downloadObjects({
  remotePath = undefined,
  localPath  = undefined,
  verbose    = false,
}) {
  if (!remotePath || !remotePath.endsWith("/")) {
    throw new Error("`remotePath` must be a folder prefix ending in '/'");
  }
  if (!localPath) {
    throw new Error("`localPath` is required to download a folder");
  }

  let ContinuationToken;
  do {
    const resp = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: remotePath,
        ContinuationToken,
      })
    );

    for (const obj of resp.Contents || []) {
      // skip any “folder placeholder” keys
      if (obj.Key.endsWith("/")) continue;

      const relPath = obj.Key.slice(remotePath.length);
      const dest    = path.join(localPath, relPath);

      // reuse downloadObject
      await downloadObject({
        remotePath: obj.Key,
        localPath:  dest,
        verbose,
      });
    }

    ContinuationToken = resp.IsTruncated
      ? resp.NextContinuationToken
      : undefined;
  } while (ContinuationToken);

  if (verbose) {
    console.log(`📂 Downloaded folder ${remotePath} → ${localPath}`);
  }
}


