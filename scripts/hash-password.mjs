// Prints the password_hash to store for a user, in the format
// src/lib/auth/password.ts checks — for adding an account by hand in the
// Supabase SQL Editor (e.g. the first super admin, who has no one to send
// them a signup link). Reads the password from stdin so it never lands in
// shell history:
//
//   node scripts/hash-password.mjs
//
// then: insert into users (email, password_hash, role)
//       values ('someone@example.com', '<printed hash>', 'super_admin');
import { randomBytes, scryptSync } from "node:crypto";
import { createInterface } from "node:readline";

const rl = createInterface({ input: process.stdin, output: process.stderr });
rl.question("Password: ", (password) => {
  rl.close();
  const salt = randomBytes(16);
  const key = scryptSync(password.normalize("NFKC"), salt, 64);
  console.log(`scrypt$${salt.toString("base64")}$${key.toString("base64")}`);
});
