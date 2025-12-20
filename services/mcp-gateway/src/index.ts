import express from 'express';
import 'dotenv/config';
import router from './routes';

const app = express();
app.use(express.json());

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3007;

app.use(router);

app.listen(PORT, () => {
    console.log(`MCP Gateway listening on port ${PORT}`);
});
