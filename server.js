const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, 'public');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
http.createServer((req, res) => { const url = new URL(req.url, 'http://localhost'); let file = url.pathname === '/' ? '/index.html' : url.pathname; const target = path.normalize(path.join(root, file)); if (!target.startsWith(root)) { res.writeHead(403); return res.end('Forbidden'); }
    fs.readFile(target, (err, data) => { if (err) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
        res.end(data); }); }).listen(process.env.PORT || 3000, () => console.log(`ELSS running at http://localhost:${process.env.PORT||3000}`));