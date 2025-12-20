import { createService, startService } from '@nitiops/service-template';
import router from './routes';

// dotenv config usually handled by createService or pre-load
import 'dotenv/config';

const app = createService('llm-gateway');
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3006; // RAG is 3005

app.use(router);

startService(app, PORT);
