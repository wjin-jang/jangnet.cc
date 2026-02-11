const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

const COST_FACTOR = 12;

async function main() {
  const username = process.argv[2] || 'admin';
  const password = process.argv[3] || 'admin';

  const hash = await bcrypt.hash(password, COST_FACTOR);

  const users = [{ username, hash, admin: true }];
  const dest = path.join(__dirname, 'users.json');

  fs.writeFileSync(dest, JSON.stringify(users, null, 2));
  console.log(`Created ${dest} with user "${username}"`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
