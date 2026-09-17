// The browser suite owns both its SQL cluster and Vite instance; no review data is read.
process.env.CONTAPANAMA_POSTGRES_BROWSER = '1';
require('../test/postgresIntegration.test');
