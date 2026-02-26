/*
CROOT - single-file node+browser toolkit
No external deps.
*/
(function (global) {
  'use strict';

  var isNode = typeof process !== 'undefined' && process.versions && process.versions.node;
  var isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

  function now() { return Date.now(); }

  function toUint8Array(buf) {
    if (buf == null) return new Uint8Array(0);
    if (buf instanceof Uint8Array) return buf;
    if (isNode && Buffer.isBuffer(buf)) return new Uint8Array(buf);
    return new Uint8Array(buf);
  }

  function textEncoder() {
    if (typeof TextEncoder !== 'undefined') return new TextEncoder();
    return null;
  }

  function textDecoder() {
    if (typeof TextDecoder !== 'undefined') return new TextDecoder();
    return null;
  }

  function utf8Encode(str) {
    var enc = textEncoder();
    if (enc) return enc.encode(str);
    if (isNode) return Buffer.from(str, 'utf8');
    // fallback
    var out = [];
    for (var i = 0; i < str.length; i++) out.push(str.charCodeAt(i) & 0xff);
    return new Uint8Array(out);
  }

  function utf8Decode(buf) {
    var dec = textDecoder();
    if (dec) return dec.decode(buf);
    if (isNode) return Buffer.from(buf).toString('utf8');
    var s = '';
    for (var i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
    return s;
  }

  function safeJSONParse(s, fallback) {
    try { return JSON.parse(s); } catch (e) { return fallback; }
  }

  function cloneJSON(v) {
    return safeJSONParse(JSON.stringify(v), null);
  }

  function parseJSONPointer(ptr) {
    if (!ptr || ptr === '/') return [];
    if (ptr[0] !== '/') return null;
    var parts = ptr.split('/').slice(1).map(function (p) {
      return p.replace(/~1/g, '/').replace(/~0/g, '~');
    });
    return parts;
  }

  function getByPointer(obj, ptr) {
    var parts = parseJSONPointer(ptr);
    if (parts == null) return { ok: false, error: 'Invalid JSON pointer' };
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return { ok: false, error: 'Not found' };
      cur = cur[parts[i]];
    }
    return { ok: true, value: cur };
  }

  function setByPointer(obj, ptr, value) {
    var parts = parseJSONPointer(ptr);
    if (parts == null) return { ok: false, error: 'Invalid JSON pointer' };
    if (parts.length === 0) return { ok: true, root: value, replacedRoot: true };
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var key = parts[i];
      if (cur[key] == null || typeof cur[key] !== 'object') cur[key] = {};
      cur = cur[key];
    }
    cur[parts[parts.length - 1]] = value;
    return { ok: true, root: obj, replacedRoot: false };
  }

  function delByPointer(obj, ptr) {
    var parts = parseJSONPointer(ptr);
    if (parts == null) return { ok: false, error: 'Invalid JSON pointer' };
    if (parts.length === 0) return { ok: true, root: null, replacedRoot: true };
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var key = parts[i];
      if (cur == null || typeof cur !== 'object') return { ok: false, error: 'Not found' };
      cur = cur[key];
    }
    if (cur && Object.prototype.hasOwnProperty.call(cur, parts[parts.length - 1])) {
      delete cur[parts[parts.length - 1]];
      return { ok: true, root: obj, replacedRoot: false };
    }
    return { ok: false, error: 'Not found' };
  }

  function createEmitter() {
    var listeners = {};
    return {
      on: function (evt, fn) {
        listeners[evt] = listeners[evt] || [];
        listeners[evt].push(fn);
        return function () { listeners[evt] = (listeners[evt] || []).filter(function (f) { return f !== fn; }); };
      },
      emit: function (evt, data) {
        var arr = listeners[evt] || [];
        for (var i = 0; i < arr.length; i++) {
          try { arr[i](data); } catch (e) {}
        }
      }
    };
  }

  function createCroot(options) {
    options = options || {};
    var emitter = createEmitter();
    var memStore = { root: {} };
    var confirmMap = {}; // token -> {path, type, exp}

    var cfg = {
      rootDir: options.rootDir || (isNode ? process.cwd() : '/'),
      port: options.port || 8080,
      wsPath: options.wsPath || '/ws',
      httpHost: options.host || '0.0.0.0',
      discoveryPort: options.discoveryPort || 48888,
      discoveryIntervalMs: options.discoveryIntervalMs || 2000,
      nodeName: options.nodeName || (isNode ? require('os').hostname() : 'browser-node')
    };

    function emitEvent(name, data) {
      emitter.emit(name, data);
    }

    function memGet(ptr) {
      return getByPointer(memStore.root, ptr);
    }

    function memSet(ptr, value) {
      var res = setByPointer(memStore.root, ptr, value);
      if (res.ok) {
        if (res.replacedRoot) memStore.root = res.root;
        emitEvent('mem', { action: 'set', ptr: ptr, value: cloneJSON(value) });
      }
      return res;
    }

    function memDel(ptr) {
      var res = delByPointer(memStore.root, ptr);
      if (res.ok) {
        if (res.replacedRoot) memStore.root = res.root;
        emitEvent('mem', { action: 'del', ptr: ptr });
      }
      return res;
    }

    function makeToken() {
      var t = (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2));
      return t;
    }

    function isTokenValid(token, pathKey, type) {
      var rec = confirmMap[token];
      if (!rec) return false;
      if (rec.path !== pathKey || rec.type !== type) return false;
      if (rec.exp < now()) { delete confirmMap[token]; return false; }
      return true;
    }

    // Node-only features
    var node = null;
    var fs = null, path = null, http = null, url = null, crypto = null, os = null, dgram = null, net = null, https = null;
    if (isNode) {
      fs = require('fs');
      path = require('path');
      http = require('http');
      https = require('https');
      url = require('url');
      crypto = require('crypto');
      os = require('os');
      dgram = require('dgram');
      net = require('net');
      cfg.rootDir = path.resolve(cfg.rootDir || process.cwd());
    }

    function resolvePath(p) {
      if (!isNode) return p || '/';
      var root = cfg.rootDir;
      var resolved = path.resolve(root, p || '.');
      var rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
      if (!(resolved === root || resolved.indexOf(rootWithSep) === 0)) throw new Error('Path outside root');
      return resolved;
    }

    function statPath(p) {
      return new Promise(function (resolve, reject) {
        fs.stat(p, function (err, st) { if (err) reject(err); else resolve(st); });
      });
    }

    function listDir(p) {
      return new Promise(function (resolve, reject) {
        fs.readdir(p, function (err, items) {
          if (err) return reject(err);
          var out = [];
          var pending = items.length;
          if (!pending) return resolve(out);
          items.forEach(function (name) {
            var full = path.join(p, name);
            fs.stat(full, function (err2, st) {
              if (!err2) {
                out.push({
                  name: name,
                  type: st.isDirectory() ? 'dir' : 'file',
                  size: st.size,
                  mtime: st.mtimeMs
                });
              }
              pending--;
              if (!pending) resolve(out);
            });
          });
        });
      });
    }

    function listTree(p, base) {
      base = base || '';
      return new Promise(function (resolve, reject) {
        fs.stat(p, function (err, st) {
          if (err) return reject(err);
          if (st.isDirectory()) {
            fs.readdir(p, function (err2, items) {
              if (err2) return reject(err2);
              var all = [];
              var pending = items.length;
              if (!pending) return resolve([{ path: base || '/', type: 'dir' }]);
              var head = { path: base || '/', type: 'dir' };
              all.push(head);
              items.forEach(function (name) {
                var full = path.join(p, name);
                var nextBase = (base === '/' || base === '') ? '/' + name : base + '/' + name;
                listTree(full, nextBase).then(function (res) {
                  all = all.concat(res);
                  pending--;
                  if (!pending) resolve(all);
                }).catch(function () {
                  pending--;
                  if (!pending) resolve(all);
                });
              });
            });
          } else {
            resolve([{ path: base || '/', type: 'file', size: st.size, mtime: st.mtimeMs }]);
          }
        });
      });
    }

    function readFilePart(p, offset, length) {
      return new Promise(function (resolve, reject) {
        fs.open(p, 'r', function (err, fd) {
          if (err) return reject(err);
          var buf = Buffer.alloc(length);
          fs.read(fd, buf, 0, length, offset, function (err2, bytesRead) {
            fs.close(fd, function () {
              if (err2) return reject(err2);
              resolve(buf.slice(0, bytesRead));
            });
          });
        });
      });
    }

    function writeFilePart(p, offset, data) {
      return new Promise(function (resolve, reject) {
        fs.open(p, 'r+', function (err, fd) {
          if (err) {
            if (err.code === 'ENOENT') {
              fs.open(p, 'w+', function (err2, fd2) {
                if (err2) return reject(err2);
                fs.write(fd2, data, 0, data.length, offset, function (err3) {
                  fs.close(fd2, function () { if (err3) reject(err3); else resolve(); });
                });
              });
              return;
            }
            return reject(err);
          }
          fs.write(fd, data, 0, data.length, offset, function (err4) {
            fs.close(fd, function () { if (err4) reject(err4); else resolve(); });
          });
        });
      });
    }

    function readJSONFile(p) {
      return new Promise(function (resolve, reject) {
        fs.readFile(p, 'utf8', function (err, txt) {
          if (err) {
            if (err.code === 'ENOENT') return resolve({});
            return reject(err);
          }
          var obj = safeJSONParse(txt, null);
          if (obj == null) return reject(new Error('Invalid JSON'));
          resolve(obj);
        });
      });
    }

    function writeJSONFile(p, obj) {
      return new Promise(function (resolve, reject) {
        var txt = JSON.stringify(obj, null, 2);
        fs.writeFile(p, txt, 'utf8', function (err) { if (err) reject(err); else resolve(); });
      });
    }

    function startFsWatch(root) {
      if (!isNode) return function () {};
      try {
        var watcher = fs.watch(root, { recursive: true }, function (eventType, filename) {
          emitEvent('fs', { event: eventType, path: filename });
        });
        return function () { try { watcher.close(); } catch (e) {} };
      } catch (e) {
        // Fallback: non-recursive watch (platforms without recursive support)
        var watcher2 = fs.watch(root, function (eventType, filename) {
          emitEvent('fs', { event: eventType, path: filename });
        });
        return function () { try { watcher2.close(); } catch (e2) {} };
      }
    }

    // Minimal WebSocket server (text-only)
    function createWsServer(server, pathName) {
      var clients = [];

      function sendFrame(socket, data) {
        var payload = utf8Encode(JSON.stringify(data));
        var len = payload.length;
        var header = [];
        header.push(0x81);
        if (len < 126) {
          header.push(len);
        } else if (len < 65536) {
          header.push(126, (len >> 8) & 255, len & 255);
        } else {
          header.push(127, 0, 0, 0, 0, (len >> 24) & 255, (len >> 16) & 255, (len >> 8) & 255, len & 255);
        }
        var out = Buffer.concat([Buffer.from(header), Buffer.from(payload)]);
        socket.write(out);
      }

      function handleMessage(socket, msg) {
        var data = safeJSONParse(msg, null);
        if (!data) return;
        if (data.cmd) {
          handleCommand(data, function (resp) {
            sendFrame(socket, { id: data.id || null, ok: resp.ok, result: resp.result, error: resp.error });
          }, function (evtName, payload) {
            sendFrame(socket, { event: evtName, data: payload });
          });
        }
      }

      server.on('upgrade', function (req, socket) {
        if (req.url.indexOf(pathName) !== 0) return;
        var key = req.headers['sec-websocket-key'];
        var accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
        var headers = [
          'HTTP/1.1 101 Switching Protocols',
          'Upgrade: websocket',
          'Connection: Upgrade',
          'Sec-WebSocket-Accept: ' + accept,
          '\r\n'
        ];
        socket.write(headers.join('\r\n'));
        socket.on('data', function (buffer) {
          var bytes = new Uint8Array(buffer);
          if (bytes.length < 2) return;
          var fin = (bytes[0] & 0x80) !== 0;
          var opcode = bytes[0] & 0x0f;
          if (!fin || opcode !== 1) return; // only final text
          var masked = (bytes[1] & 0x80) !== 0;
          var len = bytes[1] & 0x7f;
          var offset = 2;
          if (len === 126) { len = (bytes[2] << 8) | bytes[3]; offset = 4; }
          else if (len === 127) { len = (bytes[6] << 24) | (bytes[7] << 16) | (bytes[8] << 8) | bytes[9]; offset = 10; }
          var mask = null;
          if (masked) {
            mask = bytes.slice(offset, offset + 4);
            offset += 4;
          }
          var payload = bytes.slice(offset, offset + len);
          if (masked) {
            for (var i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
          }
          var text = utf8Decode(payload);
          handleMessage(socket, text);
        });
        socket.on('close', function () {
          clients = clients.filter(function (c) { return c !== socket; });
        });
        clients.push(socket);
      });

      function broadcast(evtName, data) {
        clients.forEach(function (socket) {
          try { sendFrame(socket, { event: evtName, data: data }); } catch (e) {}
        });
      }

      return { broadcast: broadcast };
    }

    function handleCommand(data, respond, emit) {
      var cmd = data.cmd;
      var p = data.params || {};
      try {
        if (cmd === 'mem.get') {
          var r1 = memGet(p.ptr || '/');
          return respond(r1.ok ? { ok: true, result: r1.value } : { ok: false, error: r1.error });
        }
        if (cmd === 'mem.set') {
          var r2 = memSet(p.ptr || '/', p.value);
          return respond(r2.ok ? { ok: true, result: true } : { ok: false, error: r2.error });
        }
        if (cmd === 'mem.del') {
          var r3 = memDel(p.ptr || '/');
          return respond(r3.ok ? { ok: true, result: true } : { ok: false, error: r3.error });
        }
        if (cmd === 'subscribe') {
          var evt = p.event;
          if (!evt) return respond({ ok: false, error: 'event required' });
          var off = emitter.on(evt, function (payload) { emit(evt, payload); });
          return respond({ ok: true, result: true });
        }
        if (cmd === 'fs.list') {
          if (!isNode) return respond({ ok: false, error: 'fs not available in browser' });
          var rp = resolvePath(p.path || '.');
          return listDir(rp).then(function (items) { respond({ ok: true, result: items }); }).catch(function (e) { respond({ ok: false, error: e.message }); });
        }
        if (cmd === 'fs.tree') {
          if (!isNode) return respond({ ok: false, error: 'fs not available in browser' });
          var rp2 = resolvePath(p.path || '.');
          return listTree(rp2, '/').then(function (items) { respond({ ok: true, result: items }); }).catch(function (e) { respond({ ok: false, error: e.message }); });
        }
        return respond({ ok: false, error: 'Unknown cmd' });
      } catch (e) {
        return respond({ ok: false, error: e.message });
      }
    }

    function startHttpServer() {
      if (!isNode) return null;

      var wsServer = null;
      var server = http.createServer(function (req, res) {
        var parsed = url.parse(req.url, true);
        var pathname = parsed.pathname;

        function sendJSON(obj, code) {
          var body = JSON.stringify(obj);
          res.writeHead(code || 200, { 'Content-Type': 'application/json' });
          res.end(body);
        }

        function readBody(cb) {
          var chunks = [];
          req.on('data', function (c) { chunks.push(c); });
          req.on('end', function () { cb(Buffer.concat(chunks)); });
        }

        if (pathname === '/' || pathname === '/index.html') {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(renderExplorerHtml(cfg));
          return;
        }

        if (pathname === '/croot.js') {
          res.writeHead(200, { 'Content-Type': 'application/javascript' });
          fs.createReadStream(__filename).pipe(res);
          return;
        }

        // file streaming with Range
        if (pathname === '/api/fs/file' && req.method === 'GET') {
          var filePath = parsed.query.path || '';
          var abs = null;
          try { abs = resolvePath(filePath); } catch (e) { return sendJSON({ ok: false, error: e.message }, 400); }
          fs.stat(abs, function (err, st) {
            if (err) return sendJSON({ ok: false, error: err.message }, 404);
            var range = req.headers.range;
            var start = 0;
            var end = st.size - 1;
            if (range) {
              var m = /bytes=(\d+)-(\d+)?/.exec(range);
              if (m) {
                start = parseInt(m[1], 10);
                if (m[2]) end = parseInt(m[2], 10);
              }
              res.writeHead(206, {
                'Content-Range': 'bytes ' + start + '-' + end + '/' + st.size,
                'Accept-Ranges': 'bytes',
                'Content-Length': (end - start + 1),
                'Content-Type': 'application/octet-stream'
              });
            } else {
              res.writeHead(200, { 'Content-Length': st.size, 'Content-Type': 'application/octet-stream' });
            }
            fs.createReadStream(abs, { start: start, end: end }).pipe(res);
          });
          return;
        }

        // upload (support Content-Range)
        if (pathname === '/api/fs/file' && req.method === 'PUT') {
          var filePath2 = parsed.query.path || '';
          var abs2 = null;
          try { abs2 = resolvePath(filePath2); } catch (e2) { return sendJSON({ ok: false, error: e2.message }, 400); }
          var rangeHeader = req.headers['content-range'];
          readBody(function (buf) {
            if (rangeHeader) {
              var m2 = /bytes (\d+)-(\d+)?\/(\d+|\*)/.exec(rangeHeader);
              if (!m2) return sendJSON({ ok: false, error: 'Invalid Content-Range' }, 400);
              var start = parseInt(m2[1], 10);
              writeFilePart(abs2, start, buf).then(function () {
                emitEvent('fs', { event: 'write', path: filePath2 });
                sendJSON({ ok: true, result: 'partial-write' });
              }).catch(function (e3) { sendJSON({ ok: false, error: e3.message }, 500); });
            } else {
              fs.writeFile(abs2, buf, function (err) {
                if (err) return sendJSON({ ok: false, error: err.message }, 500);
                emitEvent('fs', { event: 'write', path: filePath2 });
                sendJSON({ ok: true, result: 'write' });
              });
            }
          });
          return;
        }

        if (pathname === '/api/fs/file' && req.method === 'DELETE') {
          var filePath3 = parsed.query.path || '';
          var abs3 = null;
          try { abs3 = resolvePath(filePath3); } catch (e4) { return sendJSON({ ok: false, error: e4.message }, 400); }
          fs.unlink(abs3, function (err) {
            if (err) return sendJSON({ ok: false, error: err.message }, 500);
            emitEvent('fs', { event: 'unlink', path: filePath3 });
            sendJSON({ ok: true, result: true });
          });
          return;
        }

        if (pathname === '/api/fs/dir' && req.method === 'POST') {
          var dirPath = parsed.query.path || '';
          var abs4 = null;
          try { abs4 = resolvePath(dirPath); } catch (e5) { return sendJSON({ ok: false, error: e5.message }, 400); }
          fs.mkdir(abs4, { recursive: true }, function (err) {
            if (err) return sendJSON({ ok: false, error: err.message }, 500);
            emitEvent('fs', { event: 'mkdir', path: dirPath });
            sendJSON({ ok: true, result: true });
          });
          return;
        }

        if (pathname === '/api/fs/dir' && req.method === 'DELETE') {
          var dirPath2 = parsed.query.path || '';
          var abs5 = null;
          try { abs5 = resolvePath(dirPath2); } catch (e6) { return sendJSON({ ok: false, error: e6.message }, 400); }
          var token = parsed.query.confirmToken;
          if (!token || !isTokenValid(token, abs5, 'rmdir')) {
            var t = makeToken();
            confirmMap[t] = { path: abs5, type: 'rmdir', exp: now() + 60000 };
            return sendJSON({ ok: false, confirmRequired: true, token: t, message: 'Repeat with confirmToken within 60s' }, 409);
          }
          fs.rm(abs5, { recursive: true, force: true }, function (err) {
            if (err) return sendJSON({ ok: false, error: err.message }, 500);
            emitEvent('fs', { event: 'rmdir', path: dirPath2 });
            sendJSON({ ok: true, result: true });
          });
          return;
        }

        if (pathname === '/api/fs/list' && req.method === 'GET') {
          var lpath = parsed.query.path || '.';
          var abs6 = null;
          try { abs6 = resolvePath(lpath); } catch (e7) { return sendJSON({ ok: false, error: e7.message }, 400); }
          return listDir(abs6).then(function (items) { sendJSON({ ok: true, entries: items }); })
            .catch(function (e) { sendJSON({ ok: false, error: e.message }, 500); });
        }

        if (pathname === '/api/fs/tree' && req.method === 'GET') {
          var tpath = parsed.query.path || '.';
          var abs7 = null;
          try { abs7 = resolvePath(tpath); } catch (e8) { return sendJSON({ ok: false, error: e8.message }, 400); }
          return listTree(abs7, '/').then(function (items) { sendJSON({ ok: true, entries: items }); })
            .catch(function (e) { sendJSON({ ok: false, error: e.message }, 500); });
        }

        if (pathname === '/api/fs/read' && req.method === 'GET') {
          var rpath = parsed.query.path || '';
          var offset = parseInt(parsed.query.offset || '0', 10);
          var length = parseInt(parsed.query.length || '0', 10);
          if (!length || length <= 0) length = 1024 * 1024;
          var abs8 = null;
          try { abs8 = resolvePath(rpath); } catch (e9) { return sendJSON({ ok: false, error: e9.message }, 400); }
          return readFilePart(abs8, offset, length).then(function (buf) {
            res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
            res.end(buf);
          }).catch(function (e) { sendJSON({ ok: false, error: e.message }, 500); });
        }

        if (pathname === '/api/json/read' && req.method === 'GET') {
          var jpath = parsed.query.path || '';
          var jptr = parsed.query.ptr || '/';
          var abs9 = null;
          try { abs9 = resolvePath(jpath); } catch (e10) { return sendJSON({ ok: false, error: e10.message }, 400); }
          return readJSONFile(abs9).then(function (obj) {
            var res1 = getByPointer(obj, jptr);
            if (!res1.ok) return sendJSON({ ok: false, error: res1.error }, 404);
            return sendJSON({ ok: true, value: res1.value });
          }).catch(function (e) { sendJSON({ ok: false, error: e.message }, 500); });
        }

        if (pathname === '/api/json/write' && req.method === 'POST') {
          var jpath2 = parsed.query.path || '';
          var jptr2 = parsed.query.ptr || '/';
          var abs10 = null;
          try { abs10 = resolvePath(jpath2); } catch (e11) { return sendJSON({ ok: false, error: e11.message }, 400); }
          return readBody(function (buf) {
            var body = safeJSONParse(buf.toString('utf8'), {});
            return readJSONFile(abs10).then(function (obj) {
              var res2 = setByPointer(obj, jptr2, body.value);
              if (!res2.ok) return sendJSON({ ok: false, error: res2.error }, 400);
              var root = res2.replacedRoot ? res2.root : obj;
              return writeJSONFile(abs10, root).then(function () {
                emitEvent('fs', { event: 'write', path: jpath2 });
                sendJSON({ ok: true, result: true });
              });
            }).catch(function (e) { sendJSON({ ok: false, error: e.message }, 500); });
          });
        }

        if (pathname === '/api/json/delete' && req.method === 'POST') {
          var jpath3 = parsed.query.path || '';
          var jptr3 = parsed.query.ptr || '/';
          var abs11 = null;
          try { abs11 = resolvePath(jpath3); } catch (e12) { return sendJSON({ ok: false, error: e12.message }, 400); }
          return readJSONFile(abs11).then(function (obj) {
            var res3 = delByPointer(obj, jptr3);
            if (!res3.ok) return sendJSON({ ok: false, error: res3.error }, 404);
            var root2 = res3.replacedRoot ? res3.root : obj;
            return writeJSONFile(abs11, root2).then(function () {
              emitEvent('fs', { event: 'write', path: jpath3 });
              sendJSON({ ok: true, result: true });
            });
          }).catch(function (e) { sendJSON({ ok: false, error: e.message }, 500); });
        }

        if (pathname === '/api/mem/get' && req.method === 'GET') {
          var mptr = parsed.query.ptr || '/';
          var r = memGet(mptr);
          return sendJSON(r.ok ? { ok: true, value: r.value } : { ok: false, error: r.error }, r.ok ? 200 : 404);
        }

        if (pathname === '/api/mem/set' && req.method === 'POST') {
          return readBody(function (buf) {
            var body2 = safeJSONParse(buf.toString('utf8'), {});
            var mptr2 = parsed.query.ptr || '/';
            var r4 = memSet(mptr2, body2.value);
            return sendJSON(r4.ok ? { ok: true, result: true } : { ok: false, error: r4.error }, r4.ok ? 200 : 400);
          });
        }

        if (pathname === '/api/mem/del' && req.method === 'POST') {
          var mptr3 = parsed.query.ptr || '/';
          var r5 = memDel(mptr3);
          return sendJSON(r5.ok ? { ok: true, result: true } : { ok: false, error: r5.error }, r5.ok ? 200 : 404);
        }

        sendJSON({ ok: false, error: 'Not found' }, 404);
      });

      wsServer = createWsServer(server, cfg.wsPath);
      emitter.on('fs', function (data) { wsServer.broadcast('fs', data); });
      emitter.on('mem', function (data) { wsServer.broadcast('mem', data); });

      server.listen(cfg.port, cfg.httpHost);

      return { server: server, ws: wsServer };
    }

    // Discovery (Node only)
    function startDiscovery() {
      if (!isNode) return null;
      var socket = dgram.createSocket('udp4');
      socket.bind(cfg.discoveryPort, function () {
        socket.setBroadcast(true);
      });

      socket.on('message', function (msg, rinfo) {
        var data = safeJSONParse(msg.toString('utf8'), null);
        if (!data || data.type !== 'CROOT_DISCOVERY') return;
        if (data.action === 'ping') {
          var reply = {
            type: 'CROOT_DISCOVERY',
            action: 'pong',
            name: cfg.nodeName,
            host: rinfo.address,
            port: cfg.port,
            wsPath: cfg.wsPath
          };
          var buf = Buffer.from(JSON.stringify(reply));
          socket.send(buf, 0, buf.length, rinfo.port, rinfo.address);
        }
      });

      function discover(timeoutMs, cb) {
        var results = [];
        var handler = function (msg) {
          var data = safeJSONParse(msg.toString('utf8'), null);
          if (data && data.type === 'CROOT_DISCOVERY' && data.action === 'pong') {
            results.push(data);
          }
        };
        socket.on('message', handler);
        var payload = Buffer.from(JSON.stringify({ type: 'CROOT_DISCOVERY', action: 'ping' }));
        socket.send(payload, 0, payload.length, cfg.discoveryPort, '255.255.255.255');
        setTimeout(function () {
          socket.removeListener('message', handler);
          cb(results);
        }, timeoutMs || 1000);
      }

      return { discover: discover, socket: socket };
    }

    // WebSocket client (Node only)
    function wsClient(urlStr, onMessage, onOpen, onClose) {
      if (!isNode) return null;
      var u = url.parse(urlStr);
      var key = crypto.randomBytes(16).toString('base64');
      var port = u.port || (u.protocol === 'wss:' ? 443 : 80);
      var host = u.hostname;
      var pathName = u.path || '/';
      var client = (u.protocol === 'wss:' ? https : http).request({
        host: host,
        port: port,
        path: pathName,
        headers: {
          'Connection': 'Upgrade',
          'Upgrade': 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': key
        }
      });
      client.end();

      client.on('upgrade', function (res, socket) {
        if (onOpen) onOpen();
        socket.on('data', function (buffer) {
          var bytes = new Uint8Array(buffer);
          if (bytes.length < 2) return;
          var len = bytes[1] & 0x7f;
          var offset = 2;
          if (len === 126) { len = (bytes[2] << 8) | bytes[3]; offset = 4; }
          else if (len === 127) { len = (bytes[6] << 24) | (bytes[7] << 16) | (bytes[8] << 8) | bytes[9]; offset = 10; }
          var payload = bytes.slice(offset, offset + len);
          var text = utf8Decode(payload);
          if (onMessage) onMessage(text);
        });
        socket.on('close', function () { if (onClose) onClose(); });
        client._socket = socket;
      });

      function send(obj) {
        var payload = utf8Encode(JSON.stringify(obj));
        var len = payload.length;
        var header = [];
        header.push(0x81);
        if (len < 126) header.push(len | 0x80);
        else if (len < 65536) header.push(126 | 0x80, (len >> 8) & 255, len & 255);
        else header.push(127 | 0x80, 0, 0, 0, 0, (len >> 24) & 255, (len >> 16) & 255, (len >> 8) & 255, len & 255);
        var mask = crypto.randomBytes(4);
        var masked = Buffer.alloc(payload.length);
        for (var i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
        var out = Buffer.concat([Buffer.from(header), mask, masked]);
        client._socket && client._socket.write(out);
      }

      return { send: send };
    }

    function downloadMulti(urlStr, destPath, parts, cb) {
      if (!isNode) return cb(new Error('downloadMulti only in node'));
      parts = parts || 4;
      var u = url.parse(urlStr);
      var proto = u.protocol === 'https:' ? https : http;
      proto.request({ method: 'HEAD', host: u.hostname, port: u.port, path: u.path }, function (res) {
        var total = parseInt(res.headers['content-length'] || '0', 10);
        if (!total) return cb(new Error('No content-length'));
        var partSize = Math.ceil(total / parts);
        var completed = 0;
        fs.open(destPath, 'w', function (err, fd) {
          if (err) return cb(err);
          for (var i = 0; i < parts; i++) (function (idx) {
            var start = idx * partSize;
            var end = Math.min(total - 1, start + partSize - 1);
            var req = proto.request({
              method: 'GET',
              host: u.hostname,
              port: u.port,
              path: u.path,
              headers: { 'Range': 'bytes=' + start + '-' + end }
            }, function (resp) {
              var pos = start;
              resp.on('data', function (chunk) {
                fs.write(fd, chunk, 0, chunk.length, pos, function () {});
                pos += chunk.length;
              });
              resp.on('end', function () {
                completed++;
                if (completed === parts) {
                  fs.close(fd, function () { cb(null); });
                }
              });
            });
            req.end();
          })(i);
        });
      }).end();
    }

    function downloadResume(urlStr, destPath, cb) {
      if (!isNode) return cb(new Error('downloadResume only in node'));
      var u = url.parse(urlStr);
      var proto = u.protocol === 'https:' ? https : http;
      fs.stat(destPath, function (err, st) {
        var start = 0;
        if (!err && st.isFile()) start = st.size;
        var req = proto.request({
          method: 'GET',
          host: u.hostname,
          port: u.port,
          path: u.path,
          headers: start ? { 'Range': 'bytes=' + start + '-' } : {}
        }, function (resp) {
          var flags = start ? 'a' : 'w';
          var ws = fs.createWriteStream(destPath, { flags: flags });
          resp.pipe(ws);
          resp.on('end', function () { cb(null); });
        });
        req.on('error', cb);
        req.end();
      });
    }

    function transferFromNode(nodeInfo, remotePath, localPath, cb) {
      if (!isNode) return cb(new Error('transfer only in node'));
      var urlStr = 'http://' + nodeInfo.host + ':' + nodeInfo.port + '/api/fs/file?path=' + encodeURIComponent(remotePath);
      downloadResume(urlStr, localPath, cb);
    }

    function startConsole() {
      if (!isNode) return null;
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', function (data) {
        var line = data.trim();
        if (!line) return;
        if (line === 'help') {
          process.stdout.write('Commands: mem.get ptr, mem.set ptr json, mem.del ptr, fs.list path\n');
          return;
        }
        var parts = line.split(' ');
        var cmd = parts[0];
        if (cmd === 'mem.get') {
          var r = memGet(parts[1] || '/');
          process.stdout.write(JSON.stringify(r) + '\n');
        } else if (cmd === 'mem.set') {
          var ptr = parts[1] || '/';
          var json = parts.slice(2).join(' ');
          var val = safeJSONParse(json, json);
          var r2 = memSet(ptr, val);
          process.stdout.write(JSON.stringify(r2) + '\n');
        } else if (cmd === 'mem.del') {
          var r3 = memDel(parts[1] || '/');
          process.stdout.write(JSON.stringify(r3) + '\n');
        } else if (cmd === 'fs.list') {
          var p = parts[1] || '.';
          listDir(resolvePath(p)).then(function (items) {
            process.stdout.write(JSON.stringify(items, null, 2) + '\n');
          }).catch(function (e) { process.stdout.write(e.message + '\n'); });
        } else {
          process.stdout.write('Unknown command\n');
        }
      });
      process.stdout.write('croot console ready (type help)\n');
      return true;
    }

    function followMaster(wsUrl) {
      if (!isNode) return null;
      var client = wsClient(wsUrl, function (text) {
        var msg = safeJSONParse(text, null);
        if (!msg || !msg.cmd) return;
        handleCommand(msg, function (resp) {
          client.send({ id: msg.id || null, ok: resp.ok, result: resp.result, error: resp.error, role: 'slave' });
        }, function () {});
      }, function () {}, function () {});
      return client;
    }

    var httpServer = null;
    var discovery = null;
    var watcherStop = null;

    function start() {
      if (isNode) {
        httpServer = startHttpServer();
        discovery = startDiscovery();
        watcherStop = startFsWatch(cfg.rootDir);
      }
      return api;
    }

    function stop() {
      if (httpServer && httpServer.server) {
        try { httpServer.server.close(); } catch (e) {}
      }
      if (discovery && discovery.socket) {
        try { discovery.socket.close(); } catch (e2) {}
      }
      if (watcherStop) watcherStop();
    }

    var api = {
      config: cfg,
      start: start,
      stop: stop,
      on: emitter.on,
      memGet: memGet,
      memSet: memSet,
      memDel: memDel,
      discover: function (cb) {
        if (!discovery) return cb([]);
        return discovery.discover(1000, cb);
      },
      downloadMulti: downloadMulti,
      downloadResume: downloadResume,
      transferFromNode: transferFromNode,
      startConsole: startConsole,
      followMaster: followMaster
    };

    return api;
  }

  function renderExplorerHtml(cfg) {
    return '<!doctype html>' +
      '<html><head><meta charset="utf-8" />' +
      '<meta name="viewport" content="width=device-width, initial-scale=1" />' +
      '<title>CROOT Explorer</title>' +
      '<style>' +
      'body{font-family:ui-monospace,Menlo,Consolas,monospace;background:linear-gradient(120deg,#f7f0e8,#e7f0ff);color:#1e2230;margin:0}' +
      'header{padding:14px 20px;background:#1e2230;color:#f7f0e8;display:flex;align-items:center;gap:12px}' +
      '.wrap{display:flex;gap:20px;padding:16px}' +
      '.panel{background:#fff;border:1px solid #e0e0e0;border-radius:10px;padding:12px;box-shadow:0 6px 20px rgba(0,0,0,0.06)}' +
      '.tree{width:40%;min-width:280px;max-height:80vh;overflow:auto}' +
      '.viewer{flex:1;min-height:300px}' +
      '.row{display:flex;gap:8px;align-items:center;margin:4px 0}' +
      'input,button,select,textarea{font-family:inherit;font-size:13px}' +
      'button{border:0;background:#1e2230;color:#f7f0e8;padding:6px 10px;border-radius:6px;cursor:pointer}' +
      'button.secondary{background:#e7e7ef;color:#1e2230}' +
      '.path{color:#6b7280;font-size:12px}' +
      '.list-item{padding:4px 6px;border-radius:6px;cursor:pointer}' +
      '.list-item:hover{background:#f0f4ff}' +
      '.console{height:220px;overflow:auto;background:#0f111a;color:#d5e2ff;border-radius:8px;padding:8px;font-size:12px}' +
      '</style></head><body>' +
      '<header><strong>CROOT Explorer</strong><span class="path">' + cfg.nodeName + ' @ ' + cfg.port + '</span></header>' +
      '<div class="wrap">' +
      '<div class="panel tree"><div class="row"><input id="path" value="." style="flex:1" />' +
      '<button id="refresh">List</button></div><div id="list"></div></div>' +
      '<div class="panel viewer">' +
      '<div class="row"><input id="file" placeholder="/path/to/file" style="flex:1" />' +
      '<button id="download">Download</button><button id="upload" class="secondary">Upload</button></div>' +
      '<div class="row"><textarea id="log" class="console" style="width:100%"></textarea></div>' +
      '<div class="row"><input id="cmd" placeholder="WS cmd JSON" style="flex:1" />' +
      '<button id="send">Send</button></div>' +
      '</div></div>' +
      '<script>' +
      'const log=(m)=>{const el=document.getElementById("log");el.value+=m+"\\n";el.scrollTop=el.scrollHeight;};' +
      'async function list(){const p=document.getElementById("path").value;const r=await fetch("/api/fs/list?path="+encodeURIComponent(p));const j=await r.json();const list=document.getElementById("list");list.innerHTML="";if(!j.ok){log("list error "+j.error);return;}j.entries.forEach(e=>{const d=document.createElement("div");d.className="list-item";d.textContent=(e.type==="dir"?"[D] ":"[F] ")+e.name;d.onclick=()=>{if(e.type==="dir"){document.getElementById("path").value=(p==="."?e.name:(p+"/"+e.name));list();}else{document.getElementById("file").value=(p==="."?e.name:(p+"/"+e.name));}};list.appendChild(d);});}' +
      'document.getElementById("refresh").onclick=list;list();' +
      'document.getElementById("download").onclick=()=>{const f=document.getElementById("file").value;window.open("/api/fs/file?path="+encodeURIComponent(f));};' +
      'document.getElementById("upload").onclick=async()=>{const f=document.getElementById("file").value;const inp=document.createElement("input");inp.type="file";inp.onchange=async()=>{const file=inp.files[0];const buf=await file.arrayBuffer();const r=await fetch("/api/fs/file?path="+encodeURIComponent(f||file.name),{method:"PUT",body:buf});const j=await r.json();log("upload "+JSON.stringify(j));};inp.click();};' +
      'const ws=new WebSocket("ws://"+location.host+"' + cfg.wsPath + '");' +
      'ws.onmessage=(e)=>log("ws:"+e.data);' +
      'document.getElementById("send").onclick=()=>{const t=document.getElementById("cmd").value;try{ws.send(t);}catch(e){log("ws send err"+e);}};' +
      '</script></body></html>';
  }

  // UMD export
  var apiFactory = { create: createCroot };
  if (isNode) {
    module.exports = apiFactory;
  } else {
    global.CROOT = apiFactory;
  }

  if (isNode && require.main === module) {
    var args = process.argv.slice(2);
    var opts = {};
    for (var i = 0; i < args.length; i++) {
      var a = args[i];
      if (a === '--port' && args[i + 1]) { opts.port = parseInt(args[++i], 10); continue; }
      if (a === '--root' && args[i + 1]) { opts.rootDir = args[++i]; continue; }
      if (a === '--host' && args[i + 1]) { opts.host = args[++i]; continue; }
      if (a === '--ws' && args[i + 1]) { opts.wsPath = args[++i]; continue; }
      if (a === '--name' && args[i + 1]) { opts.nodeName = args[++i]; continue; }
      if (a === '--no-console') { opts.noConsole = true; continue; }
      if (a === '--help') { opts.help = true; continue; }
    }

    if (opts.help) {
      process.stdout.write('Usage: node croot.js [--port N] [--root PATH] [--host IP] [--ws /ws] [--name NAME] [--no-console]\\n');
      process.exit(0);
    }

    var inst = createCroot(opts);
    inst.start();
    if (!opts.noConsole) inst.startConsole();
    var outPort = (opts.port || 8080);
    var outHost = (opts.host || '0.0.0.0');
    process.stdout.write('CROOT started on http://localhost:' + outPort + '\n');
    process.stdout.write('CROOT listening on http://' + outHost + ':' + outPort + '\n');
  }
})(typeof window !== 'undefined' ? window : global);
