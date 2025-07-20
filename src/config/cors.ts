import cors from 'cors';

// CORS Configuration
const allowedOrigins = [
  'http://localhost:5173',    // Vite dev server
  'http://localhost:3000',    // React dev server
  'http://localhost:8080',    // Vue dev server
  'http://127.0.0.1:5173',   // Alternative localhost
  'http://127.0.0.1:3000',   // Alternative localhost
];

// Add environment variable if it exists
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

export const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control'
  ],
  exposedHeaders: ['Content-Length', 'X-Total-Count']
};

export const corsMiddleware = cors(corsOptions);
export { allowedOrigins }; 