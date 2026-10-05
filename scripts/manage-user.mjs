import { createDatabase } from '../dist/server/db.js';
import { loadConfig } from '../dist/server/config.js';
import { AuthStore } from '../dist/server/auth.js';
let input='';
for await (const chunk of process.stdin) input+=chunk;
try {
 const config=loadConfig(process.cwd()); const db=createDatabase({filename:config.databaseFile});
 new AuthStore(db).provision(JSON.parse(input)); db.close(); console.log('Usuário atualizado.');
} catch(error) {console.error(error instanceof Error?error.message:'Falha ao atualizar usuário.');process.exitCode=1;}
