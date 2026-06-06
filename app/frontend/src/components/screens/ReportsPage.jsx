import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PageHeader, fmt } from '../ui/index.jsx';
import { api } from '../../lib/api.js';

function monthParamsFor(date) {
  return { month: date.getMonth() + 1, year: date.getFullYear() };
}

function pct(curr, prev) {
  if (!prev || prev === 0) return prev === 0 && curr === 0 ? '0%' : '—';
  const p = ((curr - prev) / prev) * 100;
  const rounded = Math.round(p * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

function trendClass(curr, prev) {
  if (!prev || prev === 0) return 'text-gray-600';
  return curr >= prev ? 'text-green-600' : 'text-red-600';
}

export default function ReportsPage() {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const thisMonth = monthParamsFor(selectedDate);
  const prevDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1);
  const prevMonth = monthParamsFor(prevDate);

  const thisQ = useQuery({
    queryKey: ['reports', 'monthly', thisMonth.month, thisMonth.year],
    queryFn: () => api.get('/reports/monthly', { params: thisMonth }).then((r) => r.data),
  });

  const prevQ = useQuery({
    queryKey: ['reports', 'monthly', prevMonth.month, prevMonth.year],
    queryFn: () => api.get('/reports/monthly', { params: prevMonth }).then((r) => r.data),
  });

  const loading = thisQ.isLoading || prevQ.isLoading;
  const data = thisQ.data || {};
  const prevData = prevQ.data || {};

  const topProducts = data.topProducts || [];
  const maxTopQty = topProducts.length ? Math.max(...topProducts.map((p) => p.qty || 0)) : 1;

  const netCurrent = (data.grossProfit || 0) - (data.expenses || 0);
  const netPrev = (prevData.grossProfit || 0) - (prevData.expenses || 0);

  // helpers to navigate months
  function prevMonthClick() {
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() - 1, 1));
  }
  function nextMonthClick() {
    setSelectedDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 1));
  }

  if (loading) return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <PageHeader title="Resultados del mes" subtitle="Comparativa mes actual / mes anterior" />
      <div className="p-6">Cargando resultados...</div>
    </div>
  );

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <PageHeader title="Resultados del mes" subtitle="Comparativa mes actual / mes anterior" />

      <div className="p-6 space-y-6" style={{minHeight: 'calc(100vh - 120px)'}}>
        {/* Month selector */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={prevMonthClick} className="btn-outline">‹</button>
            <div className="rounded-full bg-gray-100 px-3 py-1 text-sm">{new Date(thisMonth.year, thisMonth.month-1).toLocaleString(undefined,{month:'long', year:'numeric'})}</div>
            <button onClick={nextMonthClick} className="btn-outline">›</button>
          </div>
        </div>

        {/* Top semaphores */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl shadow p-4 flex items-center gap-4">
            <div style={{width:12,height:12,background: ( (data.revenue||0) - (data.cogs||0) >= (data.expenses||0) ) ? '#2ecc71' : '#e74c3c',borderRadius:8}}></div>
            <div>
              <div className="text-xs text-gray-500">¿Cubrís los gastos del local?</div>
              <div className="text-sm font-semibold">{ (data.revenue||0) - (data.cogs||0) >= (data.expenses||0) ? 'Sí, este mes ganaste plata' : 'No, estás por debajo de los gastos' }</div>
              <div className="text-xs text-gray-400">Ganancia neta: {fmt(netCurrent)}</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow p-4 flex items-center gap-4">
            <div style={{width:12,height:12,background: (data.grossMargin||0) >= 25 ? '#f6c243' : '#ff6b6b',borderRadius:8}}></div>
            <div>
              <div className="text-xs text-gray-500">¿Tu margen es suficiente?</div>
              <div className="text-sm font-semibold">{ (data.grossMargin||0) >= 25 ? 'Margen OK' : 'Margen justo — hay que mejorar' }</div>
              <div className="text-xs text-gray-400">Margen actual: {Math.round((data.grossMargin||0))}%</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow p-4 flex items-center gap-4">
            <div style={{width:12,height:12,background: (data.revenue||0) >= (prevData.revenue||0) ? '#2ecc71' : '#e74c3c',borderRadius:8}}></div>
            <div>
              <div className="text-xs text-gray-500">¿Vendés más que el mes pasado?</div>
              <div className="text-sm font-semibold">{ (data.revenue||0) >= (prevData.revenue||0) ? 'Sí, vendés más que el mes pasado' : 'No, vendés menos que el mes pasado' }</div>
              <div className="text-xs text-gray-400">{fmt(data.revenue || 0)} vs {fmt(prevData.revenue || 0)} ({pct(data.revenue||0, prevData.revenue||0)})</div>
            </div>
          </div>
        </div>

        {/* Banner */}
        <div className="bg-white rounded-2xl shadow p-4">
          <div className="text-sm text-gray-500">Para cubrir todos los gastos del local necesitás vender</div>
          <div className="text-lg font-semibold mt-2">{fmt((data.expenses||0) + (data.cogs||0))} este mes</div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl shadow p-6">
            <div className="text-sm text-gray-500">Total que vendiste</div>
            <div className="text-3xl lg:text-4xl font-extrabold mt-2">{fmt(data.revenue || 0)}</div>
            <div className={`text-sm mt-2 ${trendClass(data.revenue, prevData.revenue)}`}>{data.revenue || prevData.revenue ? pct(data.revenue || 0, prevData.revenue || 0) : ''} vs mes anterior</div>
          </div>

          <div className="bg-white rounded-2xl shadow p-6">
            <div className="text-sm text-gray-600">Lo que te queda después de la mercadería</div>
            <div className="text-2xl font-700">{fmt((data.revenue || 0) - (data.cogs || 0))}</div>
            <div className={`text-sm ${trendClass((data.revenue || 0) - (data.cogs || 0), (prevData.revenue || 0) - (prevData.cogs || 0))}`}>{pct((data.revenue || 0) - (data.cogs || 0), (prevData.revenue || 0) - (prevData.cogs || 0))}</div>
          </div>

          <div className="bg-white rounded-2xl shadow p-6">
            <div className="text-sm text-gray-500">Gastos del local</div>
            <div className="text-3xl lg:text-4xl font-extrabold mt-2 text-red-600">{fmt(data.expenses || 0)}</div>
            <div className={`text-sm mt-2 ${trendClass(data.expenses || 0, prevData.expenses || 0)}`}>{pct(data.expenses || 0, prevData.expenses || 0)}</div>
          </div>
        </div>

        {/* Prominent Net Profit Banner */}
        <div style={{background:'#0b1a3a',color:'#fff',borderRadius:14,padding:'22px 26px',boxShadow:'0 6px 18px rgba(11,26,58,0.12)'}} className="flex items-center justify-between">
          <div>
            <div style={{fontSize:12,letterSpacing:1,fontWeight:800,opacity:0.9}}>LO QUE REALMENTE GANASTE ESTE MES</div>
            <div style={{fontSize:34,fontWeight:900,marginTop:8}}>{fmt(netCurrent)}</div>
          </div>
          <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end'}}>
            <div style={{background: netPrev===0 ? '#6b7280' : netCurrent>=netPrev ? '#16a34a' : '#ef4444', color:'#fff', padding:'6px 12px', borderRadius:999, fontWeight:800}}>{pct(netCurrent, netPrev)}</div>
            <div style={{fontSize:12,opacity:0.8,marginTop:6}}>{netCurrent >= (data.expenses||0) ? 'Ya cubriste los gastos' : 'Falta cubrir gastos'}</div>
          </div>
        </div>

        {/* Detail and lists */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl shadow lg:col-span-2">
            <div className="p-4 border-b"><h3 className="card-title">Detalle y comparativa</h3></div>
            <div className="p-6">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm text-gray-600">Resultado del mes — {new Date(data.period?.year || selectedDate.getFullYear(), (data.period?.month || selectedDate.getMonth()+1)-1).toLocaleString(undefined, { month: 'long', year: 'numeric' })}</div>
                  <div className="text-sm text-gray-500">{data.salesCount || 0} ventas · Ticket ${data.avgTicket || 0}</div>
                </div>

                <table className="w-full mb-4">
                  <thead>
                    <tr>
                      <th className="th">Métrica</th>
                      <th className="th">Mes anterior</th>
                      <th className="th">Mes actual</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="td">Ventas totales</td>
                      <td className="td">{fmt(prevData.revenue || 0)}</td>
                      <td className="td">{fmt(data.revenue || 0)} <span className={`${trendClass(data.revenue || 0, prevData.revenue || 0)} ml-2`}>{pct(data.revenue || 0, prevData.revenue || 0)}</span></td>
                    </tr>
                    <tr>
                      <td className="td">Costo de la mercadería (COGS)</td>
                      <td className="td">{fmt(prevData.cogs || 0)}</td>
                      <td className="td">{fmt(data.cogs || 0)}</td>
                    </tr>
                    <tr>
                      <td className="td">Gastos del local</td>
                      <td className="td">{fmt((prevData.expenseBreakdown || []).reduce((s,f)=>s+ (f.amount?parseFloat(f.amount):0),0) || 0)}</td>
                      <td className="td">{fmt((data.expenseBreakdown || []).reduce((s,f)=>s+ (f.amount?parseFloat(f.amount):0),0) || 0)}</td>
                    </tr>
                    <tr>
                      <td className="td">Lo que realmente ganaste</td>
                      <td className="td">{fmt((prevData.grossProfit || 0) - (prevData.expenses || 0))}</td>
                      <td className="td">{fmt(netCurrent)} <span className={`${trendClass(netCurrent, netPrev)} ml-2`}>{pct(netCurrent, netPrev)}</span></td>
                    </tr>
                    <tr>
                      <td className="td">Margen bruto</td>
                      <td className="td">{prevData.grossMargin ? `${prevData.grossMargin}%` : '-'}</td>
                      <td className="td">{data.grossMargin ? `${data.grossMargin}%` : '-'}</td>
                    </tr>
                    <tr>
                      <td className="td">Ticket promedio</td>
                      <td className="td">{fmt(prevData.avgTicket || 0)}</td>
                      <td className="td">{fmt(data.avgTicket || 0)}</td>
                    </tr>
                  </tbody>
                </table>

                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-sm text-gray-600">Efectivo</div>
                    <div className="text-xl font-bold mt-1">{fmt(data.cashSales || 0)}</div>
                    <div className={`${trendClass(data.cashSales || 0, prevData.cashSales || 0)} text-sm mt-1`}>{pct(data.cashSales || 0, prevData.cashSales || 0)}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-sm text-gray-600">Transferencias</div>
                    <div className="text-xl font-bold mt-1">{fmt(data.transferSales || 0)}</div>
                    <div className={`${trendClass(data.transferSales || 0, prevData.transferSales || 0)} text-sm mt-1`}>{pct(data.transferSales || 0, prevData.transferSales || 0)}</div>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3 text-center">
                    <div className="text-sm text-gray-600">Tarjeta</div>
                    <div className="text-xl font-bold mt-1">{fmt(data.cardSales || 0)}</div>
                    <div className={`${trendClass(data.cardSales || 0, prevData.cardSales || 0)} text-sm mt-1`}>{pct(data.cardSales || 0, prevData.cardSales || 0)}</div>
                  </div>
                </div>

              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow">
            <div className="p-4 border-b"><h3 className="card-title">Productos más vendidos del mes</h3></div>
            <div className="p-4">
              <div className="space-y-4">
                {topProducts.map((p, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="text-sm text-gray-600 w-6 text-right">{idx+1}.</div>
                      <div className="text-sm">{p.name}</div>
                    </div>
                    <div className="flex-1 mx-4">
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-2 bg-green-400 rounded-full" style={{width: `${Math.round(((p.qty||0)/maxTopQty)*100)}%`}}></div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-600">{p.qty} u</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
