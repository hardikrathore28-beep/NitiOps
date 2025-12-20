
import express from 'express';
import router from './routes';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Mount Routes
app.use(router);

import { startWorker } from './worker';
startWorker();

app.listen(PORT, () => {
    console.log(`Ingestion Service running on port ${PORT}`);
});
