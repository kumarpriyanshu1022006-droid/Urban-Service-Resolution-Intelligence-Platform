import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell
} from 'recharts';

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    return (
      <div className="bg-white border border-[#DCDDD4] p-3 rounded-md shadow-md text-xs font-sans">
        <p className="font-semibold text-[#252C29] mb-1">{label}</p>
        <p className="text-[#254A40] font-medium">
          Complaints: <span className="tabular-nums font-bold">{item.count.toLocaleString()}</span>
        </p>
        <p className="text-[#68716A]">
          Share: <span className="tabular-nums">{item.percentage}% of closed requests</span>
        </p>
      </div>
    );
  }
  return null;
}

export default function ResolutionDistributionChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-[#68716A]">
        No resolution distribution data available.
      </div>
    );
  }


  return (
    <div className="w-full h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 10, right: 10, left: -15, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ECEAE2" />
          <XAxis
            dataKey="range"
            tick={{ fill: '#68716A', fontSize: 11 }}
            axisLine={{ stroke: '#DCDDD4' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#68716A', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => `${value}`}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(37, 74, 64, 0.04)' }} />
          <Bar dataKey="count" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => {
              // Highlight long duration buckets with warm secondary accent
              const color = index >= 4 ? '#A85D3B' : '#254A40';
              return <Cell key={`cell-${index}`} fill={color} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
