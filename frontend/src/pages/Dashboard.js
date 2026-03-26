import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { 
  GraduationCap, Users, Briefcase, Calendar, MessageSquare, 
  Bell, LogOut, User, Home, BookOpen, Award, Search, UserCheck
} from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    connections: 0,
    pending_requests: 0,
    mentorships: 0,
    applications: 0,
    posts: 0,
    events: 0
  });
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [analyticsRes, notificationsRes, unreadRes] = await Promise.all([
        axios.get(`${API}/analytics/dashboard`),
        axios.get(`${API}/notifications?limit=5`),
        axios.get(`${API}/notifications/unread/count`)
      ]);
      
      setStats(analyticsRes.data);
      setNotifications(notificationsRes.data);
      setUnreadCount(unreadRes.data.count);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Navigation */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center gap-8">
              <div 
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-3 cursor-pointer"
              >
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-white" />
                </div>
                <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  CAMPUS-BRIDGE
                </span>
              </div>

              {/* Navigation Links */}
              <div className="hidden md:flex items-center gap-1">
                <button
                  onClick={() => navigate('/dashboard')}
                  className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  Dashboard
                </button>
                <button
                  onClick={() => navigate('/search')}
                  className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  Network
                </button>
                <button
                  onClick={() => navigate('/jobs')}
                  className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  Jobs
                </button>
                <button
                  onClick={() => navigate('/feed')}
                  className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  Feed
                </button>
                <button
                  onClick={() => navigate('/events')}
                  className="px-3 py-2 text-sm font-medium text-gray-700 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  Events
                </button>
              </div>
            </div>

            {/* Right Side */}
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="p-2 hover:bg-gray-100 rounded-lg relative"
              >
                <Bell className="w-5 h-5 text-gray-600" />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full text-xs text-white flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-800">{user?.full_name}</p>
                  <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
                </div>
                <div 
                  onClick={() => navigate(`/profile/${user?.id}`)}
                  className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white font-semibold cursor-pointer hover:shadow-lg transition-shadow"
                >
                  {user?.full_name?.charAt(0)}
                </div>
              </div>
              <button 
                onClick={handleLogout}
                className="p-2 hover:bg-red-50 rounded-lg text-red-600"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Notifications Dropdown */}
        {showNotifications && (
          <div className="absolute right-4 top-16 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-800">Notifications</h3>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">
                  No notifications
                </div>
              ) : (
                notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`p-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${!notif.is_read ? 'bg-blue-50' : ''}`}
                  >
                    <p className="text-sm font-medium text-gray-800">{notif.title}</p>
                    <p className="text-xs text-gray-600 mt-1">{notif.message}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-white mb-8">
          <h1 className="text-3xl font-bold mb-2">
            Welcome back, {user?.full_name}! 👋
          </h1>
          <p className="text-blue-100">
            {user?.role === 'student' && "Connect with alumni, explore opportunities, and grow your network"}
            {user?.role === 'alumni' && "Mentor students, share opportunities, and give back to your community"}
            {user?.role === 'admin' && "Manage the platform and support your community"}
          </p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div 
            onClick={() => navigate('/connections')}
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <span className="text-2xl font-bold text-gray-800">{stats.connections}</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">Connections</p>
            {stats.pending_requests > 0 && (
              <p className="text-xs text-blue-600 mt-1">{stats.pending_requests} pending</p>
            )}
          </div>

          <div 
            onClick={() => navigate('/mentorships')}
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <UserCheck className="w-6 h-6 text-purple-600" />
              </div>
              <span className="text-2xl font-bold text-gray-800">{stats.mentorships}</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">Mentorships</p>
          </div>

          <div 
            onClick={() => navigate('/applications')}
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-pink-100 rounded-lg flex items-center justify-center">
                <Briefcase className="w-6 h-6 text-pink-600" />
              </div>
              <span className="text-2xl font-bold text-gray-800">{stats.applications}</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">Applications</p>
          </div>

          <div 
            onClick={() => navigate('/events')}
            className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 cursor-pointer hover:shadow-md transition-shadow"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-6 h-6 text-green-600" />
              </div>
              <span className="text-2xl font-bold text-gray-800">{stats.events}</span>
            </div>
            <p className="text-sm text-gray-600 font-medium">My Events</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-8">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Quick Actions</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <button 
              onClick={() => navigate('/search')}
              className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-all group"
            >
              <Users className="w-8 h-8 text-gray-400 group-hover:text-blue-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-600 group-hover:text-blue-600">Find Alumni</p>
            </button>
            
            <button 
              onClick={() => navigate('/jobs')}
              className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all group"
            >
              <Briefcase className="w-8 h-8 text-gray-400 group-hover:text-purple-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-600 group-hover:text-purple-600">Browse Jobs</p>
            </button>
            
            <button 
              onClick={() => navigate('/feed')}
              className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-pink-500 hover:bg-pink-50 transition-all group"
            >
              <BookOpen className="w-8 h-8 text-gray-400 group-hover:text-pink-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-600 group-hover:text-pink-600">Community Feed</p>
            </button>
            
            <button 
              onClick={() => navigate('/find-mentors')}
              className="p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-all group"
            >
              <Calendar className="w-8 h-8 text-gray-400 group-hover:text-green-600 mx-auto mb-2" />
              <p className="text-sm font-medium text-gray-600 group-hover:text-green-600">Find Mentors</p>
            </button>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Recent Activity</h2>
          <div className="text-center py-12">
            <Award className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">No recent activity yet</p>
            <p className="text-sm text-gray-400 mt-2">Start connecting and exploring to see updates here!</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
