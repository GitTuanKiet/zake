import { treaty } from '@elysiajs/eden';
import { type ZAKE_API } from './src/apis';
import { ZAKE_PORT, ZAKE_API_URL } from './src/constant';

let zakeApi = treaty<ZAKE_API>(ZAKE_API_URL).api;

if (!(await zakeApi.health.get().then(res => res.status === 200))) {
    zakeApi = treaty<ZAKE_API>(`http://localhost:${ZAKE_PORT}`).api;
    if (!(await zakeApi.health.get().then(res => res.status === 200))) {
        throw new Error('Zake API is not available');
    }
}

console.log(`Zake API is available at ${ZAKE_API_URL}`);

export { zakeApi };