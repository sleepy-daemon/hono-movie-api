import { Hono } from 'hono'
import { swaggerUI } from '@hono/swagger-ui'
import { openapi } from '../openapi'

const app = new Hono()

app.get('/openapi.json', c => c.json(openapi))
app.get('/docs', swaggerUI({ url: '/openapi.json', title: 'Movie API Docs' }))

export default app
