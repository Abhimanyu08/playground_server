export const langToImage = {
    python: "python:latest",
    node: "node:latest",
    rust: "rust:latest"
} as const

export const langToExtension = {
    python: "py",
    node: "js",
    rust: "rs"
} as const

export const langToExecute = {
    python: "python",
    node: "node",
    rust: "cargo"
} as const

export const FILENAME = "file";