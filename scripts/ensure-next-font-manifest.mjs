import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const manifest = {
  pages: {},
  app: {},
  appUsingSizeAdjust: false,
  pagesUsingSizeAdjust: false
};

const serverDir = path.join(process.cwd(), ".next", "server");
const jsonPath = path.join(serverDir, "next-font-manifest.json");
const jsPath = path.join(serverDir, "next-font-manifest.js");
const json = JSON.stringify(manifest);

async function fileHasUsableJson(filePath) {
  try {
    JSON.parse(await readFile(filePath, "utf8"));
    return true;
  } catch {
    return false;
  }
}

async function fileExists(filePath) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

await mkdir(serverDir, { recursive: true });

if (!(await fileHasUsableJson(jsonPath))) {
  await writeFile(jsonPath, json, "utf8");
}

if (!(await fileExists(jsPath))) {
  await writeFile(jsPath, `self.__NEXT_FONT_MANIFEST=${JSON.stringify(json)}`, "utf8");
}
