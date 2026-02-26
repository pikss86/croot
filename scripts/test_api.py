#!/usr/bin/env python3
import os
import sys
import time
import json
import urllib.request
import urllib.error

HOST = os.environ.get("CROOT_HOST", "127.0.0.1")
PORT = int(os.environ.get("CROOT_PORT", "8080"))
BASE = f"http://{HOST}:{PORT}"

def fail(msg):
    print(f"FAIL: {msg}", file=sys.stderr)
    sys.exit(1)

def step(name):
    print(f"TEST: {name} ... ", end="", flush=True)

def ok():
    print("OK")

def http_request(method, url, data=None, headers=None):
    headers = headers or {}
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.getcode(), resp.read(), resp.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read(), e.headers

# wait for server
for _ in range(50):
    code, _, _ = http_request("GET", f"{BASE}/api/fs/list?path=.")
    if code in (200, 400, 404, 500):
        break
    time.sleep(0.1)
else:
    fail("Server did not start")

step("fs/file PUT")
payload = b"Hello CROOT"
code, body, _ = http_request("PUT", f"{BASE}/api/fs/file?path=hello.txt", data=payload)
if code != 200:
    fail(f"PUT file http {code}")
try:
    j = json.loads(body.decode("utf-8"))
    if not j.get("ok"):
        fail("PUT file response ok=false")
except Exception:
    fail("PUT file response not JSON")
ok()

step("fs/file GET")
code, body, _ = http_request("GET", f"{BASE}/api/fs/file?path=hello.txt")
if body != payload:
    fail("GET file content mismatch")
ok()

step("fs/file Range GET")
code, body, _ = http_request("GET", f"{BASE}/api/fs/file?path=hello.txt", headers={"Range": "bytes=6-10"})
if body != b"CROOT":
    fail("Range GET mismatch")
ok()

step("fs/read partial")
code, body, _ = http_request("GET", f"{BASE}/api/fs/read?path=hello.txt&offset=0&length=5")
if body != b"Hello":
    fail("fs/read mismatch")
ok()

step("fs/list")
code, body, _ = http_request("GET", f"{BASE}/api/fs/list?path=.")
try:
    j = json.loads(body.decode("utf-8"))
    if not j.get("ok"):
        fail("fs/list ok=false")
    if not any(e.get("name") == "hello.txt" for e in j.get("entries", [])):
        fail("fs/list missing hello.txt")
except Exception:
    fail("fs/list response not JSON")
ok()

step("fs/tree")
code, body, _ = http_request("GET", f"{BASE}/api/fs/tree?path=.")
try:
    j = json.loads(body.decode("utf-8"))
    if not j.get("ok"):
        fail("fs/tree ok=false")
except Exception:
    fail("fs/tree response not JSON")
ok()

step("fs/dir create")
code, body, _ = http_request("POST", f"{BASE}/api/fs/dir?path=testdir")
try:
    j = json.loads(body.decode("utf-8"))
    if not j.get("ok"):
        fail("fs/dir create ok=false")
except Exception:
    fail("fs/dir create response not JSON")
ok()

step("fs/dir delete confirm")
code, body, _ = http_request("DELETE", f"{BASE}/api/fs/dir?path=testdir")
try:
    j = json.loads(body.decode("utf-8"))
    if not j.get("confirmRequired") or not j.get("token"):
        fail("fs/dir delete should require confirm")
    token = j["token"]
except Exception:
    fail("fs/dir delete response not JSON")

code, body, _ = http_request("DELETE", f"{BASE}/api/fs/dir?path=testdir&confirmToken={token}")
try:
    j = json.loads(body.decode("utf-8"))
    if not j.get("ok"):
        fail("fs/dir delete confirm ok=false")
except Exception:
    fail("fs/dir delete confirm response not JSON")
ok()

step("json write")
code, body, _ = http_request("POST", f"{BASE}/api/json/write?path=data.json&ptr=/a", data=json.dumps({"value": 123}).encode("utf-8"), headers={"Content-Type": "application/json"})
try:
    j = json.loads(body.decode("utf-8"))
    if not j.get("ok"):
        fail("json write ok=false")
except Exception:
    fail("json write response not JSON")
ok()

step("json read")
code, body, _ = http_request("GET", f"{BASE}/api/json/read?path=data.json&ptr=/a")
try:
    j = json.loads(body.decode("utf-8"))
    if not (j.get("ok") and j.get("value") == 123):
        fail("json read mismatch")
except Exception:
    fail("json read response not JSON")
ok()

step("json delete")
code, body, _ = http_request("POST", f"{BASE}/api/json/delete?path=data.json&ptr=/a", data=b"{}", headers={"Content-Type": "application/json"})
try:
    j = json.loads(body.decode("utf-8"))
    if not j.get("ok"):
        fail("json delete ok=false")
except Exception:
    fail("json delete response not JSON")
ok()

step("mem set")
code, body, _ = http_request("POST", f"{BASE}/api/mem/set?ptr=/x", data=json.dumps({"value": "y"}).encode("utf-8"), headers={"Content-Type": "application/json"})
try:
    j = json.loads(body.decode("utf-8"))
    if not j.get("ok"):
        fail("mem set ok=false")
except Exception:
    fail("mem set response not JSON")
ok()

step("mem get")
code, body, _ = http_request("GET", f"{BASE}/api/mem/get?ptr=/x")
try:
    j = json.loads(body.decode("utf-8"))
    if not (j.get("ok") and j.get("value") == "y"):
        fail("mem get mismatch")
except Exception:
    fail("mem get response not JSON")
ok()

step("mem del")
code, body, _ = http_request("POST", f"{BASE}/api/mem/del?ptr=/x", data=b"{}", headers={"Content-Type": "application/json"})
try:
    j = json.loads(body.decode("utf-8"))
    if not j.get("ok"):
        fail("mem del ok=false")
except Exception:
    fail("mem del response not JSON")
ok()

step("fs/file Content-Range")
code, body, _ = http_request("PUT", f"{BASE}/api/fs/file?path=parts.txt", data=b"AAA", headers={"Content-Range": "bytes 0-2/*"})
if code != 200:
    fail(f"content-range part1 http {code}")
code, body, _ = http_request("PUT", f"{BASE}/api/fs/file?path=parts.txt", data=b"BBB", headers={"Content-Range": "bytes 3-5/*"})
if code != 200:
    fail(f"content-range part2 http {code}")
code, body, _ = http_request("GET", f"{BASE}/api/fs/file?path=parts.txt")
if body != b"AAABBB":
    fail("content-range merge mismatch")
ok()

print("OK")
