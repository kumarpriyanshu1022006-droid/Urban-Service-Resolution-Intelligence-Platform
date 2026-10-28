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

function CustomTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    return (
      <div className="bg-white border border-[#DCDDD4] p-3 rounded-md shadow-md text-xs font-sans">
        <p className="font-semibold text-[#252C29] mb-1">{item.category}</p>
        <p className="text-[#254A40] font-medium">
          Median Resolution: <span className="tabular-nums font-bold">{item.medianDays} days</span>
        </p>
        <p className="text-[#68716A]">
          Average Turnaround: <span className="tabular-nums">{item.avgHours} hours</span>
        </p>
        <p className="text-[#68716A]">
          Historical Volume: <span className="tabular-nums">{item.requests.toLocaleString()} requests</span>
        </p>
      </div>
    );
  }
  return null;
}

export default function CategoryWorkloadChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-[#68716A]">
        No category workload data available.
      </div>
    );
  }


  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 10, right: 20, left: 20, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#ECEAE2" />
          <XAxis
            type="number"
            tick={{ fill: '#68716A', fontSize: 11 }}
            axisLine={{ stroke: '#DCDDD4' }}
            tickLine={false}
            unit=" d"
          />
          <YAxis
            type="category"
            dataKey="category"
            tick={{ fill: '#252C29', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={120}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(37, 74, 64, 0.04)' }} />
          <Bar dataKey="medianDays" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => {
              // Highlight long turnaround categories with secondary terracotta
              const color = entry.medianDays > 3 ? '#A85D3B' : '#254A40';
              return <Cell key={`cell-${index}`} fill={color} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
