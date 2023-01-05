const fs = require('fs');

const pass = JSON.parse(fs.readFileSync('pass.json').toString());
let buff = Buffer.from(pass['password']);
let base64data = buff.toString('base64');
console.log("Change password in your config to: "+base64data);