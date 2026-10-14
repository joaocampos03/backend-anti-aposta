// Vercel's entrypoint, and nothing else: locally it is `npm run dev` or `npm start`.
//
// Vercel looks for the Express app in `app`, `index` or `server`, at the root
// before `src/`, and takes the first file that imports `express` — hence the
// bare import below. Pointed at `src/server.ts`, it recompiles the TypeScript
// with its own compiler options, which this project's NodeNext setup and path
// aliases do not survive. So it gets the output of `npm run build` instead,
// which Vercel runs before packaging the function.
import 'express';
import './dist/server.js';
