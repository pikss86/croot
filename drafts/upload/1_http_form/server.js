const http = require('http');
const fs = require('fs');

const server = http.createServer((req, res) => {
    console.log('request', req.url);
    res.writeHead(200, { 'Content-Type': 'text/html' });
    const indexfs = fs.createReadStream('index.html');
    indexfs.pipe(res);
});

server.listen(3000, 'localhost', () => console.log('server started'));