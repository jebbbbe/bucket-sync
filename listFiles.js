// listFiles.js
import { S3Client, ListObjectsV2Command, GetObjectCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";
import { Readable } from "stream";

dotenv.config();

// Setup the S3 client for DigitalOcean Spaces
const s3 = new S3Client({
    endpoint: `https://${process.env.DO_SPACE_ENDPOINT}`,
    region: "us-east-1", // Required but ignored by Spaces
    credentials: {
        accessKeyId: process.env.DO_SPACE_KEY,
        secretAccessKey: process.env.DO_SPACE_SECRET,
    },
});

/**
 * Helper function to convert a stream into a string
 */
const streamToString = async (stream) => {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf-8");
};

async function listAndReadFiles(prefix = "data/") {
    try {
        const listCommand = new ListObjectsV2Command({
            Bucket: process.env.DO_SPACE_BUCKET,
            Prefix: prefix,
        });

        const listResponse = await s3.send(listCommand);

        if (!listResponse.Contents || listResponse.Contents.length === 0) {
            console.log("No files found.");
            return;
        }

        for (const item of listResponse.Contents) {
            console.log(`\n📄 Found file: ${item.Key}`);

            /*
            const getCommand = new GetObjectCommand({
                Bucket: process.env.DO_SPACE_BUCKET,
                Key: item.Key,
            });

            const fileResponse = await s3.send(getCommand);
            const bodyString = await streamToString(fileResponse.Body);
            console.log("🔍 Content:", bodyString.slice(0, 200)); // preview first 200 chars
            */
        }
    } catch (err) {
        console.error("❌ Error:", err);
    }
}

listAndReadFiles(""); // optionally pass another prefix
