const fs = require('fs');
const content = fs.readFileSync('c:\\Users\\Emerson\\Documents\\GitHub\\Gestor-Delivery-SaaS-PRO\\apps\\api\\prisma\\schema.prisma', 'utf16le');
let lines = content.split('\n');
if (lines.length < 10) {
  lines = fs.readFileSync('c:\\Users\\Emerson\\Documents\\GitHub\\Gestor-Delivery-SaaS-PRO\\apps\\api\\prisma\\schema.prisma', 'utf8').split('\n');
}
lines.forEach((l, i) => {
  if (l.trim().startsWith('model ')) {
    console.log(i + 1, l.trim());
  }
});
