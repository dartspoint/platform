import {readiness} from '../packages/data/src/health';
import {db,redis} from '../packages/data/src/db';
try{await readiness();await db().end();await (await redis()).quit();}catch{process.exit(1);}
