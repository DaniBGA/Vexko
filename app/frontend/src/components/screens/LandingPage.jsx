// src/components/screens/LandingPage.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  DollarSign, Box, CreditCard, ClipboardList, PieChart, Users, Home,
  ScanSearch, TrendingUp, ShieldCheck, Sparkles, ArrowRight, Check, Minus,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import Logo from '../ui/Logo.jsx';
import { buildWhatsappUrl, formatPlanPrice, usePublicSettings } from '../../lib/publicSettings.js';

const FALLBACK_JOIN_MAIL = 'mailto:hola@kioscoapp.com?subject=Quiero%20sumarme%20a%20la%20beta%20de%20Vexko';

// "Sumarme a la beta" abre un chat de WhatsApp con el número de Configuración
// (panel admin), con el plan elegido en el mensaje. Si todavía no hay número
// cargado, queda el mail de antes para que el botón no quede muerto.
function buildJoinLink(whatsappNumber, planName) {
  const text = planName
    ? `Hola, quiero sumarme a la beta de VEXKO con el plan ${planName}.`
    : 'Hola, quiero sumarme a la beta de VEXKO.';
  const url = buildWhatsappUrl(whatsappNumber, text);
  return url ? { href: url, target: '_blank', rel: 'noopener noreferrer' } : { href: FALLBACK_JOIN_MAIL };
}
import '../../styles/landing.css';

/* ---------------- Reveal-on-scroll helper ---------------- */
function useReveal() {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, inView];
}

function Reveal({ as: Tag = 'div', className = '', delay = 0, children }) {
  const [ref, inView] = useReveal();
  return (
    <Tag
      ref={ref}
      className={`lp-reveal ${inView ? 'lp-in' : ''} ${className}`}
      style={{ transitionDelay: inView ? `${delay}ms` : '0ms' }}
    >
      {children}
    </Tag>
  );
}

/* ---------------- Parallax background ---------------- */
function ParallaxBackdrop() {
  const [y, setY] = useState(0);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    let raf = null;
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        setY(window.scrollY);
        raf = null;
      });
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      <div className="lp-parallax-layer" style={{ transform: `translateY(${y * 0.18}px)` }}>
        <div className="lp-blob" style={{ width: 420, height: 420, top: -140, left: '8%', background: '#4caf82' }} />
      </div>
      <div className="lp-parallax-layer" style={{ transform: `translateY(${y * 0.35}px)` }}>
        <div className="lp-blob" style={{ width: 360, height: 360, top: 120, right: '4%', background: '#7d8bf5' }} />
      </div>
      <div className="lp-parallax-layer" style={{ transform: `translateY(${y * 0.08}px)` }}>
        <div className="lp-blob" style={{ width: 280, height: 280, top: 480, left: '38%', background: '#2e7d32', opacity: 0.35 }} />
      </div>
    </div>
  );
}

/* ---------------- Cursor that clicks on real mockup elements ---------------- */
function MockCursor({ containerRef, steps }) {
  const [pos, setPos] = useState(null);
  const [clicking, setClicking] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || !steps?.length) return;
    let cancelled = false;
    const timers = [];
    const t = (fn, ms) => timers.push(setTimeout(fn, ms));

    function moveTo(i) {
      if (cancelled) return;
      const container = containerRef.current;
      const target = steps[i].ref.current;
      if (!container || !target) return;
      const cRect = container.getBoundingClientRect();
      const tRect = target.getBoundingClientRect();
      setPos({
        x: tRect.left - cRect.left + tRect.width / 2,
        y: tRect.top - cRect.top + tRect.height / 2,
      });
      t(() => {
        setClicking(true);
        t(() => setClicking(false), 280);
        t(() => {
          if (i + 1 < steps.length) moveTo(i + 1);
        }, steps[i].holdMs ?? 500);
      }, 550);
    }

    t(() => moveTo(0), 350);
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [containerRef, steps]);

  if (!pos) return null;
  return (
    <div className="lp-cursor" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>
      <span className={`lp-cursor-dot ${clicking ? 'lp-clicking' : ''}`} />
    </div>
  );
}

/* ---------------- Simulated app usage mockup ---------------- */
const MOCK_NAV = [
  { icon: DollarSign, label: 'Registrar venta', key: 'venta' },
  { icon: Box, label: 'Stock', key: 'stock' },
  { icon: CreditCard, label: 'Caja', key: 'caja' },
];

const MOCK_CART = [
  { name: 'Coca-Cola 500ml', price: 1800 },
  { name: 'Alfajor Jorgito', price: 1200 },
  { name: 'Papas Lays 45g', price: 2100 },
];

const MOCK_STOCK = [
  { name: 'Agua mineral 500ml', stock: 34, status: 'ok' },
  { name: 'Cigarrillos Marlboro', stock: 4, status: 'crit' },
  { name: 'Chicles Beldent', stock: 12, status: 'alert' },
  { name: 'Cerveza Quilmes 1L', stock: 22, status: 'ok' },
];

function MockScreenVenta({ containerRef }) {
  const searchRef = useRef(null);
  const cartRowRef = useRef(null);
  const cobrarRef = useRef(null);
  const steps = useMemo(
    () => [
      { ref: searchRef, holdMs: 400 },
      { ref: cartRowRef, holdMs: 400 },
      { ref: cobrarRef, holdMs: 700 },
    ],
    []
  );
  return (
    <div className="lp-mock-screen relative h-full">
      <div className="text-[11px] font-700 text-slate-500 mb-2">Registrar venta</div>
      <div ref={searchRef} className="lp-mock-card mb-2 flex items-center gap-2 text-[10px] text-slate-400">
        <ScanSearch size={12} /> Buscar producto...
      </div>
      <div className="flex flex-col gap-2">
        {MOCK_CART.map((item, i) => (
          <div
            key={item.name}
            ref={i === 0 ? cartRowRef : undefined}
            className="lp-cart-row lp-mock-card flex items-center justify-between text-[10px]"
            style={{ animationDelay: `${i * 0.4 + 0.2}s` }}
          >
            <span className="text-slate-600">{item.name}</span>
            <span className="font-700 text-slate-800">${item.price.toLocaleString('es-AR')}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] font-800 text-slate-700">
        <span>Total</span>
        <span>$5.100</span>
      </div>
      <div ref={cobrarRef} className="mt-2 text-center text-[10px] font-700 text-white rounded-lg py-1.5" style={{ background: '#4caf82' }}>
        Cobrar
      </div>
      <MockCursor containerRef={containerRef} steps={steps} />
    </div>
  );
}

function MockScreenStock({ containerRef }) {
  const dot = { ok: '#4caf82', alert: '#f59e0b', crit: '#e74c3c' };
  const rowRef = useRef(null);
  const steps = useMemo(() => [{ ref: rowRef, holdMs: 1000 }], []);
  return (
    <div className="lp-mock-screen h-full">
      <div className="text-[11px] font-700 text-slate-500 mb-2">Stock</div>
      <div className="flex flex-col gap-1.5">
        {MOCK_STOCK.map((p, i) => (
          <div
            key={p.name}
            ref={i === 1 ? rowRef : undefined}
            className="lp-cart-row lp-mock-card flex items-center justify-between text-[10px]"
            style={{ animationDelay: `${i * 0.12}s` }}
          >
            <span className="text-slate-600">{p.name}</span>
            <span className="flex items-center gap-1 font-700" style={{ color: dot[p.status] }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: dot[p.status] }} />
              {p.stock}u
            </span>
          </div>
        ))}
      </div>
      <MockCursor containerRef={containerRef} steps={steps} />
    </div>
  );
}

function MockScreenCaja({ containerRef }) {
  const btnRef = useRef(null);
  const steps = useMemo(() => [{ ref: btnRef, holdMs: 1000 }], []);
  return (
    <div className="lp-mock-screen h-full">
      <div className="text-[11px] font-700 text-slate-500 mb-2">Caja</div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="lp-cart-row lp-mock-card" style={{ animationDelay: '0s' }}>
          <div className="text-[9px] text-slate-400 uppercase">Efectivo</div>
          <div className="text-[12px] font-800 text-slate-700">$48.200</div>
        </div>
        <div className="lp-cart-row lp-mock-card" style={{ animationDelay: '0.15s' }}>
          <div className="text-[9px] text-slate-400 uppercase">Transferencia</div>
          <div className="text-[12px] font-800 text-slate-700">$21.900</div>
        </div>
      </div>
      <div className="lp-cart-row lp-mock-card flex items-center justify-between" style={{ animationDelay: '0.3s' }}>
        <span className="text-[10px] text-slate-500">Total del día</span>
        <span className="text-[12px] font-800" style={{ color: '#4caf82' }}>$70.100</span>
      </div>
      <div
        ref={btnRef}
        className="lp-cart-row mt-2 text-center text-[10px] font-700 rounded-lg py-1.5 border"
        style={{ animationDelay: '0.45s', borderColor: '#4caf82', color: '#2e7d32' }}
      >
        Cerrar caja
      </div>
      <MockCursor containerRef={containerRef} steps={steps} />
    </div>
  );
}

const MOCK_SCREENS = [MockScreenVenta, MockScreenStock, MockScreenCaja];

function AppSimulation() {
  const [active, setActive] = useState(0);
  const mainRef = useRef(null);
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const interval = setInterval(() => {
      setActive((a) => (a + 1) % MOCK_SCREENS.length);
    }, reduce ? 6000 : 3800);
    return () => clearInterval(interval);
  }, []);
  const ActiveScreen = MOCK_SCREENS[active];

  return (
    <div className="lp-mock-window lp-float w-full max-w-md mx-auto">
      <div className="lp-mock-topbar">
        <span className="lp-mock-dot" />
        <span className="lp-mock-dot" />
        <span className="lp-mock-dot" />
        <span className="ml-2 text-[10px] text-slate-400">kioscoapp.com/app</span>
      </div>
      <div className="lp-mock-body">
        <div className="lp-mock-sidebar">
          <div className="text-white text-[10px] font-800 mb-3 opacity-90">KioscoApp</div>
          {MOCK_NAV.map((item, i) => (
            <div key={item.key} className={`lp-mock-nav-item ${active === i ? 'lp-active' : ''}`}>
              <item.icon size={11} /> {item.label}
            </div>
          ))}
        </div>
        <div className="lp-mock-main" key={active} ref={mainRef}>
          <ActiveScreen containerRef={mainRef} />
        </div>
      </div>
    </div>
  );
}

/* ---------------- Section carousel: one slide per real app section ---------------- */
const CAROUSEL_NAV = [
  { key: 'venta', label: 'Registrar venta', icon: DollarSign },
  { key: 'historial', label: 'Historial de ventas', icon: ClipboardList },
  { key: 'stock', label: 'Stock', icon: Box },
  { key: 'gastos', label: 'Gastos', icon: CreditCard },
  { key: 'resultados', label: 'Resultados del mes', icon: PieChart },
  { key: 'proveedores', label: 'Proveedores', icon: Users },
  { key: 'caja', label: 'Caja', icon: Home },
  { key: 'clientes', label: 'Clientes / puntos', icon: Users },
];

const MOCK_HISTORY = [
  { time: '18:42', method: 'Efectivo', amount: 3200 },
  { time: '18:20', method: 'Transferencia', amount: 5600 },
  { time: '17:55', method: 'Tarjeta', amount: 1800 },
  { time: '17:30', method: 'Efectivo', amount: 950 },
];

const MOCK_GASTOS = [
  { label: 'Compra a proveedor EDA', amount: 42000 },
  { label: 'Luz y servicios', amount: 8500 },
  { label: 'Delivery de pedidos', amount: 3200 },
];

const MOCK_RESULTADOS = [
  { label: 'Ventas del mes', value: '$612.400', trend: '+12%' },
  { label: 'Gastos del mes', value: '$198.300', trend: '-4%' },
  { label: 'Ganancia', value: '$414.100', trend: '+18%' },
];

const MOCK_PROVEEDORES = [
  { name: 'Distribuidora EDA', rubro: 'Golosinas y snacks' },
  { name: 'FRAIFER', rubro: 'Bebidas y vinos' },
  { name: 'Cervecería local', rubro: 'Bebidas' },
];

const MOCK_CLIENTES = [
  { name: 'Martín G.', points: 320 },
  { name: 'Rocío P.', points: 145 },
  { name: 'Vecinal Los Aromos', points: 890 },
];

function PanelVenta() {
  return (
    <div className="lp-mock-screen h-full">
      <div className="text-[11px] font-700 text-slate-500 mb-2">Registrar venta</div>
      <div className="lp-mock-card mb-2 flex items-center gap-2 text-[10px] text-slate-400">
        <ScanSearch size={12} /> Buscar producto...
      </div>
      <div className="flex flex-col gap-2">
        {MOCK_CART.map((item, i) => (
          <div key={item.name} className="lp-cart-row lp-mock-card flex items-center justify-between text-[10px]" style={{ animationDelay: `${i * 0.12 + 0.1}s` }}>
            <span className="text-slate-600">{item.name}</span>
            <span className="font-700 text-slate-800">${item.price.toLocaleString('es-AR')}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] font-800 text-slate-700">
        <span>Total</span>
        <span>$5.100</span>
      </div>
      <div className="mt-2 text-center text-[10px] font-700 text-white rounded-lg py-1.5" style={{ background: '#4caf82' }}>Cobrar</div>
    </div>
  );
}

function PanelStock() {
  const dot = { ok: '#4caf82', alert: '#f59e0b', crit: '#e74c3c' };
  return (
    <div className="lp-mock-screen h-full">
      <div className="text-[11px] font-700 text-slate-500 mb-2">Stock</div>
      <div className="flex flex-col gap-1.5">
        {MOCK_STOCK.map((p, i) => (
          <div key={p.name} className="lp-cart-row lp-mock-card flex items-center justify-between text-[10px]" style={{ animationDelay: `${i * 0.1}s` }}>
            <span className="text-slate-600">{p.name}</span>
            <span className="flex items-center gap-1 font-700" style={{ color: dot[p.status] }}>
              <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: dot[p.status] }} />
              {p.stock}u
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelCaja() {
  return (
    <div className="lp-mock-screen h-full">
      <div className="text-[11px] font-700 text-slate-500 mb-2">Caja</div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div className="lp-cart-row lp-mock-card" style={{ animationDelay: '0s' }}>
          <div className="text-[9px] text-slate-400 uppercase">Efectivo</div>
          <div className="text-[12px] font-800 text-slate-700">$48.200</div>
        </div>
        <div className="lp-cart-row lp-mock-card" style={{ animationDelay: '0.1s' }}>
          <div className="text-[9px] text-slate-400 uppercase">Transferencia</div>
          <div className="text-[12px] font-800 text-slate-700">$21.900</div>
        </div>
      </div>
      <div className="lp-cart-row lp-mock-card flex items-center justify-between" style={{ animationDelay: '0.2s' }}>
        <span className="text-[10px] text-slate-500">Total del día</span>
        <span className="text-[12px] font-800" style={{ color: '#4caf82' }}>$70.100</span>
      </div>
      <div className="lp-cart-row mt-2 text-center text-[10px] font-700 rounded-lg py-1.5 border" style={{ animationDelay: '0.3s', borderColor: '#4caf82', color: '#2e7d32' }}>
        Cerrar caja
      </div>
    </div>
  );
}

function PanelHistorial() {
  return (
    <div className="lp-mock-screen h-full">
      <div className="text-[11px] font-700 text-slate-500 mb-2">Historial de ventas</div>
      <div className="flex flex-col gap-1.5">
        {MOCK_HISTORY.map((h, i) => (
          <div key={h.time} className="lp-cart-row lp-mock-card flex items-center justify-between text-[10px]" style={{ animationDelay: `${i * 0.1}s` }}>
            <span className="text-slate-400">{h.time}</span>
            <span className="text-slate-600">{h.method}</span>
            <span className="font-700 text-slate-800">${h.amount.toLocaleString('es-AR')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelGastos() {
  return (
    <div className="lp-mock-screen h-full">
      <div className="text-[11px] font-700 text-slate-500 mb-2">Gastos</div>
      <div className="flex flex-col gap-1.5">
        {MOCK_GASTOS.map((g, i) => (
          <div key={g.label} className="lp-cart-row lp-mock-card flex items-center justify-between text-[10px]" style={{ animationDelay: `${i * 0.12}s` }}>
            <span className="text-slate-600">{g.label}</span>
            <span className="font-700" style={{ color: '#c0392b' }}>-${g.amount.toLocaleString('es-AR')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelResultados() {
  return (
    <div className="lp-mock-screen h-full">
      <div className="text-[11px] font-700 text-slate-500 mb-2">Resultados del mes</div>
      <div className="grid grid-cols-1 gap-2">
        {MOCK_RESULTADOS.map((k, i) => (
          <div key={k.label} className="lp-cart-row lp-mock-card flex items-center justify-between text-[10px]" style={{ animationDelay: `${i * 0.12}s` }}>
            <div>
              <div className="text-slate-400 text-[9px] uppercase">{k.label}</div>
              <div className="font-800 text-slate-800 text-[12px]">{k.value}</div>
            </div>
            <span className="font-700" style={{ color: k.trend.startsWith('-') ? '#c0392b' : '#2e7d32' }}>{k.trend}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelProveedores() {
  return (
    <div className="lp-mock-screen h-full">
      <div className="text-[11px] font-700 text-slate-500 mb-2">Proveedores</div>
      <div className="flex flex-col gap-1.5">
        {MOCK_PROVEEDORES.map((p, i) => (
          <div key={p.name} className="lp-cart-row lp-mock-card text-[10px]" style={{ animationDelay: `${i * 0.12}s` }}>
            <div className="font-700 text-slate-700">{p.name}</div>
            <div className="text-slate-400 text-[9px]">{p.rubro}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PanelClientes() {
  return (
    <div className="lp-mock-screen h-full">
      <div className="text-[11px] font-700 text-slate-500 mb-2">Clientes / puntos</div>
      <div className="flex flex-col gap-1.5">
        {MOCK_CLIENTES.map((c, i) => (
          <div key={c.name} className="lp-cart-row lp-mock-card flex items-center justify-between text-[10px]" style={{ animationDelay: `${i * 0.12}s` }}>
            <span className="text-slate-600">{c.name}</span>
            <span className="font-700" style={{ color: '#4caf82' }}>{c.points} pts</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const CAROUSEL_PANELS = {
  venta: PanelVenta,
  stock: PanelStock,
  caja: PanelCaja,
  historial: PanelHistorial,
  gastos: PanelGastos,
  resultados: PanelResultados,
  proveedores: PanelProveedores,
  clientes: PanelClientes,
};

const CAROUSEL_SECTIONS = [
  {
    key: 'venta',
    plan: 'Plan Base',
    title: 'Registrar venta',
    desc: 'Buscás el producto por nombre o código, armás el carrito y cobrás combinando efectivo, transferencia y tarjeta en la misma venta.',
    bullets: [
      'Búsqueda instantánea en el catálogo global y tus productos propios',
      'Carrito con edición de cantidades',
      'Pago simple, combinado o fiado a un cliente',
    ],
  },
  {
    key: 'stock',
    plan: 'Plan Base',
    title: 'Stock',
    desc: 'Todo tu inventario en un solo lugar, con el catálogo global pre-cargado y alertas cuando un producto está por quedarse sin stock o por vencer.',
    bullets: [
      'Alertas de stock crítico y próximos vencimientos',
      'Alta de productos propios fuera del catálogo global',
      'Edición de precio y costo por producto',
      'Impresión de etiquetas con código de barra (plan premium)',
    ],
  },
  {
    key: 'caja',
    plan: 'Plan Base',
    title: 'Caja',
    desc: 'Apertura y cierre de caja con el total del día discriminado por medio de pago, para cuadrar sin planillas aparte.',
    bullets: ['Apertura y cierre diario', 'Totales por efectivo, transferencia y tarjeta', 'Diferencias detectadas al cierre'],
  },
  {
    key: 'historial',
    plan: 'Plan Intermedio',
    title: 'Historial de ventas',
    desc: 'Cada venta registrada queda disponible para consultar, con el detalle de productos, hora y medio de pago.',
    bullets: ['Consulta y filtrado de ventas pasadas', 'Detalle de productos vendidos por ticket', 'Base para el historial de cada cliente'],
  },
  {
    key: 'gastos',
    plan: 'Plan Intermedio',
    title: 'Gastos',
    desc: 'Registrás los gastos del kiosco para tener el panorama completo del negocio, no solo lo que entra por caja.',
    bullets: ['Carga rápida de gastos por categoría', 'Comparativa contra las ventas del período', 'Base para el cálculo de resultados'],
  },
  {
    key: 'resultados',
    plan: 'Plan Intermedio',
    title: 'Resultados del mes',
    desc: 'Ventas, gastos y ganancia del mes de un vistazo, para decidir con números reales y no a ojo.',
    bullets: ['Resumen mensual de ingresos y egresos', 'Comparación mes a mes', 'Detección temprana de meses con pérdida'],
  },
  {
    key: 'proveedores',
    plan: 'Plan Intermedio',
    title: 'Proveedores',
    desc: 'Ficha por proveedor con sus datos y rubro, para no perder el hilo de a quién comprarle qué.',
    bullets: ['Ficha de contacto por proveedor', 'Organización por rubro', 'Acceso rápido desde el detalle del producto'],
  },
  {
    key: 'clientes',
    plan: 'Plan Premium',
    title: 'Clientes / puntos',
    desc: 'Programa de puntos y fichas de clientes frecuentes para fidelizar sin depender de la memoria del mostrador.',
    bullets: ['Ficha de cliente con historial de compras', 'Acumulación y canje de puntos', 'Búsqueda rápida al momento de cobrar'],
  },
];

function SectionCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = CAROUSEL_SECTIONS.length;

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || paused) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), 5200);
    return () => clearInterval(t);
  }, [paused, count]);

  function go(delta) {
    setIndex((i) => (i + delta + count) % count);
  }

  const section = CAROUSEL_SECTIONS[index];
  const PanelBody = CAROUSEL_PANELS[section.key];

  return (
    <div onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="grid md:grid-cols-2 gap-10 items-center">
        <div key={`window-${index}`} className="lp-mock-window w-full max-w-md mx-auto">
          <div className="lp-mock-topbar">
            <span className="lp-mock-dot" />
            <span className="lp-mock-dot" />
            <span className="lp-mock-dot" />
            <span className="ml-2 text-[10px] text-slate-400">kioscoapp.com/app</span>
          </div>
          <div className="lp-mock-body">
            <div className="lp-mock-sidebar">
              <div className="text-white text-[10px] font-800 mb-3 opacity-90">KioscoApp</div>
              {CAROUSEL_NAV.map((item) => (
                <div key={item.key} className={`lp-mock-nav-item ${item.key === section.key ? 'lp-active' : ''}`}>
                  <item.icon size={11} /> {item.label}
                </div>
              ))}
            </div>
            <div className="lp-mock-main">
              <PanelBody />
            </div>
          </div>
        </div>

        <div key={`text-${index}`} className="lp-mock-screen">
          <span
            className="inline-flex items-center text-[10px] font-800 tracking-wide uppercase rounded-full px-2.5 py-1 mb-4"
            style={{ background: '#e8f8ee', color: '#2e7d32' }}
          >
            {section.plan}
          </span>
          <h3 className="text-2xl font-800 text-slate-900 mb-3">{section.title}</h3>
          <p className="text-slate-500 mb-5">{section.desc}</p>
          <ul className="space-y-2.5">
            {section.bullets.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-sm text-slate-600">
                <Check size={15} className="mt-0.5 flex-shrink-0" style={{ color: '#4caf82' }} />
                {b}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 mt-10">
        <button
          onClick={() => go(-1)}
          aria-label="Sección anterior"
          className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition flex-shrink-0"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          {CAROUSEL_SECTIONS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setIndex(i)}
              aria-label={`Ir a ${s.title}`}
              className="rounded-full transition-all"
              style={{ width: i === index ? 20 : 7, height: 7, background: i === index ? '#4caf82' : '#d8dceb' }}
            />
          ))}
        </div>
        <button
          onClick={() => go(1)}
          aria-label="Siguiente sección"
          className="w-9 h-9 rounded-full border border-slate-200 flex items-center justify-center hover:bg-slate-50 transition flex-shrink-0"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

/* ---------------- Data ---------------- */
const STEPS = [
  {
    icon: DollarSign,
    title: 'Registrás la venta',
    desc: 'Buscás el producto, armás el carrito y cobrás en efectivo, transferencia, tarjeta o combinado. Todo en segundos, pensado para el mostrador.',
  },
  {
    icon: Box,
    title: 'Controlás el stock',
    desc: 'Cada venta descuenta stock automáticamente. Alertas de stock crítico y vencimientos próximos para que nunca te quedes sin lo que más vendés.',
  },
  {
    icon: CreditCard,
    title: 'Cerrás la caja',
    desc: 'Apertura y cierre de caja con el total del día discriminado por medio de pago, listo para cuadrar sin planillas aparte.',
  },
  {
    icon: PieChart,
    title: 'Analizás el negocio',
    desc: 'Gastos, resultados del mes y proveedores centralizados para tomar decisiones con números reales, no a ojo.',
  },
];

const PLANS = [
  {
    key: 'BASE',
    name: 'Base',
    tagline: 'Para arrancar a ordenar el kiosco',
    features: [
      { label: 'Registrar venta', on: true },
      { label: 'Stock con catálogo global pre-cargado', on: true },
      { label: 'Caja (apertura y cierre)', on: true },
      { label: 'Historial de ventas', on: false },
      { label: 'Gastos y resultados del mes', on: false },
      { label: 'Proveedores', on: false },
      { label: 'Clientes y puntos', on: false },
    ],
    featured: false,
  },
  {
    key: 'INTERMEDIO',
    name: 'Intermedio',
    tagline: 'Para gestionar el negocio de punta a punta',
    features: [
      { label: 'Todo lo del plan Base', on: true },
      { label: 'Historial de ventas', on: true },
      { label: 'Gastos y resultados del mes', on: true },
      { label: 'Proveedores', on: true },
      { label: 'Facturación (en desarrollo)', on: true },
      { label: 'Clientes y puntos', on: false },
    ],
    featured: true,
  },
  {
    key: 'PREMIUM',
    name: 'Premium',
    tagline: 'Para fidelizar y crecer',
    features: [
      { label: 'Todo lo del plan Intermedio', on: true },
      { label: 'Clientes y puntos', on: true },
      { label: 'Impresión de etiquetas con código de barra', on: true },
      { label: 'Soporte prioritario', on: true },
    ],
    featured: false,
  },
];

/* ---------------- Page ---------------- */
export default function LandingPage() {
  // Los precios se cargan en el panel admin → Configuración. Sin precio
  // cargado (o si la API no responde), el plan sigue en "Próximamente".
  const { data: settings } = usePublicSettings();
  const planPrices = settings?.planPrices || {};
  const hasAnyPrice = PLANS.some((plan) => planPrices[plan.key] != null);

  return (
    <div className="landing font-sans text-slate-800">
      {/* NAV */}
      <header className="sticky top-0 z-30 backdrop-blur bg-white/80 border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <Logo className="h-7" />
          <nav className="hidden md:flex items-center gap-7 text-sm font-600 text-slate-500">
            <a href="#como-funciona" className="hover:text-slate-800 transition">Cómo funciona</a>
            <a href="#producto" className="hover:text-slate-800 transition">Producto</a>
            <a href="#planes" className="hover:text-slate-800 transition">Planes</a>
          </nav>
          <Link
            to="/login"
            className="text-sm font-700 text-white rounded-lg px-4 py-2 transition hover:opacity-90"
            style={{ background: '#1c2050' }}
          >
            Ingresar
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #1c2050 0%, #14173b 100%)' }}>
        <div className="lp-hero-grid absolute inset-0 opacity-40" />
        <ParallaxBackdrop />
        <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-28 grid md:grid-cols-2 gap-14 items-center">
          <div>
            <span className="lp-badge-pulse inline-flex items-center gap-2 text-xs font-700 text-white bg-white/10 border border-white/15 rounded-full px-3 py-1.5 mb-6">
              <Sparkles size={13} style={{ color: '#4caf82' }} /> Beta abierta — sumate ahora
            </span>
            <h1 className="text-4xl md:text-5xl font-800 text-white leading-tight mb-5">
              El kiosco, ordenado <span style={{ color: '#4caf82' }}>de punta a punta</span>.
            </h1>
            <p className="text-slate-300 text-lg mb-8 max-w-md">
              Ventas, stock y caja en un solo lugar, con un catálogo de productos ya cargado para que arranques a vender el mismo día.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <a
                href="#planes"
                className="inline-flex items-center gap-2 text-white font-700 rounded-xl px-6 py-3.5 transition hover:opacity-90"
                style={{ background: '#4caf82' }}
              >
                Ver planes <ArrowRight size={16} />
              </a>
              <a href="#producto" className="text-slate-200 font-600 hover:text-white transition">
                Ver cómo funciona ↓
              </a>
            </div>
            <div className="flex items-center gap-6 mt-10 text-slate-400 text-xs">
              <div className="flex items-center gap-2"><ShieldCheck size={15} style={{ color: '#4caf82' }} /> Datos por kiosco, aislados</div>
              <div className="flex items-center gap-2"><TrendingUp size={15} style={{ color: '#4caf82' }} /> Catálogo global +4200 productos</div>
            </div>
          </div>
          <div>
            <AppSimulation />
            <div className="text-center text-[11px] text-slate-400 mt-3">
              Recreación ilustrativa de la interfaz, similar al uso real — no es una grabación de la app.
            </div>
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="py-24 bg-white relative">
        <div className="max-w-6xl mx-auto px-6">
          <Reveal className="max-w-xl mb-16">
            <div className="text-sm font-700 mb-2" style={{ color: '#4caf82' }}>CÓMO FUNCIONA</div>
            <h2 className="text-3xl md:text-4xl font-800 text-slate-900">De la venta al resultado del mes, sin planillas sueltas</h2>
          </Reveal>
          <div className="grid md:grid-cols-2 gap-8">
            {STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i * 90} className="flex gap-5 p-6 rounded-2xl border border-slate-100 hover:border-slate-200 transition">
                <div className="flex-shrink-0">
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ background: '#e8f8ee' }}
                  >
                    <step.icon size={20} style={{ color: '#2e7d32' }} />
                  </div>
                </div>
                <div>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="lp-step-num text-xs font-800 text-slate-300">0{i + 1}</span>
                    <h3 className="font-800 text-slate-900">{step.title}</h3>
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed">{step.desc}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* PRODUCTO / POR DENTRO */}
      <section id="producto" className="py-24 relative overflow-hidden" style={{ background: '#f5f6fa' }}>
        <div className="max-w-6xl mx-auto px-6">
          <Reveal className="max-w-xl mb-14">
            <div className="text-sm font-700 mb-2" style={{ color: '#4caf82' }}>ASÍ ES POR DENTRO</div>
            <h2 className="text-3xl md:text-4xl font-800 text-slate-900">Recorré cada sección de la app</h2>
            <p className="text-slate-500 mt-3">
              Una recreación simplificada de la interfaz, similar al uso real, con las funcionalidades de cada sección. No son capturas de pantalla reales.
            </p>
          </Reveal>

          <Reveal>
            <SectionCarousel />
          </Reveal>
        </div>
      </section>

      {/* PLANES */}
      <section id="planes" className="py-24 bg-white">
        <div className="max-w-6xl mx-auto px-6">
          <Reveal className="max-w-xl mb-14 mx-auto text-center md:mx-0 md:text-left">
            <div className="text-sm font-700 mb-2" style={{ color: '#4caf82' }}>PLANES</div>
            <h2 className="text-3xl md:text-4xl font-800 text-slate-900">Elegí el plan según cómo crece tu kiosco</h2>
            <p className="text-slate-500 mt-3">
              {hasAnyPrice
                ? 'Suscripción mensual por kiosco, con todas sus sucursales.'
                : 'Los precios se están definiendo durante la beta. Por ahora, sumate y asegurate condiciones preferenciales de lanzamiento.'}
            </p>
          </Reveal>

          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan, i) => (
              <Reveal key={plan.key} delay={i * 100}>
                <PlanCard plan={plan} price={planPrices[plan.key]} joinLink={buildJoinLink(settings?.whatsappNumber, plan.name)} />
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="relative py-24 overflow-hidden" style={{ background: 'linear-gradient(135deg, #1c2050, #14173b)' }}>
        <ParallaxBackdrop />
        <div className="relative max-w-3xl mx-auto px-6 text-center">
          <Reveal>
            <h2 className="text-3xl md:text-4xl font-800 text-white mb-4">Sumate a la beta de Vexko</h2>
            <p className="text-slate-300 mb-8">Estamos afinando la app junto a los primeros kioscos que la usan todos los días. Escribinos y te damos acceso.</p>
            <a
              {...buildJoinLink(settings?.whatsappNumber)}
              className="inline-flex items-center gap-2 text-white font-700 rounded-xl px-7 py-3.5 transition hover:opacity-90"
              style={{ background: '#4caf82' }}
            >
              Quiero sumarme <ArrowRight size={16} />
            </a>
          </Reveal>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="py-10 bg-white border-t border-slate-100">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <Logo className="h-6 opacity-70" />
          <div className="text-xs text-slate-400 text-center sm:text-right">
            <div>Versión beta — 2026. Sistema de gestión para kioscos.</div>
            <div className="mt-1">
              Desarrollado por{' '}
              <a
                href="https://www.grupovexus.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-700 hover:underline"
                style={{ color: '#1c2050' }}
              >
                Grupo Vexus
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function PlanCard({ plan, price, joinLink }) {
  const featured = plan.featured;
  const formattedPrice = formatPlanPrice(price);
  return (
    <div
      className={`lp-plan-card rounded-2xl p-7 h-full flex flex-col ${featured ? 'lp-plan-featured' : 'border border-slate-100'}`}
    >
      {featured && (
        <span
          className="self-start text-[10px] font-800 tracking-wide uppercase rounded-full px-2.5 py-1 mb-4"
          style={{ background: '#4caf82', color: '#fff' }}
        >
          Más elegido
        </span>
      )}
      <div className={`font-800 text-lg mb-1 ${featured ? 'text-white' : 'text-slate-900'}`}>{plan.name}</div>
      <div className={`text-sm mb-5 ${featured ? 'text-slate-300' : 'text-slate-500'}`}>{plan.tagline}</div>
      <div className={`text-2xl font-800 mb-6 ${featured ? 'text-white' : 'text-slate-900'}`}>
        {formattedPrice ? (
          <>
            {formattedPrice}
            <span className={`text-sm font-600 ml-1 ${featured ? 'text-slate-300' : 'text-slate-500'}`}>/ mes</span>
            <div className="text-xs font-500 mt-1 text-slate-400">por kiosco</div>
          </>
        ) : (
          <>
            Próximamente
            <div className="text-xs font-500 mt-1 text-slate-400">precio en definición</div>
          </>
        )}
      </div>
      <div className="flex flex-col gap-3 mb-8 flex-1">
        {plan.features.map((f) => (
          <div key={f.label} className="flex items-center gap-2.5 text-sm">
            {f.on ? (
              <Check size={15} style={{ color: featured ? '#4caf82' : '#2e7d32' }} />
            ) : (
              <Minus size={15} className={featured ? 'text-slate-500' : 'text-slate-300'} />
            )}
            <span className={f.on ? (featured ? 'text-slate-100' : 'text-slate-700') : (featured ? 'text-slate-500' : 'text-slate-400')}>
              {f.label}
            </span>
          </div>
        ))}
      </div>
      <a
        {...joinLink}
        className={`text-center font-700 rounded-lg py-2.5 transition ${
          featured ? 'text-slate-900 hover:opacity-90' : 'border hover:bg-slate-50'
        }`}
        style={featured ? { background: '#fff' } : { borderColor: '#1c2050', color: '#1c2050' }}
      >
        Sumarme a la beta
      </a>
    </div>
  );
}
