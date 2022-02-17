const { mkdir, stat, readdir, readFile } = require("fs/promises");
const fs = require("fs");
const pathModule = require("path");

module.exports = async function(path, value) {
    if (path.indexOf(".json") > -1) {
        const i = path.indexOf(".json");
        const filePath = pathModule.join(".", path.substring(0, i+5));
        const innerPath = path.substring(i+5);
        if (innerPath == "") {
            if (!fs.existsSync(filePath)) {
                await mkdir(pathModule.dirname(filePath), { recursive: true });
                fs.writeFileSync(filePath, "");
            } else {
                let json = await readFile(filePath, { encoding: "utf8" });
                if (json == "") {
                    json = [null];
                }
                fs.writeFileSync(filePath, JSON.stringify(json));
            }
        } else {
            let json = await readFile(filePath, { encoding: "utf8" });
            json = JSON.parse(json);
            if (innerPath.startsWith("/")) {
                jsonPath = innerPath.substring(1);
            } else {
                jsonPath = innerPath;
            }
            const segs = jsonPath.split("/");
            let cursor = json;
            for (index = 0; index < segs.length; index++) {
                if (cursor[segs[index]] == null) {
                    if (index == segs.length-1) {
                        cursor[segs[index]] = [null];
                        break;
                    } else {
                        cursor[segs[index]] = {}
                        cursor[segs[index]][segs[segs.length-1]] = null;
                        break;
                    }
                }
                cursor = cursor[segs[index]]; 
            }
            fs.writeFileSync(filePath, JSON.stringify(json));
        }
    } else {
        path = pathModule.join(".", path);
        if (!fs.existsSync(path) && !value) {
            await mkdir(path, { recursive: true });
        } else
        if (fs.existsSync(path) && !value) {
            const st = await stat(path);
            if (st.isDirectory()) {
                const numbers = (await readdir(path)).filter(dir => /^\d+$/.test(dir)).map(num => parseInt(num));
                const maxNum = Math.max.apply(null, [-1, ...numbers]) + 1;
                await mkdir(pathModule.join(path, maxNum.toString()), { recursive: true });
            }
        } else
        if (value) {
            const st = await stat(path);
            if (st.isDirectory()) {
                const numbers = (await readdir(path)).filter(dir => /^\d+$/.test(dir)).map(num => parseInt(num));
                const maxNum = Math.max.apply(null, [-1, ...numbers]) + 1;
                await mkdir(pathModule.dirname(path), { recursive: true });
                fs.writeFileSync(pathModule.join(path, maxNum.toString()), value);
            }
        }
    }
}