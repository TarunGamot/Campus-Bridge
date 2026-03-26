import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { Users, UserCheck, Clock, UserX, GraduationCap, Briefcase, Heart, Home } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Connections = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('connected');
  const [connections, setConnections] = useState([]);
  const [receivedRequests, setReceivedRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [connRes, receivedRes, sentRes, suggestionsRes] = await Promise.all([
        axios.get(`${API}/connections?status=accepted`),
        axios.get(`${API}/connections/requests/received`),
        axios.get(`${API}/connections/requests/sent`),
        axios.get(`${API}/connections/suggestions`)
      ]);
      
      setConnections(connRes.data);
      setReceivedRequests(receivedRes.data);
      setSentRequests(sentRes.data);
      setSuggestions(suggestionsRes.data);
    } catch (err) {
      console.error('Failed to load connections:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (connectionId) => {
    try {
      await axios.put(`${API}/connections/${connectionId}/accept`);
      loadData();
    } catch (err) {
      alert('Failed to accept request');
    }
  };

  const handleReject = async (connectionId) => {
    try {
      await axios.put(`${API}/connections/${connectionId}/reject`);
      loadData();
    } catch (err) {
      alert('Failed to reject request');
    }
  };

  const handleSendRequest = async (userId) => {
    try {
      await axios.post(`${API}/connections/request`, {
        receiver_id: userId,
        message: "Hi! I'd like to connect with you."
      });
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to send request');
    }
  };

  const UserCard = ({ item, showActions = false, showMessage = false }) => {
    const userData = item.user || item;
    
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 hover:shadow-md transition-shadow">
        <div className="flex items-start gap-4">
          <div 
            onClick={() => navigate(`/profile/${userData.id}`)}
            className="w-14 h-14 bg-gradient-to-br from-blue-500 to-purple-500 rounded-xl flex items-center justify-center text-white text-lg font-bold flex-shrink-0 cursor-pointer"
          >
            {userData.profile_picture ? (
              <img src={userData.profile_picture} alt={userData.full_name} className="w-full h-full rounded-xl object-cover" />
            ) : (
              userData.full_name.charAt(0)
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 
              onClick={() => navigate(`/profile/${userData.id}`)}
              className="font-semibold text-gray-800 hover:text-blue-600 cursor-pointer truncate"
            >
              {userData.full_name}
            </h3>
            {userData.headline && (
              <p className="text-sm text-gray-600 truncate">{userData.headline}</p>
            )}
            
            <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <GraduationCap className="w-3 h-3" />
                {userData.college}
              </div>
              {userData.department && (
                <div className="flex items-center gap-1">
                  <Briefcase className="w-3 h-3" />
                  {userData.department}
                </div>
              )}
            </div>

            {userData.skills && userData.skills.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {userData.skills.slice(0, 2).map((skill, idx) => (
                  <span key={idx} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                    {skill}
                  </span>
                ))}
                {userData.skills.length > 2 && (
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                    +{userData.skills.length - 2}
                  </span>
                )}
              </div>
            )}

            {showMessage && item.connection?.message && (
              <p className="text-sm text-gray-600 mt-2 italic">"{item.connection.message}"</p>
            )}

            {showActions && (
              <div className="flex gap-2 mt-3">
                {showActions === 'received' && (
                  <>
                    <button
                      onClick={() => handleAccept(item.connection.id)}
                      className="flex-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleReject(item.connection.id)}
                      className="flex-1 px-3 py-1.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
                    >
                      Decline
                    </button>
                  </>
                )}
                {showActions === 'suggestion' && (
                  <button
                    onClick={() => handleSendRequest(userData.id)}
                    className="w-full px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                  >
                    Connect
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-2">My Network</h1>
            <p className="text-gray-600">Manage your connections and grow your network</p>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            <Home className="w-5 h-5" />
            Dashboard
          </button>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 mb-6">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('connected')}
              className={`flex-1 px-6 py-4 font-medium transition-colors ${
                activeTab === 'connected'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <UserCheck className="w-5 h-5" />
                Connections ({connections.length})
              </div>
            </button>
            <button
              onClick={() => setActiveTab('received')}
              className={`flex-1 px-6 py-4 font-medium transition-colors ${
                activeTab === 'received'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Clock className="w-5 h-5" />
                Received ({receivedRequests.length})
              </div>
            </button>
            <button
              onClick={() => setActiveTab('sent')}
              className={`flex-1 px-6 py-4 font-medium transition-colors ${
                activeTab === 'sent'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Clock className="w-5 h-5" />
                Sent ({sentRequests.length})
              </div>
            </button>
            <button
              onClick={() => setActiveTab('suggestions')}
              className={`flex-1 px-6 py-4 font-medium transition-colors ${
                activeTab === 'suggestions'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <Users className="w-5 h-5" />
                Suggestions ({suggestions.length})
              </div>
            </button>
          </div>

          <div className="p-6">
            {/* Connected Tab */}
            {activeTab === 'connected' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {connections.length === 0 ? (
                  <div className="col-span-2 text-center py-12">
                    <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No connections yet</p>
                    <p className="text-sm text-gray-400 mt-2">Start connecting with people to grow your network!</p>
                  </div>
                ) : (
                  connections.map((item) => <UserCard key={item.connection.id} item={item} />)
                )}
              </div>
            )}

            {/* Received Requests Tab */}
            {activeTab === 'received' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {receivedRequests.length === 0 ? (
                  <div className="col-span-2 text-center py-12">
                    <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No pending requests</p>
                  </div>
                ) : (
                  receivedRequests.map((item) => (
                    <UserCard key={item.connection.id} item={item} showActions="received" showMessage />
                  ))
                )}
              </div>
            )}

            {/* Sent Requests Tab */}
            {activeTab === 'sent' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sentRequests.length === 0 ? (
                  <div className="col-span-2 text-center py-12">
                    <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No sent requests</p>
                  </div>
                ) : (
                  sentRequests.map((item) => (
                    <UserCard key={item.connection.id} item={item} showMessage />
                  ))
                )}
              </div>
            )}

            {/* Suggestions Tab */}
            {activeTab === 'suggestions' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {suggestions.length === 0 ? (
                  <div className="col-span-2 text-center py-12">
                    <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No suggestions available</p>
                  </div>
                ) : (
                  suggestions.map((person) => (
                    <UserCard key={person.id} item={person} showActions="suggestion" />
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Connections;
