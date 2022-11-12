import { createServer, IncomingMessage, RequestListener, ServerResponse } from "http";
import * as dockerFunctions from "./docker";
import { allowedLanguages } from "./intefaces/allowedLanguages";
import { langToExtension } from "./utils/constants";
import { getIntialCommand, getRunCodeFileCommand } from "./utils/langToCommands";

interface createContainerReq {
    language: allowedLanguages
}
interface createExecReq {
    language: allowedLanguages | "shell"
    containerId: string,
    code: string,
    fileName: string
}

interface attachContainerReq {
    containerId: string,
}

interface killContainerReq {
    containerId: string
}



const readReq = (req: IncomingMessage): Promise<string> => {
    return new Promise((resolve, reject) => {
        let data = "";
        req.on("data", (chunk) => data += chunk.toString());
        req.on("error", (err) => reject(err.message));
        req.on("end", () => resolve(data));
    });
}



async function setUpContainer(language: allowedLanguages, containerId: string): Promise<{ output: string }> {

    const { error } = await dockerFunctions.startContainer({ containerId });
    if (error) {
        console.log(error)
        return { output: "error" }
    }
    const INITIAL_COMMAND = getIntialCommand(language);

    const { data, error: execError } = await dockerFunctions.createAndStartExec({ containerId, command: INITIAL_COMMAND })
    if (execError || !data) {
        console.log(execError);
        return { output: "error" }
    }
    return data
}


const checkLanguageIsAllowed = (language: string): language is allowedLanguages => {
    return language === "python" || language === "node" || language === "rust" || language === "shell"
}
const checkReqIsCreateContainerReq = (reqData: any): reqData is createContainerReq => {
    return Object.keys(reqData).length === 1 && Object.hasOwn(reqData, "language") && checkLanguageIsAllowed(reqData["language"])
}
const checkReqIsKillContainerReq = (req: IncomingMessage, reqData: any): reqData is killContainerReq => {
    return req.method === "DELETE" && Object.keys(reqData).length === 1 && Object.hasOwn(reqData, "containerId")
}
const checkReqIsAttachContainerReq = (reqData: any): reqData is attachContainerReq => {
    return Object.keys(reqData).length === 1 && Object.hasOwn(reqData, "containerId")
}
const checkReqIsCreateExecReq = (reqData: any): reqData is createExecReq => {
    return Object.hasOwn(reqData, "containerId") && Object.hasOwn(reqData, "language") && Object.hasOwn(reqData, "code") &&
        checkLanguageIsAllowed(reqData["language"])
}

const prepareRes = (req: IncomingMessage, res: ServerResponse): ServerResponse => {
    if (req.headers.origin === "http://localhost:3000") return res.setHeader("Access-Control-Allow-Origin", req.headers.origin)
    return res
}
const listener: RequestListener = async (req, res) => {
    if (req.method === "OPTIONS") {
        res.writeHead(204, "", {
            "Access-Control-Allow-Origin": req.headers.origin,
            "Vary": "Origin",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Allow-Methods": ["POST", "DELETE"]
        })
        res.end()
        return;
    }

    if (req.headers.origin !== "http://localhost:3000") {
        res.writeHead(401, "Bad request").end()
        return
    }

    const reqData = JSON.parse(await readReq(req));

    if (!checkReqIsCreateContainerReq(reqData) && !checkReqIsCreateExecReq(reqData) && !checkReqIsKillContainerReq(req, reqData)
        && !checkReqIsAttachContainerReq(reqData)
    ) {
        console.log("here")
        prepareRes(req, res).writeHead(400, "Bad request").end()
        return
    }

    if (checkReqIsKillContainerReq(req, reqData)) {
        dockerFunctions.killContainer({ containerId: reqData.containerId });
        prepareRes(req, res).writeHead(200).end()
        return
    }

    if (checkReqIsAttachContainerReq(reqData)) {
        dockerFunctions.attachToContainer({ containerId: reqData.containerId })
        prepareRes(req, res).writeHead(200).end()
        return
    }

    if (checkReqIsCreateContainerReq(reqData)) {
        //the request is to create and set up the container
        const { language } = reqData


        const createContainerResp = await dockerFunctions.createContainer({ language });

        if (createContainerResp.error) {

            prepareRes(req, res).writeHead(500, createContainerResp.error).end()
            return
        }
        if (!createContainerResp.data) {
            prepareRes(req, res).writeHead(500, "Couldn't create container").end()
            return
        }

        const { containerId } = createContainerResp.data
        const containerSetupSuccess = await setUpContainer(language, containerId);
        if (containerSetupSuccess.output === "error") {
            prepareRes(req, res).writeHead(500, "Couldn't setup container").end()
            return
        }

        const { data: fileSystemData } = await dockerFunctions.createAndStartExec({ containerId, command: "ls -R;" })

        prepareRes(req, res).writeHead(201, "", { "Content-Type": "application/json" }).end(JSON.stringify({
            containerId,
            files: fileSystemData?.output
        }))
        return
    }

    let { containerId, code, language, fileName } = reqData as createExecReq
    let command = code;
    if (language !== "shell") command = prepareCommand(code, language, fileName);


    const output = await dockerFunctions.createAndStartExec({ containerId, command });
    if (output.error) {
        prepareRes(req, res).writeHead(500, output.error).end()
        return
    }
    if (!output.data) {
        prepareRes(req, res).writeHead(500, "no data").end()
        return
    }
    prepareRes(req, res).writeHead(201, "", { "Content-Type": "application/json" }).end(JSON.stringify(output.data))
}

function prepareCommand(code: string, language: allowedLanguages, fileName: string): string {
    code = code.trim();
    code = code.replaceAll(/'(.*?)'/g, "\"$1\"")

    const fullFileName = `${fileName}.${langToExtension[language]}`

    let startCommand = `touch ${fullFileName};`

    const writeCodeToFileCommand = `echo '${code}' > ${fullFileName};`
    const runCodeFileCommand = getRunCodeFileCommand(language, fullFileName)

    let command = startCommand + writeCodeToFileCommand + runCodeFileCommand;
    return command
}

const server = createServer(listener)
server.listen(process.env.PORT, () => { console.log(`server listening on ${process.env.PORT}`) });

// if (previousCode) {
    //     previousCode = previousCode.trim();
    //     previousCode = previousCode.replace(/\n/, "\\n");
    //     code = code.replace(/\n/, "\\n");
    //     command = `sed -i 's/^${previousCode}(.|\\n|\\r)*/${code}/' ${FILENAME}.${langToExtension[language]}; ${langToExecute[language]} ${FILENAME}.${langToExtension[language]}`;
    //     console.log(command);
    // }
    // const execDetails = await dockerClient.CREATE_EXEC(containerId, command)
    // if ("message" in execDetails) {
    //     res.writeHead(500, execDetails.message);
    //     res.end();
    //     return
    // }
    // const execId = execDetails.Id;
    // const output = await dockerClient.START_EXEC(execId)

