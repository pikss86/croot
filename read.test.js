const { vol } = require("memfs");
const read = require("./read");

jest.mock("fs/promises");

it("croot / - список файлов в корне", async () => {
    vol.reset();
    vol.fromJSON({
        "data.json": JSON.stringify({ a: "567" }),
        "file.txt": "тестирование"
    });

    const list = await read("/");
    const result = "data.json\nfile.txt";

    await expect(list).toBe(result);
});

it("croot index.html - содержимое файла", async () => {
    vol.reset();
    vol.fromJSON({
        "index.html": "тестирование"
    });

    await expect(read("index.html")).resolves.toBe("тестирование");
});

it("croot /subdir - список файлов в папке subdir", async () => {
    vol.reset();
    vol.fromJSON({
        "./subdir/data.json": JSON.stringify({ a: "567" }),
        "./subdir/file.txt": "тестирование"
    });

    const list = await read("/subdir");
    const result = "data.json\nfile.txt";

    await expect(list).toBe(result);
});

it("croot data.json - чтение json файла", async () => {
    vol.reset();
    vol.fromJSON({
        "data.json": JSON.stringify({ a: "567" })
    });

    const jsonObj = JSON.parse(await read("data.json"));

    await expect(jsonObj.a).toBe("567");
});

it("croot /subdir/2 - выведет содержимое файла", async () => {
    vol.reset();
    vol.fromJSON({
        "./subdir/2": "test"
    });

    const result = await read("/subdir/2");
    
    await expect(result).toBe("test");
});