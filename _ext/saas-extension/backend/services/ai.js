// ───────────────────────────────────────────────────────────────────
//  Service AI — asistente contable
// ───────────────────────────────────────────────────────────────────
//  Modo MOCK (default): respuestas deterministas, sin llamada externa.
//
//  Para producción, configurar AI_PROVIDER:
//    AI_PROVIDER=anthropic + ANTHROPIC_API_KEY=...
//    AI_PROVIDER=openai    + OPENAI_API_KEY=...
//
//  Interfaz:
//    completar({ mensajes, contexto, modelo }) → {
//      texto, tokens_in, tokens_out, costo_usd
//    }
// ───────────────────────────────────────────────────────────────────

const PROVIDER = process.env.AI_PROVIDER || 'mock';
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT = (ctx) => `Eres el asistente contable de ContaPanamá, una app SaaS para CPAs en Panamá.
Respondes en español panameño profesional, conciso (máximo 5 oraciones).
Cuando muestres cifras, usa formato $X,XXX.XX.
Si te piden una acción, sugiere el módulo: Diario, Fiscal, Bandeja OCR, Factura Electrónica, Reportes.

DATOS REALES DEL DESPACHO (período ${ctx.periodo}):
- Ingresos: $${(ctx.financiero.ingresos || 0).toFixed(2)}
- Gastos: $${(ctx.financiero.gastos || 0).toFixed(2)}
- Utilidad: $${(ctx.financiero.utilidad || 0).toFixed(2)}
- ITBMS neto a pagar a DGI: $${(ctx.financiero.itbms_neto || 0).toFixed(2)}
- Clientes activos: ${ctx.clientes.activos} (${ctx.clientes.omisos} omisos)

TOP CLIENTES POR INGRESOS (período):
${(ctx.top_clientes || []).map(c => `- ${c.cliente_nombre}: $${parseFloat(c.total).toFixed(2)}`).join('\n')}

PRÓXIMAS OBLIGACIONES:
${(ctx.vencimientos || []).map(v => `- ${v.fecha?.toISOString().slice(0,10)}: ${v.descripcion} (${v.entidad}, urgencia: ${v.urgencia})`).join('\n')}

REGLAS PANAMÁ:
- ITBMS estándar: 7%
- ISR persona jurídica: 25% flat
- ISR persona natural: 0% hasta $11k, 15% hasta $100k, 25% sobre
- F.430 ITBMS: día 15 del mes siguiente
- Renta anual: 31 marzo del siguiente año
`;

async function completar({ mensajes, contexto, modelo }) {
  switch (PROVIDER) {
    case 'anthropic': return completarAnthropic({ mensajes, contexto, modelo });
    case 'openai':    return completarOpenAI({ mensajes, contexto, modelo });
    default:          return completarMock({ mensajes, contexto });
  }
}

// ===================================================================
//  MOCK — responde con patterns simples basados en keywords.
// ===================================================================
async function completarMock({ mensajes, contexto }) {
  await new Promise(r => setTimeout(r, 700));
  const ultimo = mensajes[mensajes.length - 1].contenido.toLowerCase();
  let texto;

  if (/itbms|430/.test(ultimo)) {
    texto = `Tu ITBMS neto a pagar este período es **$${(contexto.financiero.itbms_neto || 0).toFixed(2)}**. ` +
      `Genera el Formulario 430 desde el módulo Fiscal y transmítelo antes del día 15.`;
  } else if (/cliente.*rentable|top|mejor cliente/.test(ultimo)) {
    const top = (contexto.top_clientes || [])[0];
    texto = top
      ? `Tu cliente más rentable es **${top.cliente_nombre}** con $${parseFloat(top.total).toFixed(2)} este período.`
      : `Aún no tenés ingresos registrados este período.`;
  } else if (/utilidad|ganancia|p&l/.test(ultimo)) {
    const u = contexto.financiero.utilidad || 0;
    texto = `Tu utilidad antes de impuestos es **$${u.toFixed(2)}**.${u > 0 ? ' Vas en azul.' : ''}`;
  } else if (/anomal|inusual|raro/.test(ultimo)) {
    texto = `Encontré 2 cosas a revisar:\n1. "Suscripción INV-USA" sin clasificar — 3 meses seguidos sin asignar cuenta.\n2. Felipe Motta $312 — 2× sobre el promedio histórico. Sugiero verificar.`;
  } else if (/vencimiento|obligaci/.test(ultimo)) {
    texto = (contexto.vencimientos || []).length
      ? `Tenés ${contexto.vencimientos.length} obligaciones próximas. La más urgente: ${contexto.vencimientos[0].descripcion} (${contexto.vencimientos[0].entidad}).`
      : `No tenés obligaciones pendientes ✓`;
  } else {
    texto = `Esta es una respuesta de demostración (modo mock). Para activar respuestas reales, configura ` +
      `\`AI_PROVIDER=anthropic\` o \`AI_PROVIDER=openai\` y la API key correspondiente en tu .env.`;
  }

  return {
    texto,
    tokens_in: Math.round((ultimo.length + JSON.stringify(contexto).length) / 4),
    tokens_out: Math.round(texto.length / 4),
    costo_usd: 0,
  };
}

// ===================================================================
//  Anthropic (Claude)
// ===================================================================
async function completarAnthropic({ mensajes, contexto, modelo }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Falta ANTHROPIC_API_KEY');
  const model = modelo === 'claude-sonnet' ? 'claude-sonnet-4-5'
              : modelo === 'claude-opus'   ? 'claude-opus-4-1'
              :                              'claude-haiku-4-5';

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT(contexto),
      messages: mensajes
        .filter(m => m.rol === 'user' || m.rol === 'assistant')
        .map(m => ({ role: m.rol === 'assistant' ? 'assistant' : 'user', content: m.contenido })),
    }),
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json.error?.message || 'Error en Claude');

  const texto = json.content?.[0]?.text || '';
  const tokens_in = json.usage?.input_tokens || 0;
  const tokens_out = json.usage?.output_tokens || 0;
  // Precio aproximado Haiku 4.5: $1/MTok in, $5/MTok out
  const costo_usd = +((tokens_in / 1000000) * 1 + (tokens_out / 1000000) * 5).toFixed(6);
  return { texto, tokens_in, tokens_out, costo_usd };
}

// ===================================================================
//  OpenAI (GPT-4o, GPT-4o-mini)
// ===================================================================
async function completarOpenAI({ mensajes, contexto, modelo }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('Falta OPENAI_API_KEY');
  const model = modelo === 'gpt-4o' ? 'gpt-4o' : 'gpt-4o-mini';

  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT(contexto) },
        ...mensajes
          .filter(m => m.rol === 'user' || m.rol === 'assistant')
          .map(m => ({ role: m.rol, content: m.contenido })),
      ],
    }),
  });
  const json = await r.json();
  if (!r.ok) throw new Error(json.error?.message || 'Error en OpenAI');

  const texto = json.choices?.[0]?.message?.content || '';
  const tokens_in = json.usage?.prompt_tokens || 0;
  const tokens_out = json.usage?.completion_tokens || 0;
  // Precio aproximado GPT-4o-mini: $0.15/MTok in, $0.60/MTok out
  const costo_usd = +((tokens_in / 1000000) * 0.15 + (tokens_out / 1000000) * 0.60).toFixed(6);
  return { texto, tokens_in, tokens_out, costo_usd };
}

module.exports = { completar };
