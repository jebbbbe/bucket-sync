import {
    uploadFile,
    uploadFolder,
    moveObject,
    removeObject,
    listObjects,
} from "../src/main.js"
import { fileURLToPath } from "url"

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    ;(async () => {
        try {
            // upload file
            console.log("")
            console.log("upload file")
            await uploadFile({
                localPath: "test/upload/hello.txt",
                remotePath: "test/uploadFile/",
                isPublic: false,
                verbose: true,
            })
            await listObjects({ prefix: "test/uploadFile/" })

            // upload folder
            console.log("")
            console.log("upload folder")
            await uploadFolder({
                localPath: "test/upload/",
                remotePath: "test/uploadfolder/",
                isPublic: false,
                verbose: true,
            })
            await listObjects({ prefix: "test/uploadfolder/" })

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
                remotePath: "test/removeFile/",
                isPublic: false,
                verbose: true,
            })
            await listObjects({ prefix: "test/removeFile/" })
            await removeObject({ pathKey: "test/removeFile/", verbose: true })
            await listObjects({ prefix: "test/removeFile/" })

            // delete folder
            console.log("")
            console.log("delete folder")
            await uploadFolder({
                localPath: "test/upload/",
                remotePath: "test/removeFolder/",
                isPublic: false,
                verbose: false,
            })
            await listObjects({ prefix: "test/removeFolder/" })

            await removeObject({
                pathKey: "test/removeFolder/",
                verbose: false,
            })
            await listObjects({ prefix: "test/removeFolder/" })

            // override Folder
            console.log("")
            console.log("override Folder")
            await uploadFolder({
                localPath: "test/upload/",
                remotePath: "test/overrideFolder/",
                isPublic: false,
                verbose: false,
                override: true,
            })
            //override, false
            await uploadFolder({
                localPath: "test/upload/",
                remotePath: "test/overrideFolder/",
                isPublic: false,
                verbose: true,
                override: false,
            })

            //cleanup
            console.log("")
            console.log("cleanup")
            await removeObject({ pathKey: "test/", verbose: true })
        } catch (err) {
            console.error("❌ Test failed:", err)
        }
    })()
}
