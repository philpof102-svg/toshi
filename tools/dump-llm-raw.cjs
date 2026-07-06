const fs = require('fs');
const s = fs.readFileSync('D:/Users/VolKov/veilleIA/toshi/lib/llm.mjs', 'utf8').split(/\r?\n/);
for (let i = 89; i <= 103; i++) console.log((i+1) + ': ' + JSON.stringify(s[i]));
