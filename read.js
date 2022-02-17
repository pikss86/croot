const { open, stat, readdir } = require("fs/promises")
const pathModule = require("path");

module.exports = async function(path) {
    path = pathModule.join(".", path)
    const st = await stat(path);
    if (st.isDirectory()) {
        const files = await readdir(path);
        return files.sort().join("\n");
    } else {
        const fd = await open(path, "r");
        const buf = await fd.readFile();
        await fd.close();
        return buf.toString("utf8");
    }
}
