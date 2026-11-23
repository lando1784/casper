const os = require('os');
const path = require('path');
const { createApp } = require('./src/app');

const port = Number(process.env.PORT || 3000);
const dataFile = process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json');

const server = createApp({ dataFile });
server.listen(port, () => {
  const bound = server.address();
  const actualPort = typeof bound === 'object' && bound ? bound.port : port;
  const ips = [...new Set(
    Object.values(os.networkInterfaces())
      .flat()
      .filter((i) => i && !i.internal && (String(i.family) === 'IPv4' || i.family === 4))
      .map((i) => i.address),
  )];
  console.log('casper in ascolto su:');
  console.log(`  http://localhost:${actualPort}   (sul dispositivo stesso / contesto sicuro)`);
  for (const ip of ips) console.log(`  http://${ip}:${actualPort}   (rete locale)`);
  console.log(`Dati salvati in: ${dataFile}`);
});
