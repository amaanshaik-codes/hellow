'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

export default function AdminDashboard({ isVisible, onClose }) {
  const [metrics, setMetrics] = useState({});
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const intervalRef = useRef();

  useEffect(() => {
    if (isVisible) {
      fetchMetrics();
      intervalRef.current = setInterval(fetchMetrics, 5000);
    } else {
      clearInterval(intervalRef.current);
    }

    return () => clearInterval(intervalRef.current);
  }, [isVisible]);

  const fetchMetrics = async () => {
    try {
      const response = await fetch('/api/admin/metrics');
      const data = await response.json();
      setMetrics(data);
    } catch (error) {
      console.error('Failed to fetch metrics:', error);
    }
  };

  const fetchLogs = async () => {
    try {
      const response = await fetch('/api/admin/logs');
      const data = await response.json();
      setLogs(data.logs || []);
    } catch (error) {
      console.error('Failed to fetch logs:', error);
    }
  };

  if (!isVisible) return null;

  return (
    <motion.div
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-11/12 max-w-4xl h-5/6 overflow-hidden"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
      >
        {/* Header */}
        <div className="bg-blue-600 text-white p-4 flex justify-between items-center">
          <h2 className="text-xl font-bold">Admin Dashboard</h2>
          <button onClick={onClose} className="text-white hover:text-gray-200">
            ✕
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          {['overview', 'performance', 'errors', 'users'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-medium capitalize ${
                activeTab === tab
                  ? 'border-b-2 border-blue-500 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <MetricCard
                title="Active Users"
                value={metrics.activeUsers || 0}
                change="+12%"
                color="green"
              />
              <MetricCard
                title="Messages/Hour"
                value={metrics.messagesPerHour || 0}
                change="+5%"
                color="blue"
              />
              <MetricCard
                title="Avg Latency"
                value={`${metrics.avgLatency || 0}ms`}
                change="-8%"
                color="purple"
              />
              <MetricCard
                title="Error Rate"
                value={`${metrics.errorRate || 0}%`}
                change="-2%"
                color="red"
              />
              <MetricCard
                title="Storage Used"
                value={metrics.storageUsed || '0MB'}
                change="+15%"
                color="orange"
              />
              <MetricCard
                title="Uptime"
                value={metrics.uptime || '99.9%'}
                change="0%"
                color="green"
              />
            </div>
          )}

          {activeTab === 'performance' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Performance Metrics</h3>
              <div className="space-y-4">
                <PerformanceChart data={metrics.latencyTrend} title="Latency Trend" />
                <PerformanceChart data={metrics.messageTrend} title="Message Volume" />
              </div>
            </div>
          )}

          {activeTab === 'errors' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Recent Errors</h3>
              <button
                onClick={fetchLogs}
                className="mb-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
              >
                Refresh Logs
              </button>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {logs.map((log, index) => (
                  <div
                    key={index}
                    className={`p-3 rounded border-l-4 ${
                      log.level === 'error'
                        ? 'border-red-500 bg-red-50'
                        : log.level === 'warn'
                        ? 'border-yellow-500 bg-yellow-50'
                        : 'border-blue-500 bg-blue-50'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span className="font-medium">{log.message}</span>
                      <span className="text-sm text-gray-500">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                    {log.details && (
                      <pre className="text-xs mt-2 text-gray-600 overflow-x-auto">
                        {JSON.stringify(log.details, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'users' && (
            <div>
              <h3 className="text-lg font-semibold mb-4">User Activity</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full table-auto">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="px-4 py-2 text-left">User</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Last Active</th>
                      <th className="px-4 py-2 text-left">Messages</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(metrics.users || []).map((user, index) => (
                      <tr key={index} className="border-b">
                        <td className="px-4 py-2">{user.username}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`px-2 py-1 rounded text-sm ${
                              user.isOnline
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {user.isOnline ? 'Online' : 'Offline'}
                          </span>
                        </td>
                        <td className="px-4 py-2">
                          {new Date(user.lastActive).toLocaleString()}
                        </td>
                        <td className="px-4 py-2">{user.messageCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function MetricCard({ title, value, change, color }) {
  const colorClasses = {
    green: 'border-green-500 text-green-600',
    blue: 'border-blue-500 text-blue-600',
    purple: 'border-purple-500 text-purple-600',
    red: 'border-red-500 text-red-600',
    orange: 'border-orange-500 text-orange-600'
  };

  return (
    <div className={`border-l-4 ${colorClasses[color]} bg-white p-4 rounded shadow`}>
      <h4 className="text-sm font-medium text-gray-500">{title}</h4>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className={`text-sm ${change.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
        {change} from last hour
      </p>
    </div>
  );
}

function PerformanceChart({ data, title }) {
  // Simplified chart component - in production, use a proper charting library
  return (
    <div className="bg-white p-4 rounded shadow">
      <h4 className="font-medium mb-2">{title}</h4>
      <div className="h-32 bg-gray-100 rounded flex items-end justify-between p-2">
        {(data || []).map((value, index) => (
          <div
            key={index}
            className="bg-blue-500 w-4 rounded-t"
            style={{ height: `${(value / Math.max(...data)) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}
