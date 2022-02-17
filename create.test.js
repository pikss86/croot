const { vol } = require("memfs");
const create = require("./create");
const fs = require("fs");

jest.mock("fs/promises");
jest.mock("fs");

/*
так не работает
it("croot create /emptyfile - создаст пустой файл emptyfile если он не создан, если создан ничего не произойдет", 
async () => {
    vol.fromJSON({
        "./emptyfile2": ""
    });
    await expect(fs.existsSync("./emptyfile")).toBe(false);
    await create("/emptyfile")
    await expect(fs.existsSync("./emptyfile")).toBe(true);
});
*/

it("croot create /subdir/ - создаст пустую папку subdir", async () => {
    vol.reset();
    vol.fromJSON({
        "./emptyfile2": ""
    });
    await expect(fs.existsSync("./subdir")).toBe(false);
    await create("/subdir/");
    await expect(fs.statSync("./subdir").isDirectory()).toBe(true);
});


it("croot create /subdir - создаст пустую папку subdir", async () => {
    vol.reset();
    vol.fromJSON({
        "./emptyfile2": ""
    });
    await expect(fs.existsSync("./subdir")).toBe(false);
    await create("/subdir");
    await expect(fs.statSync("./subdir").isDirectory()).toBe(true);
});


it("croot create /subdir - если папка существует то внутри создастся папка 0", async () => {
    vol.reset();
    vol.fromJSON({
        "./emptyfile2": ""
    });
    fs.mkdirSync("./subdir");
    await create("/subdir");
    await expect(fs.statSync("./subdir/0").isDirectory()).toBe(true);
});

it("croot create /subdir - если папка существует и внутри существует папка 0 то внутри создастся папка 1", 
async () => {
    vol.reset();
    vol.fromJSON({
        "./emptyfile2": ""
    });
    fs.mkdirSync("./subdir/0", { recursive: true });
    await create("/subdir");
    await expect(fs.statSync("./subdir/0").isDirectory()).toBe(true);
});

it("croot create /subdir/1 \"Какая-то строка текста\" - в папке 1 создаст файл 0 и запишет туда строку", 
async () => {
    vol.reset();
    vol.fromJSON({
        "./emptyfile2": "",
        //"./subdir/1/0": "Какая-то строка текста"
    });
    fs.mkdirSync("./subdir/1", { recursive: true });
    await create("/subdir/1", "Какая-то строка текста");
    const result = fs.readFileSync("./subdir/1/0", { encoding: "utf8" });
    await expect(result).toBe("Какая-то строка текста");
});

it("croot create /subdir \"Какая-то строка текста\" в папке subdir создаст файл 2 и запишет туда содержимое строки", 
async () => {
    vol.reset();
    vol.fromJSON({
        "./emptyfile2": "",
        //"./subdir/2": "Какая-то строка текста"
    });
    fs.mkdirSync("./subdir/1", { recursive: true });
    await create("/subdir", "Какая-то строка текста");
    const result = fs.readFileSync("./subdir/2", { encoding: "utf8" });
    await expect(result).toBe("Какая-то строка текста");
});

it("croot create /subdir/3.json - создаст пустой файл", async () => {
    vol.reset();
    vol.fromJSON({
        "/subdir/32.json": ""
    });
    await create("/subdir/3.json");
    const result = fs.readFileSync("./subdir/3.json", { encoding: "utf8" });
    await expect(result).toBe("");
});

it("croot create /subdir/3.json - внутри файла 3.json создастся массив и в него заполнится элемент 0 значением null", 
async () => {
    vol.reset();
    vol.fromJSON({
        "./subdir/3.json": "",
        //"./subdir/3.json": "[null]"
    });
    await create("/subdir/3.json");
    const result = fs.readFileSync("./subdir/3.json", { encoding: "utf8" });
    await expect(JSON.parse(result)[0]).toBe(null);
});

it("croot create /subdir/3.json/0 - в элемент 0 присвоится массив и он заполнится элементом 0 со значением null", 
async () => {
    vol.reset();
    vol.fromJSON({
        "./subdir/3.json": "[null]",
        //"./subdir/3.json": "[[null]]"
    });
    await create("/subdir/3.json/0");
    const result = fs.readFileSync("./subdir/3.json", { encoding: "utf8" });
    await expect(JSON.parse(result)[0][0]).toBe(null);
});

it("croot create /subdir/3.json/0/0/mykey - создастся объект и в нем поле mykey со значением null", 
async () => {
    vol.reset();
    vol.fromJSON({
        "./subdir/3.json": "[[null]]",
        //"./subdir/3.json": "[[{ \"mykey\": null }]]"
    });
    await create("/subdir/3.json/0/0/mykey");
    const result = fs.readFileSync("./subdir/3.json", { encoding: "utf8" });
    console.log(result);
    await expect(JSON.parse(result)[0][0].mykey).toBe(null);
});
