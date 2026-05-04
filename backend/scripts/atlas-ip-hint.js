/**
 * Prints the public IPv4 this PC uses for outbound traffic (what Atlas should allow).
 */
const https = require('https');

function getJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { timeout: 8000 }, (res) => {
        let body = '';
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => resolve(body));
      })
      .on('error', reject)
      .on('timeout', function onTimeout() {
        this.destroy();
        reject(new Error('timeout'));
      });
  });
}

(async () => {
  console.log('\n[TillMate] Public IP for MongoDB Atlas whitelist:\n');
  try {
    const body = await getJson('https://api.ipify.org?format=json');
    const j = JSON.parse(body);
    console.log(`   ${j.ip}\n`);
  } catch {
    console.log('   (could not auto-detect — visit https://www.whatismyip.com in a browser)\n');
  }
  console.log('Atlas → Network Access → Add IP Address → use the IP above.');
  console.log('Quick dev option (not for production): add 0.0.0.0/0 then wait ~1 minute.\n');
})();
