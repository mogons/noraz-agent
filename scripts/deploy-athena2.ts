import { Client } from 'ssh2';

const conn = new Client();

console.log('Connecting to VPS to deploy Athena 2.0 Upgrade...');

conn.on('ready', () => {
  console.log('✅ SSH Connection Established!');

  const cmd = `
    cd /root/Athena || cd $HOME/Athena

    echo "=== PULLING LATEST CODE FROM GITHUB ==="
    git pull origin master

    echo "=== REBUILDING TS DIST BUNDLE ==="
    npm run build

    echo "=== RESTARTING PM2 PROCESS WITH UPDATED ATHENA 2.0 ==="
    npx pm2 restart athena-agent --update-env || npx pm2 restart all --update-env
  `;

  conn.exec(cmd, (err, stream) => {
    if (err) {
      console.error('Exec error:', err);
      conn.end();
      return;
    }

    stream.on('close', (code: number) => {
      console.log(`\n✅ Remote deploy completed with exit code ${code}`);
      conn.end();
    }).on('data', (data: Buffer) => {
      process.stdout.write(data.toString());
    }).stderr.on('data', (data: Buffer) => {
      process.stderr.write(data.toString());
    });
  });
}).on('error', (err) => {
  console.error('❌ SSH Connection Error:', err);
}).connect({
  host: '202.155.16.125',
  port: 22,
  username: 'root',
  password: '9Mp%#Bhr3qj0tr',
  readyTimeout: 20000,
});
