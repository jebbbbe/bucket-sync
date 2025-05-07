// test/main.test.js
import fs from "fs/promises"
import path from "path"
import dotenv from "dotenv"
import {
    uploadFile,
    uploadFolder,
    listObject,
    removeObject,
    copyObject,
    moveObject,
    downloadObject,
} from "../src/main.js"
import { Console } from "console"

dotenv.config()

const testPrefix = process.env.remoteTestPath
if (!testPrefix) {
    throw new Error("Missing remoteTestPath in environment variables")
}

const globalVerbose = false
const globalTimeOut = 10 * 1000

async function clearFolder(dirPath) {
    try {
        const entries = await fs.readdir(dirPath, { withFileTypes: true })
        await Promise.all(
            entries.map(async (entry) => {
                const fullPath = path.join(dirPath, entry.name)
                if (entry.isDirectory()) {
                    // recurse into subfolder, then remove it
                    await clearFolder(fullPath)
                    await fs.rmdir(fullPath)
                } else {
                    // delete file
                    await fs.unlink(fullPath)
                }
            })
        )
    } catch (e) {}
}

export async function listFiles(dirPath) {
    let files = []
    const entries = await fs.readdir(dirPath, { withFileTypes: true })

    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name)
        if (entry.isDirectory()) {
            files = files.concat(await listFiles(fullPath))
        } else {
            files.push(fullPath)
        }
    }

    return files
}

describe("DigitalOcean Spaces manager (integration)", () => {
    const localFile = "test/upload/hello.txt"
    const localFolder = "test/upload/"
    const localDownloadFolder = "test/download/"

    const originalConsole = global.console

    beforeEach(() => {
        // swap in Node’s “raw” console
        global.console = new Console(process.stdout, process.stderr)
    })

    afterEach(() => {
        // restore Jest’s console spy
        global.console = originalConsole
    })

    beforeAll(async () => {
        // empty out remote test
        await clearFolder(localDownloadFolder)
        await removeObject({ remotePath: testPrefix, verbose: false })
    })

    afterAll(async () => {
        // empty out remote test
        await clearFolder(localDownloadFolder)
        await removeObject({ remotePath: testPrefix, verbose: false })
    })

    test(
        "uploadFile",
        async () => {
            const remotePath = `${testPrefix}uploadFile/`
            await uploadFile({
                localPath: localFile,
                remotePath: remotePath,
                isPublic: false,
                verbose: globalVerbose,
                override: true,
            })

            const files = await listObject({
                remotePath: remotePath,
                verbose: globalVerbose,
            })

            expect(files).toEqual([`${remotePath}hello.txt`])
        },
        globalTimeOut
    )

    test(
        "uploadFolder",
        async () => {
            const remotePath = `${testPrefix}uploadFolder/`
            await uploadFolder({
                localPath: localFolder,
                remotePath: remotePath,
                isPublic: false,
                verbose: globalVerbose,
                override: true,
            })

            const files = await listObject({
                remotePath,
                verbose: globalVerbose,
                recursive: true,
            })

            expect(files).toEqual([
                `${remotePath}hello.txt`,
                `${remotePath}hotdog.png`,
                `${remotePath}subfolder/goodbye.txt`,
            ])
        },
        globalTimeOut
    )

    test(
        "listItem",
        async () => {
            const remotePath = `${testPrefix}uploadFile/`

            const files = await listObject({
                remotePath,
                verbose: globalVerbose,
                recursive: false,
            })

            expect(files).toEqual([`${remotePath}hello.txt`])
        },
        globalTimeOut
    )

    test(
        "listItems",
        async () => {
            const remotePath = `${testPrefix}uploadFolder/`

            const files = await listObject({
                remotePath,
                verbose: globalVerbose,
                recursive: false,
            })

            expect(files).toEqual([
                `${remotePath}hello.txt`,
                `${remotePath}hotdog.png`,
            ])
        },
        globalTimeOut
    )

    test(
        "listItemsRecursive",
        async () => {
            const remotePath = `${testPrefix}uploadFolder/`

            const files = await listObject({
                remotePath,
                verbose: globalVerbose,
                recursive: true,
            })

            expect(files).toEqual([
                `${remotePath}hello.txt`,
                `${remotePath}hotdog.png`,
                `${remotePath}subfolder/goodbye.txt`,
            ])
        },
        globalTimeOut
    )

    test(
        "removeObject",
        async () => {
            // test single file removal
            const remotePath = `${testPrefix}removeFile/`
            await uploadFile({
                localPath: localFile,
                remotePath: remotePath,
                isPublic: false,
                verbose: globalVerbose,
                override: true,
            })

            await removeObject({
                remotePath: remotePath,
                verbose: globalVerbose,
            })

            const files = await listObject({
                remotePath: remotePath,
                verbose: globalVerbose,
                recursive: true,
            })

            expect(files).toEqual([])
        },
        globalTimeOut
    )

    test(
        "removeObjectRecursive",
        async () => {
            // test single file removal
            const remotePath = `${testPrefix}removeFolder/`
            await uploadFolder({
                localPath: localFolder,
                remotePath: remotePath,
                isPublic: false,
                verbose: globalVerbose,
                override: true,
            })

            await removeObject({
                remotePath: remotePath,
                verbose: globalVerbose,
                recursive: true,
            })

            const files = await listObject({
                remotePath: remotePath,
                verbose: globalVerbose,
            })

            expect(files).toEqual([])
        },
        globalTimeOut
    )

    test(
        "copyFolder",
        async () => {
            // test single file removal
            const remoteSource = `${testPrefix}copySourceFolder/`
            const remoteTarget = `${testPrefix}copyTargetFolder/`

            await uploadFolder({
                localPath: localFolder,
                remotePath: remoteSource,
                isPublic: false,
                verbose: globalVerbose,
                override: true,
            })

            await copyObject({
                remotePath: remoteSource,
                targetPath: remoteTarget,
                recursive: true,
            })

            const sourceFiles = await listObject({
                remotePath: remoteSource,
                verbose: globalVerbose,
                recursive: true,
            })

            const targetFiles = await listObject({
                remotePath: remoteTarget,
                verbose: globalVerbose,
                recursive: true,
            })

            expect(sourceFiles).toEqual([
                `${remoteSource}hello.txt`,
                `${remoteSource}hotdog.png`,
                `${remoteSource}subfolder/goodbye.txt`,
            ])
            expect(targetFiles).toEqual([
                `${remoteTarget}hello.txt`,
                `${remoteTarget}hotdog.png`,
                `${remoteTarget}subfolder/goodbye.txt`,
            ])
        },
        globalTimeOut
    )

    test(
        "moveFolder",
        async () => {
            // test single file removal
            const remoteSource = `${testPrefix}moveSourceFolder/`
            const remoteTarget = `${testPrefix}moveTargetFolder/`

            await uploadFolder({
                localPath: localFolder,
                remotePath: remoteSource,
                isPublic: false,
                verbose: globalVerbose,
                override: true,
            })

            await moveObject({
                remotePath: remoteSource,
                targetPath: remoteTarget,
                recursive: true,
            })

            const sourceFiles = await listObject({
                remotePath: remoteSource,
                verbose: globalVerbose,
                recursive: true,
            })

            const targetFiles = await listObject({
                remotePath: remoteTarget,
                verbose: globalVerbose,
                recursive: true,
            })

            expect(sourceFiles).toEqual([])
            expect(targetFiles).toEqual([
                `${remoteTarget}hello.txt`,
                `${remoteTarget}hotdog.png`,
                `${remoteTarget}subfolder/goodbye.txt`,
            ])
        },
        globalTimeOut
    )

    test(
        "downloadFile",
        async () => {
            const remotePath = `${testPrefix}downloadFile/`
            await uploadFile({
                localPath: localFile,
                remotePath: remotePath,
                isPublic: false,
                verbose: globalVerbose,
                override: true,
            })

            await downloadObject({
                remotePath: remotePath,
                localPath: localDownloadFolder,
                overwrite: true,
                verbose: globalVerbose,
                recursive: false,
            })

            let remotefiles = await listObject({
                remotePath: remotePath,
                verbose: globalVerbose,
            })
            remotefiles = remotefiles.map((p) => p.split(/[\\/]/).pop())

            let localFiles = await listFiles(localDownloadFolder)
            localFiles = localFiles.map((p) => p.split(/[\\/]/).pop())

            expect(remotefiles).toEqual(localFiles)
        },
        globalTimeOut
    )

    test(
        "downloadFolder",
        async () => {
            const remotePath = `${testPrefix}downloadFolder/`
            await uploadFolder({
                localPath: localFolder,
                remotePath: remotePath,
                isPublic: false,
                verbose: globalVerbose,
                override: true,
            })

            await downloadObject({
                remotePath: remotePath,
                localPath: localDownloadFolder,
                overwrite: true,
                verbose: globalVerbose,
                recursive: true,
            })

            let remotefiles = await listObject({
                remotePath: remotePath,
                verbose: globalVerbose,
                recursive: true,
            })
            remotefiles = remotefiles.map((p) => p.split(/[\\/]/).pop())

            let localFiles = await listFiles(localDownloadFolder)
            localFiles = localFiles.map((p) => p.split(/[\\/]/).pop())

            expect(remotefiles).toEqual(localFiles)
        },
        globalTimeOut
    )
})
