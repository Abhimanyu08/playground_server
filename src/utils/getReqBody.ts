import { allowedLanguages } from "src/intefaces/allowedLanguages";
import { langToImage } from "./constants";

export function getCreateContainerReqBody(language: allowedLanguages): Record<string, string | boolean | string[]> {
    switch (language) {

        case "python":
            return {
                "Image": langToImage[language],
                "Tty": true,
                "WorkingDir": "/app",
            }
        case "node":
            return {
                "Image": langToImage[language],
                "Tty": true,
                "WorkingDir": "/app",
            }
        case "rust":
            return {
                "Image": langToImage[language],
                "Tty": true,
                "WorkingDir": "/app",
            }
    }
}