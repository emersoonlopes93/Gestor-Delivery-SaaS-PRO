const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(walk(file));
        } else {
            if (file.toLowerCase().includes('guard')) {
                results.push(file);
            }
        }
    });
    return results;
}

const dir = 'c:\\Users\\emers\\Documents\\GitHub\\Gestor Delivery SaaS PRO\\apps\\api\\src';
const files = walk(dir);
files.forEach(f => console.log(f));
