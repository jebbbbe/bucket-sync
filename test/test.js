import {
    uploadFile,
    uploadFolder,
    moveObject,
    removeObject,
    listObject,
    downloadObjects,
} from "../src/main.js"
import { fileURLToPath } from "url"
import dotenv from "dotenv"

dotenv.config()
if (!process.env.remoteTestPath) {
    throw new Error("Missing remoteTestPath in environment variables.");
}

const remoteTestPath = process.env.remoteTestPath
console.log(remoteTestPath)

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    (async () => {
        try {
            // upload file
            console.log("")
            console.log("upload file")
            await uploadFile({
                localPath: "test/upload/hello.txt",
                remotePath: remoteTestPath + "uploadFile/",
                isPublic: false,
                verbose: true,
            })
            await listObject({ remotePath: remoteTestPath + "uploadFile/", verbose: true, })


            // upload folder
            console.log("")
            console.log("upload folder")
            await uploadFolder({
                localPath: "test/upload/",
                remotePath: remoteTestPath + "uploadfolder/",
                isPublic: false,
                verbose: true,
            })
            await listObject({ remotePath: remoteTestPath + "uploadfolder/", verbose: true, })


            // move folder
            // console.log("")
            // console.log("move folder")
            // await uploadFolder("test/upload/", "test/movefolder/", true);
            // await moveObject("test/movefolder/", "test/movefolder/move", true)

            // delete file
            console.log("")
            console.log("delete file")
            await uploadFile({
                localPath: "test/upload/hello.txt",
                remotePath: remoteTestPath + "removeFile/",
                isPublic: false,
                verbose: true,
            })
            await listObject({ remotePath: remoteTestPath + "removeFile/", verbose: true, })
            await removeObject({ remotePath: remoteTestPath + "removeFile/", verbose: true })
            await listObject({ remotePath: remoteTestPath + "removeFile/", verbose: true, })

            // delete folder
            console.log("")
            console.log("delete folder")
            await uploadFolder({
                localPath: "test/upload/",
                remotePath: remoteTestPath + "removeFolder/",
                isPublic: false,
                verbose: false,
            })
            await listObject({ remotePath: remoteTestPath + "removeFolder/", verbose: true, })


            await removeObject({
                remotePath: remoteTestPath + "removeFolder/",
                verbose: false,
            })
            await listObject({ remotePath: remoteTestPath + "removeFolder/", verbose: true, })


            // override Folder
            console.log("")
            console.log("override Folder")
            await uploadFolder({
                localPath: "test/upload/",
                remotePath: remoteTestPath + "overrideFolder/",
                isPublic: false,
                verbose: false,
                override: true,
            })
            //override, false
            await uploadFolder({
                localPath: "test/upload/",
                remotePath: remoteTestPath + "overrideFolder/",
                isPublic: false,
                verbose: true,
                override: false,
            })

            await listObject({ remotePath: remoteTestPath + "uploadfolder/", verbose: true, })
            await downloadObjects({
                localPath: "test/download/",
                remotePath: remoteTestPath + "uploadfolder/",
                verbose: true,
            })

            //cleanup
            console.log("")
            console.log("cleanup")
            await removeObject({ remotePath: remoteTestPath, verbose: true })
        } catch (err) {
            console.error("❌ Test failed:", err)
        }
    })()
}
