const http = require('http');
const fs = require('fs');
const path = require('path');
const https = require('https');
const root = path.join(__dirname, 'public');
const databasePath = path.join(__dirname, 'data', 'elss.json');
const users = { MASTER001: { password: 'master123', role: 'Master' }, CREW001: { password: 'crew123', role: 'Crew' }, OWNER001: { password: 'owner123', role: 'Vessel Owner' } };
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };

function loadEnv() { const file = path.join(__dirname, '.env'); if (!fs.existsSync(file)) return; for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) { const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, ''); } }
loadEnv();
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

function xmlFor(report, vessel) { const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character])); return `<ELSSReport operation="${escape(report.operation || 'DAT')}" reportId="${escape(report.id)}"><Vessel><Name>${escape(vessel.name)}</Name><RSSNumber>${escape(vessel.rss)}</RSSNumber><TripID>${escape(vessel.trip)}</TripID></Vessel><FishingActivity><Date>${escape(report.date)}</Date><UTCTime>${escape(report.utc)}</UTCTime><Location latitude="${escape(report.lat)}" longitude="${escape(report.lon)}"/><Species>${escape(report.species)}</Species><Quantity unit="kg">${escape(report.quantity)}</Quantity><Gear>${escape(report.gear)}</Gear><LandingPort>${escape(report.port)}</LandingPort></FishingActivity><Notes>${escape(report.notes)}</Notes></ELSSReport>`; }

function sendResend(email, xml) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({ from: process.env.RESEND_FROM, to: [email.recipient], subject: email.subject, html: `<p>ELSS report ${email.reportId} from ${email.vessel}.</p><p>Demo/test transmission. No regulatory production system was contacted.</p>`, attachments: [{ filename: email.attachment, content: Buffer.from(xml).toString('base64') }] });
        const request = https.request({ hostname: 'api.resend.com', path: '/emails', method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, response => {
            let result = '';
            response.on('data', chunk => result += chunk);
            response.on('end', () => {
                if (response.statusCode >= 200 && response.statusCode < 300) resolve(JSON.parse(result));
                else reject(new Error(`Resend rejected the email (${response.statusCode}).`));
            });
        });
        request.on('error', reject);
        request.write(payload);
        request.end();
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
            if (req.method === 'POST' && url.pathname === '/api/login') {
                const credentials = await body(req);
                const user = users[String(credentials.userId || '').toUpperCase()];
                if (!user || user.password !== credentials.password) return json(res, 401, { error: 'Invalid user ID or password.' });
                return json(res, 200, { userId: String(credentials.userId).toUpperCase(), role: user.role, token: `demo-${Date.now()}` });
            }
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
            if (req.method === 'POST' && url.pathname === '/api/email') {
                const request = await body(req);
                const state = readDatabase();
                const report = state.reports.find(item => item.id === request.reportId);
                if (!report) return json(res, 404, { error: 'Report was not found.' });
                const recipient = request.recipient || process.env.DEFAULT_EMAIL_TO || 'fizzaniaz.17@gmail.com';
                if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) return json(res, 400, { error: 'Enter a valid recipient email address.' });
                state.emails = state.emails || [];
                const email = { id: `EMAIL-${String(state.emails.length + 1).padStart(6, '0')}`, reportId: report.id, recipient, subject: `ELSS report ${report.id}`, attachment: report.filename, encrypted: true, status: 'PENDING', sentAt: new Date().toISOString(), userId: request.userId || 'MASTER001', vessel: state.vessel.name };
                const xml = xmlFor(report, state.vessel);
                if (process.env.RESEND_API_KEY && process.env.RESEND_FROM) {
                    await sendResend(email, xml);
                    email.status = 'SENT';
                } else { email.status = 'SIMULATED_SENT'; }
                state.emails.unshift(email);
                state.events.unshift({ time: email.sentAt, action: 'Simulated email sent', report: report.id, status: 'SUCCESS' });
                writeDatabase(state);
                return json(res, 201, email);
            }
            return json(res, 404, { error: 'API route not found' });
        } catch (error) { return json(res, 400, { error: error.message }); }
    }
    sendAsset(req, res);
}).listen(process.env.PORT || 3000, () => console.log(`ELSS backend running at http://localhost:${process.env.PORT || 3000}`));