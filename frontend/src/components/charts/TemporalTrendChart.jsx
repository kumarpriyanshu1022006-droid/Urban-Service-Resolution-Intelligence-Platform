import React from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend
} from 'recharts';

function CustomTooltip({ active, payload, label }) {
  if (active && payload && payload.length) {
    const item = payload[0].payload;
    return (
      <div className="bg-white border border-[#DCDDD4] p-3 rounded-md shadow-md text-xs font-sans">
        <p className="font-semibold text-[#252C29] mb-1">{label}</p>
        <p className="text-[#254A40] font-medium">
          Service Requests: <span className="tabular-nums font-bold">{item.requests.toLocaleString()}</span>
        </p>
        <p className="text-[#A85D3B] font-medium">
          Avg Duration: <span className="tabular-nums font-bold">{item.avgResolutionHours} hrs</span>
        </p>
      </div>
    );
  }
  return null;
}

export default function TemporalTrendChart({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="h-64 flex items-center justify-center text-xs text-[#68716A]">
        No temporal trend data available.
      </div>
    );
  }


  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={data}
          margin={{ top: 10, right: 10, left: -10, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ECEAE2" />
          <XAxis
            dataKey="day"
            tick={{ fill: '#68716A', fontSize: 11 }}
            axisLine={{ stroke: '#DCDDD4' }}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: '#68716A', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: '#A85D3B', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            unit="h"
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            verticalAlign="top"
            height={36}
            formatter={(value) => (
              <span className="text-xs text-[#252C29] font-medium">
                {value === 'requests' ? 'Incoming Requests' : 'Avg Resolution Time (Hours)'}
              </span>
            )}
          />
          <Bar
            yAxisId="left"
            dataKey="requests"
            fill="#254A40"
            radius={[4, 4, 0, 0]}
            barSize={24}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="avgResolutionHours"
            stroke="#A85D3B"
            strokeWidth={2.5}
            dot={{ r: 3.5, fill: '#A85D3B', strokeWidth: 1.5, stroke: '#FFFFFF' }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
