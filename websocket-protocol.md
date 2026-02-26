# CROOT WebSocket Protocol

Этот документ описывает JSON‑протокол WebSocket, который доступен на `ws://HOST:PORT/ws` (по умолчанию).

## Сообщения от клиента

Формат:
```json
{
  "id": "string | number | null",
  "cmd": "string",
  "params": { }
}
```

- `id` — любой идентификатор запроса. В ответе будет возвращён тем же значением.
- `cmd` — команда.
- `params` — параметры команды.

## Ответы сервера

Формат:
```json
{
  "id": "string | number | null",
  "ok": true,
  "result": { },
  "error": "string | null"
}
```

- `id` — совпадает с `id` запроса.
- `ok` — успех/ошибка.
- `result` — данные результата.
- `error` — текст ошибки (если `ok=false`).

## Серверные события

Формат:
```json
{
  "event": "string",
  "data": { }
}
```

События приходят после подписки (см. `subscribe`).

## Команды

### mem.get
Получить значение из памяти по JSON Pointer.
```json
{ "id": 1, "cmd": "mem.get", "params": { "ptr": "/a/b" } }
```

Ответ:
```json
{ "id": 1, "ok": true, "result": { "value": 123 } }
```

### mem.set
Записать значение в память по JSON Pointer.
```json
{ "id": 2, "cmd": "mem.set", "params": { "ptr": "/a/b", "value": 123 } }
```

Ответ:
```json
{ "id": 2, "ok": true, "result": true }
```

### mem.del
Удалить значение из памяти по JSON Pointer.
```json
{ "id": 3, "cmd": "mem.del", "params": { "ptr": "/a/b" } }
```

Ответ:
```json
{ "id": 3, "ok": true, "result": true }
```

### fs.list (Node only)
Список файлов/директорий.
```json
{ "id": 4, "cmd": "fs.list", "params": { "path": "." } }
```

Ответ:
```json
{
  "id": 4,
  "ok": true,
  "result": [
    { "name": "file.txt", "type": "file", "size": 10, "mtime": 1700000000000 },
    { "name": "dir", "type": "dir", "size": 0, "mtime": 1700000000000 }
  ]
}
```

### fs.tree (Node only)
Полное дерево подпутей.
```json
{ "id": 5, "cmd": "fs.tree", "params": { "path": "." } }
```

Ответ:
```json
{
  "id": 5,
  "ok": true,
  "result": [
    { "path": "/", "type": "dir" },
    { "path": "/file.txt", "type": "file", "size": 10, "mtime": 1700000000000 }
  ]
}
```

### subscribe
Подписка на серверные события.
```json
{ "id": 6, "cmd": "subscribe", "params": { "event": "fs" } }
```

Ответ:
```json
{ "id": 6, "ok": true, "result": true }
```

## События

### fs
События изменения файловой системы (Node only).
Пример:
```json
{ "event": "fs", "data": { "event": "write", "path": "foo.txt" } }
```

### mem
События изменения памяти.
Пример:
```json
{ "event": "mem", "data": { "action": "set", "ptr": "/a/b", "value": 123 } }
```

## Примечания

- Сервер поддерживает только текстовые WebSocket‑кадры.
- Подписка выполняется по событию `fs` или `mem`.
- Ошибки команд возвращаются в поле `error` при `ok=false`.
