const path = require('path');
const { createApp } = require('./src/app');

const port = Number(process.env.PORT || 3000);
const dataFile = process.env.DATA_FILE || path.join(__dirname, 'data', 'db.json');

const server = createApp({ dataFile });
server.listen(port, () => {
  console.log(`casper in ascolto su http://localhost:${port}`);
});
