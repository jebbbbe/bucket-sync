// spacesManager.js

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import fs from "fs/promises";
import path from "path";
import { createReadStream, statSync } from "fs";
import { fileURLToPath } from 'url';

dotenv.config();
const s3 = new S3Client({
  endpoint: `https://${process.env.DO_SPACE_ENDPOINT}`,
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.DO_SPACE_KEY,
    secretAccessKey: process.env.DO_SPACE_SECRET,
  },
});

const bucket = process.env.DO_SPACE_BUCKET;

// ---------- Core Functions ---------- //

export async function uploadFile(localPath, remotePath, verbose = false) {
    // if( path.extname(localPath) !== "" &&  !remotePath.endsWith('/') ){
    //     throw new Error("remotePath is not a folder")
    // }
    const stream = createReadStream(localPath);
    const fileName = path.basename(localPath);

    const command = new PutObjectCommand({
        Bucket: bucket,
        Key: remotePath.endsWith('/') ? remotePath + fileName : remotePath,
        Body: stream,
    });

    await s3.send(command);
    if(verbose){
        console.log(`✅ Uploaded file to ${remotePath}`);
    }
}

export async function uploadFolder(localFolder, remoteFolder, verbose = false) {
    const entries = await fs.readdir(localFolder, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(localFolder, entry.name);
        const remotePath = path.posix.join(remoteFolder, entry.name);

        if (entry.isDirectory()) {
        await uploadFolder(fullPath, remotePath);
        } else {
        await uploadFile(fullPath, remotePath);
        }
    }
    if(verbose){
        console.log(`✅ Uploaded folder ${localFolder} to ${remoteFolder}`);
    }
}

export async function moveObject(sourcePath, destinationPath, verbose = false) {
    const copyCommand = new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `/${bucket}/${sourcePath}`,
        Key: destinationPath,
    });

    const deleteCommand = new DeleteObjectCommand({
        Bucket: bucket,
        Key: sourcePath,
    });

    await s3.send(copyCommand);
    await s3.send(deleteCommand);
    if(verbose){
        console.log(`✅ Moved ${sourcePath} → ${destinationPath}`);
    }
}

export async function removeObject(pathKey, verbose = false) {
    const listCommand = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: pathKey,
    });

    const list = await s3.send(listCommand);
    if (!list.Contents || list.Contents.length === 0) {
        console.log("⚠️ No such file or directory");
        return;
    }

    for (const item of list.Contents) {
        await s3.send(new DeleteObjectCommand({
        Bucket: bucket,
        Key: item.Key,
        }));

        if(verbose){
            console.log(`🗑️ Deleted ${item.Key}`);
        }
    }
}

export async function listObjects(prefix = "") {
  const command = new ListObjectsV2Command({
    Bucket: bucket,
    Prefix: prefix,
    Delimiter: "/",
  });

  const response = await s3.send(command);
  const files = response.Contents?.map(obj => obj.Key) || [];
  const folders = response.CommonPrefixes?.map(obj => obj.Prefix) || [];

  console.log("📁 Folders:", folders);
  console.log("📄 Files:", files);
  return { folders, files };
}

// ---------- Simple Tests (Run with: node spacesManager.js) ---------- //

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
      try {

          // upload file
          await uploadFile("test/upload/hello.txt", "test/uploadFile/", true);
          await listObjects("test/uploadFile/")
          
          // upload folder
          await uploadFolder("test/upload/", "test/uploadfolder/", true);
          await listObjects("test/uploadfolder/")
          
          // move folder
          // await uploadFolder("test/upload/", "test/movefolder/", true);
          // await moveObject("test/movefolder/", "test/movefolder/move", true)
          
          // delete file
          await uploadFile("test/upload/hello.txt", "test/removeFile/", true);
          await listObjects("test/removeFile/")
          await removeObject("test/removeFile/", true);
          await listObjects("test/removeFile/")
          
          // delete folder
          await uploadFolder("test/upload/", "test/removeFolder/", false);
          await listObjects("test/removeFolder/")
          await removeObject("test/removeFolder/", false);
          await listObjects("test/removeFolder/")

          //cleanup
          await removeObject("test/uploadFile/", false);
          await removeObject("test/uploadfolder/", false);
          await removeObject("test/movefolder/", false);



      } catch (err) {
        console.error("❌ Test failed:", err);
      }
  })();
}


/*
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  (async () => {
    try {
      const testFolder = "test/hello.txt";
      const testFile = "test-local/hello.txt";
      const remoteFolder = "test-remote/";
      const movedPath = "test-remote-moved/hello.txt";

      // Prepare a test file
    //   await fs.mkdir(testFolder, { recursive: true });
    //   await fs.writeFile(testFile, "Hello, Spaces!");

      // Upload file
      await uploadFile(testFile, remoteFolder);

      // Upload folder
      await uploadFolder(testFolder, "test-folder-upload/");

      // List contents
      await listObjects("test-folder-upload/");

      // Move file
      await moveObject(remoteFolder + "hello.txt", movedPath);

      // Remove folder
      await removeObject("test-folder-upload/");

      // Clean up moved file
      await removeObject(movedPath);
      await removeObject(remoteFolder);
    } catch (err) {
      console.error("❌ Test failed:", err);
    }
  })();
}
*/