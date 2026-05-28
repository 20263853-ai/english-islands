
const http = require('http');
const fs = require('fs');
const path = require('path');
const mime = {'html':'text/html','js':'application/javascript','css':'text/css','json':'application/json'};
http.createServer((req, res) => {
    let fpath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    fs.readFile(fpath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not Found'); return; }
        let ext = fpath.split('.').pop();
        res.writeHead(200, {'Content-Type': mime[ext] || 'application/octet-stream'});
        res.end(data);
    });
}).listen(10102, '127.0.0.1', () => {
    console.log('READY on port 10102');
});
