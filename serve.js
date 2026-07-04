const http=require('http'),fs=require('fs'),path=require('path');
const root=__dirname, types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.riv':'application/octet-stream','.css':'text/css'};
http.createServer((req,res)=>{let p=decodeURIComponent(req.url.split('?')[0]); if(p==='/')p='/panel/'; if(p.endsWith('/'))p+='index.html';
  const f=path.join(root,p); fs.readFile(f,(e,b)=>{ if(e){res.writeHead(404);res.end('404');return;} res.writeHead(200,{'content-type':types[path.extname(f)]||'text/plain','access-control-allow-origin':'*'}); res.end(b); });
}).listen(4821,()=>console.log('toshi panel on http://127.0.0.1:4821/panel/'));
