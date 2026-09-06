const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, 'public');
const databasePath = path.join(__dirname, 'data', 'elss.json');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
const initialState = () => {
    const timestamp = new Date().toISOString();
    return {
        seq: 1,
        vessel: { name: 'FV Ocean Guardian', rss: 'A12345', trip: 'TRIP-2026-001', status: 'AT SEA', lat: '50.1234', lon: '-1.2345' },
        reports: [{ id: 'ELSS-000125', type: 'FAR', species: 'Cod', quantity: '500', location: '50.1234 N, 1.2345 W', gear: 'Trawl', date: timestamp.slice(0, 10), filename: 'A1234520260907000001.xml', status: 'ACKNOWLEDGED', ack: 'SUCCESS', created: timestamp, user: 'MASTER001' }],
        unmatched: [],
        events: [{ time: timestamp, action: 'Acknowledgement received', report: 'ELSS-000125', status: 'SUCCESS' }],
        clock: '23:45',
        fish: true,
        landing: false,
        encryption: true
    };
};

function ensureDatabase() {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    if (!fs.existsSync(databasePath)) fs.writeFileSync(databasePath, JSON.stringify(initialState(), null, 2));
}

function readDatabase() { ensureDatabase(); return JSON.parse(fs.readFileSync(databasePath, 'utf8')); }

function writeDatabase(value) {
    ensureDatabase();
    fs.writeFileSync(databasePath, JSON.stringify(value, null, 2));
    return value;
}

function json(res, status, value) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(value));
}

function body(req) {
    return new Promise((resolve, reject) => {
        let value = '';
        req.on('data', chunk => value += chunk);
        req.on('end', () => { try { resolve(value ? JSON.parse(value) : {}); } catch { reject(new Error('Invalid JSON')); } });
    });
}

function sendAsset(req, res) {
    const requested = new URL(req.url, 'http://localhost').pathname;
    const file = requested === '/' ? '/index.html' : requested;
    const target = path.normalize(path.join(root, file));
    if (!target.startsWith(root)) return res.writeHead(403).end('Forbidden');
    fs.readFile(target, (error, data) => {
        if (error) return res.writeHead(404).end('Not found');
        res.writeHead(200, { 'Content-Type': types[path.extname(target)] || 'application/octet-stream' });
        res.end(data);
    });
}

ensureDatabase();
http.createServer(async(req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
        try {
            if (req.method === 'OPTIONS') return json(res, 204, {});
            if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { ok: true, database: 'json-file', path: 'data/elss.json' });
            if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, readDatabase());
            if (req.method === 'PUT' && url.pathname === '/api/state') return json(res, 200, writeDatabase(await body(req)));
            if (req.method === 'POST' && url.pathname === '/api/reset') return json(res, 200, writeDatabase(initialState()));
            if (req.method === 'GET' && url.pathname === '/api/reports') return json(res, 200, readDatabase().reports);
            if (req.method === 'POST' && url.pathname === '/api/reports') {
                const state = readDatabase();
                const report = await body(req);
                state.reports.unshift(report);
                return json(res, 201, writeDatabase(state).reports[0]);
            }
            if (req.method === 'DELETE' && url.pathname.startsWith('/api/reports/')) {
                const id = decodeURIComponent(url.pathname.split('/').pop());
                const state = readDatabase();
                state.reports = state.reports.filter(report => report.id !== id);
                return json(res, 200, writeDatabase(state));
            }
            return json(res, 404, { error: 'API route not found' });
        } catch (error) { return json(res, 400, { error: error.message }); }
    }
    sendAsset(req, res);
}).listen(process.env.PORT || 3000, () => console.log(`ELSS backend running at http://localhost:${process.env.PORT || 3000}`));