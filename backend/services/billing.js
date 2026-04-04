// ─── Configuración de planes ─────────────────────────────────────────────────
const PLANS = {
  gratis: {
    name: 'Gratis',
    price: 0,
    maxClientes: 3,
    features: ['Dashboard', 'Hasta 3 clientes', 'Flujo de caja básico'],
    stripePriceId: null,
  },
  basico: {
    name: 'Básico',
    price: 19,
    maxClientes: 15,
    features: ['Todo lo de Gratis', 'Hasta 15 clientes', 'Flujo de Caja', 'Alertas', 'Conciliación'],
    stripePriceId: process.env.STRIPE_PRICE_BASICO,
  },
  profesional: {
    name: 'Profesional',
    price: 39,
    maxClientes: 50,
    features: ['Todo lo de Básico', 'Hasta 50 clientes', 'Motor Contable', 'Reportes PDF', 'Fiscal ITBMS'],
    stripePriceId: process.env.STRIPE_PRICE_PROFESIONAL,
  },
  empresa: {
    name: 'Empresa',
    price: 79,
    maxClientes: 999999,
    features: ['Todo lo de Profesional', 'Clientes ilimitados', 'Múltiples usuarios', 'Soporte prioritario'],
    stripePriceId: process.env.STRIPE_PRICE_EMPRESA,
  },
};

const getPlan = (planKey) => PLANS[planKey] || PLANS.gratis;
const getAllPlans = () => PLANS;

module.exports = { PLANS, getPlan, getAllPlans };
