import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import { Users, Clock, CheckCircle, GraduationCap, Briefcase, Target, MessageSquare } from 'lucide-react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Mentorships = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('active');
  const [activeMentorships, setActiveMentorships] = useState([]);
  const [receivedRequests, setReceivedRequests] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [activeRes, receivedRes, sentRes] = await Promise.all([
        axios.get(`${API}/mentorship/active`),
        axios.get(`${API}/mentorship/requests/received`),
        axios.get(`${API}/mentorship/requests/sent`)
      ]);
      
      setActiveMentorships(activeRes.data);
      setReceivedRequests(receivedRes.data);
      setSentRequests(sentRes.data);
    } catch (err) {
      console.error('Failed to load mentorships:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (mentorshipId) => {
    try {
      await axios.put(`${API}/mentorship/${mentorshipId}/accept`);
      loadData();
    } catch (err) {
      alert('Failed to accept request');
    }
  };

  const handleReject = async (mentorshipId) => {
    try {
      await axios.put(`${API}/mentorship/${mentorshipId}/reject`);
      loadData();
    } catch (err) {
      alert('Failed to reject request');
    }
  };

  const handleComplete = async (mentorshipId) => {
    if (window.confirm('Mark this mentorship as completed?')) {
      try {
        await axios.put(`${API}/mentorship/${mentorshipId}/complete`);
        loadData();
      } catch (err) {
        alert('Failed to complete mentorship');
      }
    }
  };

  const MentorshipCard = ({ item, showActions = false, showGoals = true }) => {
    const userData = item.user;
    const mentorshipData = item.mentorship;
    const isStudent = mentorshipData.student_id === user.id;
    
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
        <div className="flex items-start gap-4 mb-4">
          <div 
            onClick={() => navigate(`/profile/${userData.id}`)}
            className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center text-white text-lg font-bold flex-shrink-0 cursor-pointer"
          >
            {userData.profile_picture ? (
              <img src={userData.profile_picture} alt={userData.full_name} className="w-full h-full rounded-xl object-cover" />
            ) : (
              userData.full_name.charAt(0)
            )}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <div>
                <h3 
                  onClick={() => navigate(`/profile/${userData.id}`)}
                  className="font-semibold text-gray-800 hover:text-blue-600 cursor-pointer"
                >
                  {userData.full_name}
                </h3>
                {userData.headline && (
                  <p className="text-sm text-gray-600 truncate">{userData.headline}</p>
                )}
              </div>
              <span className={`px-2 py-1 rounded text-xs font-medium ${
                isStudent ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
              }`}>
                {isStudent ? 'Mentor' : 'Mentee'}
              </span>
            </div>
            
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
          </div>
        </div>

        {showGoals && mentorshipData.goals && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            <div className="flex items-start gap-2">
              <Target className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-blue-800 mb-1">Learning Goals</p>
                <p className="text-sm text-blue-900">{mentorshipData.goals}</p>
              </div>
            </div>
          </div>
        )}

        {mentorshipData.message && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <div className="flex items-start gap-2">
              <MessageSquare className="w-4 h-4 text-gray-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-gray-700 italic">"{mentorshipData.message}"</p>
            </div>
          </div>
        )}

        {userData.skills && userData.skills.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-4">
            {userData.skills.slice(0, 3).map((skill, idx) => (
              <span key={idx} className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                {skill}
              </span>
            ))}
            {userData.skills.length > 3 && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                +{userData.skills.length - 3}
              </span>
            )}
          </div>
        )}

        {showActions === 'received' && (
          <div className="flex gap-2">
            <button
              onClick={() => handleAccept(mentorshipData.id)}
              className="flex-1 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium"
            >
              Accept
            </button>
            <button
              onClick={() => handleReject(mentorshipData.id)}
              className="flex-1 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
            >
              Decline
            </button>
          </div>
        )}

        {showActions === 'active' && (
          <button
            onClick={() => handleComplete(mentorshipData.id)}
            className="w-full px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
          >
            Mark as Completed
          </button>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">My Mentorships</h1>
          <p className="text-gray-600">Manage your mentorship journey</p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 mb-6">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('active')}
              className={`flex-1 px-6 py-4 font-medium transition-colors ${
                activeTab === 'active'
                  ? 'text-purple-600 border-b-2 border-purple-600'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <CheckCircle className="w-5 h-5" />
                Active ({activeMentorships.length})
              </div>
            </button>
            {user.role === 'alumni' && (
              <button
                onClick={() => setActiveTab('received')}
                className={`flex-1 px-6 py-4 font-medium transition-colors ${
                  activeTab === 'received'
                    ? 'text-purple-600 border-b-2 border-purple-600'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Clock className="w-5 h-5" />
                  Requests ({receivedRequests.length})
                </div>
              </button>
            )}
            {user.role === 'student' && (
              <button
                onClick={() => setActiveTab('sent')}
                className={`flex-1 px-6 py-4 font-medium transition-colors ${
                  activeTab === 'sent'
                    ? 'text-purple-600 border-b-2 border-purple-600'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Clock className="w-5 h-5" />
                  Pending ({sentRequests.length})
                </div>
              </button>
            )}
          </div>

          <div className="p-6">
            {/* Active Mentorships Tab */}
            {activeTab === 'active' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {activeMentorships.length === 0 ? (
                  <div className="col-span-2 text-center py-12">
                    <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No active mentorships</p>
                    <p className="text-sm text-gray-400 mt-2">
                      {user.role === 'student' 
                        ? 'Find a mentor to get started with your learning journey!'
                        : 'Accept mentorship requests to start guiding students!'}
                    </p>
                    {user.role === 'student' && (
                      <button
                        onClick={() => navigate('/find-mentors')}
                        className="mt-4 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                      >
                        Find Mentors
                      </button>
                    )}
                  </div>
                ) : (
                  activeMentorships.map((item) => (
                    <MentorshipCard key={item.mentorship.id} item={item} showActions="active" />
                  ))
                )}
              </div>
            )}

            {/* Received Requests Tab */}
            {activeTab === 'received' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {receivedRequests.length === 0 ? (
                  <div className="col-span-2 text-center py-12">
                    <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No pending requests</p>
                  </div>
                ) : (
                  receivedRequests.map((item) => (
                    <MentorshipCard key={item.mentorship.id} item={item} showActions="received" />
                  ))
                )}
              </div>
            )}

            {/* Sent Requests Tab */}
            {activeTab === 'sent' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {sentRequests.length === 0 ? (
                  <div className="col-span-2 text-center py-12">
                    <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-gray-500">No pending requests</p>
                    <button
                      onClick={() => navigate('/find-mentors')}
                      className="mt-4 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                    >
                      Find Mentors
                    </button>
                  </div>
                ) : (
                  sentRequests.map((item) => (
                    <MentorshipCard key={item.mentorship.id} item={item} showGoals={true} />
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

export default Mentorships;
