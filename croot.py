import os
import json
import lxml.etree
from aiohttp import web


HOST = '0.0.0.0'
PORT = os.getenv("PORT", 8080)

# TODO:
# CREATE (POST)
# 1. Разделить путь на путь в файловой системе и путь внутри файла
# 2. Выяснить к чему ведет путь в фаловой системе, к файлу или к папке
# 3. В зависимости от типа объекта фаловой системы (dir, txt, json, xml) определить объект внутри файла


async def create(request):
    path = request.match_info.get('path', "")
    headers = request.headers
    if '..' in path:
        return web.Response(text="", status=404)

    filename = "."
    pathinfile = []

    for pathseg in path.split("/"):
        if not os.path.exists(filename):
            return web.Response(text="", status=404)
        if not os.path.isfile(filename):
            filename = os.path.join(filename, pathseg)
        else:
            pathinfile.append(pathseg)
    
    data = await request.read()

    if os.path.isdir(filename):
        dir = os.path.dirname(filename)
        digetfilenames = [int(file) for file in os.listdir(dir) if file.isdigit()]
        if len(digetfilenames) == 0:
            filename = os.path.join(dir, '0')
        else:
            filename = os.path.join(dir, str(max(digetfilenames) + 1))
        with open(filename, 'wb') as f:
            f.write(data)
        return web.Response(text="", status=200)

    if os.path.isfile(filename):
        fn = filename.split(os.path.sep)[-1]
        fn = fn.split('.')

        if len(fn) > 1:
            ext = fn[-1]
            if ext == 'txt':
                newline = data.decode("utf-8")
                with open(filename, 'r') as f:
                    content = f.read()
                    if len(content) > 0:
                        lines = content.split(os.linesep)
                    else:
                        lines = []
                    lines.append(newline)
                    s = '\n'.join(lines)
                    f.close()
                    with open(filename, 'w') as f:
                        f.write(s)
                    return web.Response(text="", status=200)

    return web.Response(text="", status=200)


async def read(request):
    path = request.match_info.get('path', "")
    headers = request.headers
    if '..' in path:
        return web.Response(text="", status=404)

    filename = "."
    pathinfile = []

    for pathseg in path.split("/"):
        if not os.path.exists(filename):
            return web.Response(text="", status=404)
        if not os.path.isfile(filename):
            filename = os.path.join(filename, pathseg)
        else:
            pathinfile.append(pathseg)

    if os.path.isdir(filename):
        listdir = os.listdir(filename)
        # ответ на запрос
        if headers['Accept'] == 'application/json':
            return web.Response(text=json.dumps(listdir), status=200,
                                headers={'Content-Type': 'application/json'})
        else:
            return web.Response(text='\n'.join(listdir), status=200)

    if len(pathinfile) > 0:
        fn = filename.split(os.path.sep)[-1]
        fn = fn.split('.')

        if len(fn) > 1:
            ext = fn[-1]

            if ext == 'json':
                with open(filename, 'rb') as f:
                    obj = json.load(f)
                    for key in pathinfile:
                        if '' == key:
                            break
                        if key.isdigit():
                            key = int(key)
                        obj = obj[key]
                    if type(obj) == list:
                        childlist = [str(i) for i in range(0, len(obj))]
                    elif type(obj) == dict:
                        childlist = [k for k in obj.keys()]
                    elif type(obj) == bool:
                        if obj:
                            childlist = ['true']
                        else:
                            childlist = ['false']
                    else:
                        childlist = [str(obj)]
                    # ответ на запрос
                    if headers['Accept'] == 'application/json':
                        return web.Response(text=json.dumps(childlist), status=200,
                                            headers={'Content-Type': 'application/json'})
                    else:
                        return web.Response(text=os.linesep.join(childlist), status=200)

            if ext == 'xml':
                doc = lxml.etree.parse(filename)
                #root = tree.getroot()
                xpath = '/' + '/'.join(pathinfile)
                elements = doc.xpath(xpath)
                print(elements)
                return web.Response(text=xpath, status=200)

            if ext == 'txt':
                with open(filename, 'r') as f:
                    s = f.readlines()[int(pathinfile[0])]
                    return web.Response(text=s, status=200)

    if headers['Accept'] == 'application/json':
        fn = filename.split(os.path.sep)[-1]
        fn = fn.split('.')

        if len(fn) > 1:
            ext = fn[-1]

            if ext == 'txt':
                with open(filename, 'r') as f:
                    content = f.read()
                    lines = content.split(os.linesep)
                    return web.Response(text=json.dumps(lines), status=200,
                                            headers={'Content-Type': 'application/json'})


    with open(filename, 'rb') as f:
        content = f.read()
        # headers = dict()
        # if '.html' in filename:
        #     headers = {'Content-Type': "text/html; charset=utf-8"}
        # if '.css' in filename:
        #     headers = {'Content-Type': "text/css"}
        # if '.js' in filename:
        #     headers = {'Content-Type': "text/javascript"}
        return web.Response(body=content)  # , headers=headers)


async def update(request):
    path = request.match_info.get('path', "")
    if '..' in path:
        return web.Response(text="", status=404)
    filename = os.path.join('.', path)
    data = await request.read()
    with open(filename, 'wb') as f:
        f.write(data)
    return web.Response(text="", status=200)


async def delete(request):
    path = request.match_info.get('path', "")
    if '..' in path:
        return web.Response(text="", status=404)
    filename = os.path.join('.', path)
    if not os.path.exists(filename):
        return web.Response(text="", status=404)
    os.remove(filename)
    return web.Response(text="", status=200)


app = web.Application(client_max_size=1024**3)
app.add_routes([
    web.post('/{path:.*}', create),
    web.get('/{path:.*}', read),
    web.put('/{path:.*}', update),
    web.delete('/{path:.*}', delete)
])

if __name__ == '__main__':
    web.run_app(app, host=HOST, port=PORT)

