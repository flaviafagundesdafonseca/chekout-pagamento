// server.js
// Backend que fica ENTRE o painel (frontend) e a NexusPag.
// A API key da NexusPag SÓ existe aqui, nunca no navegador do cliente.

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

const app = express();

// Só o domínio do seu painel pode chamar este backend.
// Configure ALLOWED_ORIGIN no .env com a URL exata onde o painel.html está hospedado
// (ex: https://seuusuario.github.io). Sem isso, o navegador bloqueia a chamada.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
if (!ALLOWED_ORIGIN) {
  console.warn('AVISO: ALLOWED_ORIGIN não definido no .env — liberando qualquer origem (use só em teste local).');
}
app.use(cors({ origin: ALLOWED_ORIGIN || true }));

// Guarda o corpo cru da requisição (necessário pra validar a assinatura do webhook)
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));

const NEXUSPAG_BASE_URL = 'https://nexuspag.com';
const API_KEY = process.env.NEXUSPAG_API_KEY;
const WEBHOOK_SECRET = process.env.NEXUSPAG_WEBHOOK_SECRET;
const WEBHOOK_URL = process.env.WEBHOOK_PUBLIC_URL; // ex: https://sua-api.com/webhooks/pagamentos

if (!API_KEY) {
  console.error('ERRO: defina NEXUSPAG_API_KEY no .env antes de subir o servidor.');
  process.exit(1);
}

// Valores permitidos no painel
const VALORES_PERMITIDOS = [100, 150, 200];

/**
 * POST /api/pagamentos/pix
 * Body: { valor: 100 | 150 | 200, descricao?: string }
 * Cria uma cobrança PIX na NexusPag e devolve os dados (QR code / copia-e-cola) pro painel.
 */
app.post('/api/pagamentos/pix', async (req, res) => {
  try {
    const { valor, descricao } = req.body;

    if (!VALORES_PERMITIDOS.includes(Number(valor))) {
      return res.status(400).json({ erro: `Valor inválido. Use um de: ${VALORES_PERMITIDOS.join(', ')}` });
    }

    const externalId = `pedido-${Date.now()}-${crypto.randomInt(1000, 9999)}`;

    const resposta = await fetch(`${NEXUSPAG_BASE_URL}/api/pix/create`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: Number(valor),
        description: descricao || `Pagamento de R$ ${valor}`,
        external_id: externalId,
        webhook_url: WEBHOOK_URL
      })
    });

    const dados = await resposta.json();

    // LOG TEMPORÁRIO: mostra exatamente o que a NexusPag devolveu, pra
    // descobrirmos os nomes reais dos campos (QR code, copia-e-cola etc.)
    console.log('Resposta da NexusPag (/api/pix/create):', JSON.stringify(dados, null, 2));

    if (!resposta.ok) {
      console.error('NexusPag retornou erro:', dados);
      return res.status(resposta.status).json({ erro: 'Falha ao criar cobrança PIX', detalhes: dados });
    }

    // Repassa pro painel só o necessário pra exibir o QR code / copia-e-cola
    res.json({ external_id: externalId, ...dados });
  } catch (erro) {
    console.error('Erro ao criar cobrança PIX:', erro);
    res.status(500).json({ erro: 'Erro interno ao criar cobrança PIX' });
  }
});

/**
 * POST /webhooks/pagamentos
 * A NexusPag chama essa rota quando o status de um pagamento muda
 * (payment.confirmed, cashout.success, cashout.failed, refund.completed).
 * Validação de assinatura conforme a doc: header x-webhook-signature = "t=<unix>,v1=<hmac>"
 */
app.post('/webhooks/pagamentos', (req, res) => {
  try {
    const signature = req.headers['x-webhook-signature'];
    if (!signature || !WEBHOOK_SECRET) {
      return res.status(400).send('Assinatura ausente ou webhook secret não configurado');
    }

    const fields = Object.fromEntries(signature.split(',').map(part => part.split('=')));
    const payload = req.rawBody.toString();

    const expected = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(`${fields.t}.${payload}`)
      .digest('hex');

    const dentroDoPrazo = Math.abs(Date.now() / 1000 - Number(fields.t)) <= 300;
    const valido =
      fields.v1?.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(fields.v1, 'hex'), Buffer.from(expected, 'hex'));

    if (!dentroDoPrazo || !valido) {
      console.warn('Webhook com assinatura inválida ou expirada.');
      return res.status(400).send('Assinatura inválida');
    }

    const evento = req.body;
    console.log('Webhook recebido:', evento.event ?? evento);

    // TODO: aqui você atualiza o pedido no seu banco de dados
    // conforme evento.event: payment.confirmed / refund.completed / etc.

    res.sendStatus(200);
  } catch (erro) {
    console.error('Erro ao processar webhook:', erro);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend rodando em http://localhost:${PORT}`));// server.js
// Backend que fica ENTRE o painel (frontend) e a NexusPag.
// A API key da NexusPag SÓ existe aqui, nunca no navegador do cliente.

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

const app = express();

// Só o domínio do seu painel pode chamar este backend.
// Configure ALLOWED_ORIGIN no .env com a URL exata onde o painel.html está hospedado
// (ex: https://seuusuario.github.io). Sem isso, o navegador bloqueia a chamada.
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN;
if (!ALLOWED_ORIGIN) {
  console.warn('AVISO: ALLOWED_ORIGIN não definido no .env — liberando qualquer origem (use só em teste local).');
}
app.use(cors({ origin: ALLOWED_ORIGIN || true }));

// Guarda o corpo cru da requisição (necessário pra validar a assinatura do webhook)
app.use(express.json({
  verify: (req, _res, buf) => { req.rawBody = buf; }
}));

const NEXUSPAG_BASE_URL = 'https://nexuspag.com';
const API_KEY = process.env.NEXUSPAG_API_KEY;
const WEBHOOK_SECRET = process.env.NEXUSPAG_WEBHOOK_SECRET;
const WEBHOOK_URL = process.env.WEBHOOK_PUBLIC_URL; // ex: https://sua-api.com/webhooks/pagamentos

if (!API_KEY) {
  console.error('ERRO: defina NEXUSPAG_API_KEY no .env antes de subir o servidor.');
  process.exit(1);
}

// Valores permitidos no painel
const VALORES_PERMITIDOS = [100, 150, 200];

/**
 * POST /api/pagamentos/pix
 * Body: { valor: 100 | 150 | 200, descricao?: string }
 * Cria uma cobrança PIX na NexusPag e devolve os dados (QR code / copia-e-cola) pro painel.
 */
app.post('/api/pagamentos/pix', async (req, res) => {
  try {
    const { valor, descricao } = req.body;

    if (!VALORES_PERMITIDOS.includes(Number(valor))) {
      return res.status(400).json({ erro: `Valor inválido. Use um de: ${VALORES_PERMITIDOS.join(', ')}` });
    }

    const externalId = `pedido-${Date.now()}-${crypto.randomInt(1000, 9999)}`;

    const resposta = await fetch(`${NEXUSPAG_BASE_URL}/api/pix/create`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: Number(valor),
        description: descricao || `Pagamento de R$ ${valor}`,
        external_id: externalId,
        webhook_url: WEBHOOK_URL
      })
    });

    const dados = await resposta.json();

    if (!resposta.ok) {
      console.error('NexusPag retornou erro:', dados);
      return res.status(resposta.status).json({ erro: 'Falha ao criar cobrança PIX', detalhes: dados });
    }

    // Repassa pro painel só o necessário pra exibir o QR code / copia-e-cola
    res.json({ external_id: externalId, ...dados });
  } catch (erro) {
    console.error('Erro ao criar cobrança PIX:', erro);
    res.status(500).json({ erro: 'Erro interno ao criar cobrança PIX' });
  }
});

/**
 * POST /webhooks/pagamentos
 * A NexusPag chama essa rota quando o status de um pagamento muda
 * (payment.confirmed, cashout.success, cashout.failed, refund.completed).
 * Validação de assinatura conforme a doc: header x-webhook-signature = "t=<unix>,v1=<hmac>"
 */
app.post('/webhooks/pagamentos', (req, res) => {
  try {
    const signature = req.headers['x-webhook-signature'];
    if (!signature || !WEBHOOK_SECRET) {
      return res.status(400).send('Assinatura ausente ou webhook secret não configurado');
    }

    const fields = Object.fromEntries(signature.split(',').map(part => part.split('=')));
    const payload = req.rawBody.toString();

    const expected = crypto
      .createHmac('sha256', WEBHOOK_SECRET)
      .update(`${fields.t}.${payload}`)
      .digest('hex');

    const dentroDoPrazo = Math.abs(Date.now() / 1000 - Number(fields.t)) <= 300;
    const valido =
      fields.v1?.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(fields.v1, 'hex'), Buffer.from(expected, 'hex'));

    if (!dentroDoPrazo || !valido) {
      console.warn('Webhook com assinatura inválida ou expirada.');
      return res.status(400).send('Assinatura inválida');
    }

    const evento = req.body;
    console.log('Webhook recebido:', evento.event ?? evento);

    // TODO: aqui você atualiza o pedido no seu banco de dados
    // conforme evento.event: payment.confirmed / refund.completed / etc.

    res.sendStatus(200);
  } catch (erro) {
    console.error('Erro ao processar webhook:', erro);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend rodando em http://localhost:${PORT}`));
