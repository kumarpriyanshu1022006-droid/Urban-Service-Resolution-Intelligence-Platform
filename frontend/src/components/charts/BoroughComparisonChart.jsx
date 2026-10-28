import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    return (
      <div className="bg-white border border-[#DCDDD4] p-3 rounded-md shadow-md text-xs font-sans">
        <p className="font-semibold text-[#252C29] mb-1">{label}</p>
        <p className="text-[#254A40] font-medium">
          Median Resolution: <span className="tabular-nums font-bold">{item.medianDays} days</span>
        </p>
        <p className="text-[#68716A]">
          Total Volume: <span className="tabular-nums">{item.total.toLocaleString()} requests</span>
        </p>
        <p className="text-[#A85D3B]">
          Pending Review: <span className="tabular-nums font-medium">{item.reviewNeeded} items</span>
        </p>
      </div>
    );
  }
  return null;
}

export default function BoroughComparisonChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-[#68716A]">
        No borough comparison data available.
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
            dataKey="borough"
            tick={{ fill: '#68716A', fontSize: 10 }}
            axisLine={{ stroke: '#DCDDD4' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#68716A', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            unit=" d"
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(37, 74, 64, 0.04)' }} />
          <Bar dataKey="medianDays" fill="#254A40" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
