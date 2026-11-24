import { getRequestListener } from '@hono/node-server'
import app from '../src/app.js'

export const config = { runtime: 'nodejs' }

// @hono/vercel's handle() is for Vercel's Edge runtime (WHATWG Request). We
// run on the Node runtime because got-scraping needs Node APIs. getRequestListener
// converts Node's IncomingMessage/ServerResponse to Hono's fetch(Request)
// contract and streams the response back.
export default getRequestListener(app.fetch)
